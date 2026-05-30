import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ParsedMessage } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getApiKey } from '@/lib/workspace-api-keys'
import type { WeeklyReportSummary, WeeklyReportItem } from '@/types/index'
import {
  ExtractedItemSchema, ExtractedReportSchema, InsightNarrativeSchema,
  DbReport, subtractWeek, weekEndOf, getMondayOf,
  countItems, buildDiffSummary, applyDiff, findDropped,
} from './_lib/analyze-helpers'

// anthropic client는 요청마다 워크스페이스 키로 생성

async function getWorkspaceId(sb: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!member) throw new Error('No workspace found')
  return member.workspace_id
}

/** 단일 보고서를 AI로 분석해 summary 반환 및 DB 저장 */
async function analyzeReport(
  sb: Awaited<ReturnType<typeof createClient>>,
  report: DbReport,
  prevItems: WeeklyReportItem[],
  weekStart: string,
  anthropic: Anthropic,
): Promise<WeeklyReportSummary> {
  if (!report.raw_content) {
    return { items: [], summary: '', diff_summary: buildDiffSummary([], prevItems, prevItems) }
  }

  const userPrompt = `다음 주간 보고서에서 이슈, 결정사항, 계획 아이템을 추출하세요.

목표는 "주간 보고를 읽고 실제 실행 태스크 후보를 안정적으로 뽑는 것"입니다.
단순 공유·완료 보고·이미 확정된 결정은 action_required=false로 두고, 담당자가 실제로 확인/작성/협의/개발/회신/모니터링해야 하는 항목만 action_required=true로 판단하세요.

action_required=true 기준:
- 아직 완료되지 않은 이슈, 검토, 외부협의, 회신 대기, 개발/기획 예정
- 일정이 임박했거나 담당자가 명시된 follow-up
- 장애/CS/브랜드 요청처럼 후속 조치가 필요한 항목

action_required=false 기준:
- 완료 보고, 단순 현황 공유, 참고용 시장조사
- 이미 결정만 기록하면 되는 사항
- 태스크가 아니라 일정 캘린더 항목으로만 관리할 내용

=== 보고서 (${weekStart}) ===
[팀: ${report.team}, 작성자: ${report.author ?? '미상'}]
${report.raw_content}

JSON 형식만 반환:
{
  "items": [
    {
      "type": "issue|decision|plan",
      "title": "30자 이내 제목",
      "detail": "상세 내용 1~2문장",
      "date": "YYYY-MM-DD 또는 null",
      "brand": "관련 브랜드명 또는 null",
      "assignee": "담당자/팀원명 또는 null",
      "task_type": "기획|개발|디자인|마케팅|운영|검토|외부협의|이슈|기타 중 하나 또는 null",
      "status": "in_progress|completed|blocked|pending 중 하나 또는 null",
      "action_required": true,
      "task_title": "action_required=true일 때 바로 태스크로 만들 40자 이내 제목, 아니면 null",
      "task_memo": "action_required=true일 때 배경/근거/필요 조치를 담은 메모, 아니면 null",
      "due_date": "명시된 마감/미팅/배포일이 있으면 YYYY-MM-DD, 아니면 null",
      "estimated_minutes": 15|30|60|90|120|null
    }
  ],
  "summary": "핵심 내용 2~3문장 요약"
}`

  // Structured outputs로 스키마를 강제 → 정규식 추출·repairJson 불필요
  let message: ParsedMessage<z.infer<typeof ExtractedReportSchema>> | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      message = await anthropic.messages.parse({
        model: 'claude-haiku-4-5-20251001',
        // 브랜드가 많은 보고서(예: Biz Lead Weekly Board)는 추출 아이템이 많아 출력이 길다. 충분히 상향.
        max_tokens: 16000,
        output_config: { format: zodOutputFormat(ExtractedReportSchema) },
        messages: [{ role: 'user', content: userPrompt }],
      })
      break
    } catch (e: unknown) {
      const status = (e as { status?: number }).status
      if (status === 529 && attempt < 3) {
        await new Promise(r => setTimeout(r, 5000 * attempt))
        continue
      }
      throw e
    }
  }
  if (!message) throw new Error(`보고서 분석 실패 (${report.team}): API 재시도 초과`)

  // structured outputs도 토큰 한계로 잘리면 parsed_output이 비므로 명확히 알린다
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`보고서 분석 응답이 max_tokens(16000)로 잘렸습니다 (${report.team}). 보고 내용이 너무 길어 추출 아이템이 많습니다 — 보고서 분할이 필요합니다.`)
  }

  const data = message.parsed_output
  if (!data) {
    throw new Error(`보고서 분석 실패 (${report.team}): 구조화 출력 파싱 실패 (stop_reason=${message.stop_reason})`)
  }

  // 코드 기반 전주 비교
  const enrichedItems = applyDiff(data.items, prevItems)
  const droppedItems  = findDropped(data.items, prevItems)

  const summaryData: WeeklyReportSummary = {
    items: enrichedItems,
    summary: data.summary,
    diff_summary: buildDiffSummary(enrichedItems, prevItems, droppedItems),
  }

  await sb
    .from('weekly_reports')
    .update({ summary: summaryData, updated_at: new Date().toISOString() })
    .eq('id', report.id)

  return summaryData
}

export async function POST(req: NextRequest) {
  const { week_start } = await req.json() as { week_start: string }
  if (!week_start) {
    return new Response(JSON.stringify({ error: 'week_start required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        const sb = await createClient()
        const workspaceId = await getWorkspaceId(sb)
        const anthropicApiKey = await getApiKey(sb, workspaceId, 'anthropic', process.env.ANTHROPIC_API_KEY)
        if (!anthropicApiKey) {
          send('error', { message: 'Anthropic API 키 미설정. 설정 > API 키에서 등록해 주세요.' })
          return
        }
        const anthropic = new Anthropic({ apiKey: anthropicApiKey })

        send('status', { message: '주간 보고서 조회 중...' })

        // 2026년부터 목표 주차까지 전체를 diff 체인으로 처리.
        // 이전 주차는 summary 캐시 재사용이므로 Claude 호출은 목표 주차만 발생.
        const windowStart = '2026-01-01'
        const weekEnd = weekEndOf(week_start)

        // 윈도우 범위의 보고서를 오래된 순으로 가져옴.
        // weekly_reports.week_start는 원문 날짜라 월요일이 아닐 수 있으므로 목표 주의 일요일까지 조회한다.
        const { data: allReports, error: fetchErr } = await sb
          .from('weekly_reports')
          .select('*')
          .eq('workspace_id', workspaceId)
          .gte('week_start', windowStart)
          .lte('week_start', weekEnd)
          .order('week_start', { ascending: true })

        if (fetchErr) throw fetchErr
        if (!allReports || allReports.length === 0) {
          send('error', { message: '해당 주 보고서 데이터가 없습니다.' })
          return
        }

        // 주차별로 그룹핑
        const weekMap = new Map<string, DbReport[]>()
        for (const r of allReports) {
          const wk = getMondayOf(r.week_start as string)
          if (!weekMap.has(wk)) weekMap.set(wk, [])
          weekMap.get(wk)!.push(r as DbReport)
        }

        const allWeeks = [...weekMap.keys()].sort()

        // 항상 전체 체인을 오래된 순서로 재분석 (전주 비교 정확성 보장)
        const weeksToAnalyze = allWeeks

        // 주차별 summary 캐시: 이번 실행 결과를 다음 주차 비교에 즉시 반영
        const summaryCache = new Map<string, Map<string, WeeklyReportSummary>>()

        let targetWeekSummaries: WeeklyReportSummary[] = []
        let targetWeekReports: DbReport[] = []
        const failedReports: string[] = []   // 실패한 "주차/팀" 누적 → 사용자에게 경고

        // 순서대로 분석
        for (const wk of weeksToAnalyze) {
          const reports = weekMap.get(wk)!
          const prevWk = subtractWeek(wk)
          const prevTeamMap = summaryCache.get(prevWk) ?? new Map()

          const currTeamMap = new Map<string, WeeklyReportSummary>()
          const currAuthors = new Set<string>()

          const isTargetWeek = wk === week_start

          for (let i = 0; i < reports.length; i++) {
            const report = reports[i]
            if (report.author) currAuthors.add(report.author)

            const prevItems = prevTeamMap.get(report.team)?.items ?? []

            // 이전 주차에 이미 summary가 있으면 Claude 재호출 없이 캐시 재사용.
            // diff 체인은 summaryCache를 통해 유지된다.
            if (!isTargetWeek) {
              const cached = report.summary as WeeklyReportSummary | null
              if (cached?.items) {
                currTeamMap.set(report.team, cached)
                continue
              }
            }

            send('status', { message: `${wk} 분석 중... (${i + 1}/${reports.length}: ${report.team})` })

            // 한 팀의 분석이 실패해도(과부하·잘림·형식오류) 전체를 죽이지 않고 스킵.
            // 기존 DB summary가 있으면 fallback으로 사용해 전주 비교 체인을 유지한다.
            try {
              const summaryData = await analyzeReport(sb, report, prevItems, wk, anthropic)
              currTeamMap.set(report.team, summaryData)
            } catch (e) {
              console.error(`[weekly/analyze] 팀 분석 실패 — ${wk}/${report.team}:`, e)
              failedReports.push(`${wk}/${report.team}`)
              const cached = report.summary as WeeklyReportSummary | null
              if (cached?.items) currTeamMap.set(report.team, cached)
            }
          }

          summaryCache.set(wk, currTeamMap)

          if (wk === week_start) {
            targetWeekSummaries = [...currTeamMap.values()]
            targetWeekReports = reports
          }
        }

        // 목표 주차의 summaries가 이번 실행에서 분석되지 않은 경우 (이미 전부 있었던 경우)
        if (targetWeekSummaries.length === 0) {
          const teamMap = summaryCache.get(week_start) ?? new Map()
          targetWeekSummaries = [...teamMap.values()]
          targetWeekReports = weekMap.get(week_start) ?? []
        }

        // Phase 2: 목표 주차 종합 인사이트 생성
        send('status', { message: '종합 인사이트 생성 중...' })

        const prevWeekStart = subtractWeek(week_start)
        const prevTeamMap = summaryCache.get(prevWeekStart) ?? new Map()
        const prevSummaries = [...prevTeamMap.values()]

        const currAuthorsSet = new Set<string>(
          targetWeekReports.filter(r => r.author).map(r => r.author as string)
        )
        const prevAuthorsSet = new Set<string>(
          (weekMap.get(prevWeekStart) ?? []).filter(r => r.author).map(r => r.author as string)
        )

        const stats = {
          authors:   { count: currAuthorsSet.size,                          delta: currAuthorsSet.size - prevAuthorsSet.size },
          issues:    { count: countItems(targetWeekSummaries, 'issue'),      delta: countItems(targetWeekSummaries, 'issue') - countItems(prevSummaries, 'issue') },
          decisions: { count: countItems(targetWeekSummaries, 'decision'),   delta: countItems(targetWeekSummaries, 'decision') - countItems(prevSummaries, 'decision') },
          plans:     { count: countItems(targetWeekSummaries, 'plan'),       delta: countItems(targetWeekSummaries, 'plan') - countItems(prevSummaries, 'plan') },
        }

        const allSummaryText = targetWeekReports
          .map(r => {
            const s = summaryCache.get(week_start)?.get(r.team)
            if (!s || (!s.summary && s.items.length === 0)) return null
            const itemLines = s.items.map(it => `  - [${it.type}] ${it.title}: ${it.detail}`).join('\n')
            return `[${r.team}${r.author ? ` / ${r.author}` : ''}]\n${s.summary}${itemLines ? '\n' + itemLines : ''}`
          })
          .filter(Boolean)
          .join('\n\n')

        const insightPrompt = `다음은 ${week_start} 주간 보고서 요약입니다.

${allSummaryText}

이번 주 전체를 2~3문장으로 요약하는 headline과, 전주 대비 주목할 변화를 1~2문장으로 작성하는 changes를 JSON으로 반환하세요. 핵심 키워드는 **굵게** 표시하세요.

JSON 형식만 반환:
{
  "headline": "이번 주 전체 요약 2~3문장.",
  "changes": "전주 대비 주목할 변화 1~2문장."
}`

        const insightMsg = await anthropic.messages.parse({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          output_config: { format: zodOutputFormat(InsightNarrativeSchema) },
          messages: [{ role: 'user', content: insightPrompt }],
        })
        const insight = insightMsg.parsed_output
        if (!insight) throw new Error('인사이트 형식 오류 (구조화 출력 파싱 실패)')

        const content = {
          headline: insight.headline,
          stats,
          changes: insight.changes,
        }

        send('status', { message: '저장 중...' })

        const now = new Date().toISOString()
        const { data: upserted, error: upsertErr } = await sb
          .from('weekly_insights')
          .upsert(
            { workspace_id: workspaceId, week_start, content, analyzed_at: now },
            { onConflict: 'workspace_id,week_start' }
          )
          .select()
          .single()

        if (upsertErr) throw upsertErr

        // 일부 팀 분석이 실패했다면 결과는 내보내되 경고로 함께 알린다
        if (failedReports.length > 0) {
          send('warning', {
            message: `일부 보고서 분석에 실패해 제외되었습니다 (${failedReports.length}건): ${failedReports.join(', ')}`,
          })
        }
        send('result', upserted)
      } catch (err) {
        console.error('[weekly/analyze]', err)
        send('error', { message: err instanceof Error ? err.message : 'Internal error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
