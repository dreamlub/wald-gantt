import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ParsedMessage } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getApiKey } from '@/lib/workspace-api-keys'
import { addDaysYMD } from '@/lib/kst'
import type { WeeklyReportSummary, WeeklyReportItem, WeeklyDiffSummary } from '@/types/index'

// AI 추출용 스키마 - change/prev 필드 없이 순수 추출만
const ExtractedItemSchema = z.object({
  type:      z.enum(['issue', 'decision', 'plan']),
  title:     z.string(),
  detail:    z.string(),
  date:      z.string().nullable(),
  brand:     z.string().nullable(),
  assignee:  z.string().nullable(),
  task_type: z.string().nullable(),
  status:    z.string().nullable(),
})

const ExtractedReportSchema = z.object({
  items:   z.array(ExtractedItemSchema),
  summary: z.string(),
})

const InsightNarrativeSchema = z.object({
  headline: z.string(),
  changes:  z.string(),
})

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

function subtractWeek(dateStr: string): string {
  return addDaysYMD(dateStr, -7)
}

function countItems(summaries: WeeklyReportSummary[], type: string): number {
  return summaries.reduce((sum, r) => sum + r.items.filter(it => it.type === type).length, 0)
}

function buildDiffSummary(
  currItems: WeeklyReportItem[],
  prevItems: WeeklyReportItem[],
  droppedItems: WeeklyReportItem[],
): WeeklyDiffSummary {
  return {
    new:           currItems.filter(it => it.change === 'new').length,
    completed:     currItems.filter(it => it.change === 'completed').length,
    continued:     currItems.filter(it => it.change === 'continued').length,
    blocked:       currItems.filter(it => it.change === 'blocked').length,
    dropped:       droppedItems.length,
    dropped_items: droppedItems.length > 0 ? droppedItems : undefined,
  }
}

/** 브랜드/제목 기반 코드 매칭으로 change 값 결정 */
function normalizeKey(s: string): string {
  return s.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '')
}

function matchKey(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const na = normalizeKey(a)
  const nb = normalizeKey(b)
  if (na === nb) return true
  // 한쪽이 다른쪽을 포함하면 같은 브랜드로 간주 (예: "백억" ↔ "백억커피")
  return na.includes(nb) || nb.includes(na)
}

function applyDiff(
  currItems: z.infer<typeof ExtractedItemSchema>[],
  prevItems: WeeklyReportItem[],
): WeeklyReportItem[] {
  return currItems.map(curr => {
    const matched = prevItems.find(prev =>
      matchKey(curr.brand, prev.brand) ||
      (!curr.brand && !prev.brand && matchKey(curr.title, prev.title))
    )

    if (!matched) {
      return { ...curr, change: 'new' as const, prev_status: null, prev_title: null, block_reason: null }
    }

    const change = curr.status === 'completed' ? 'completed' as const
                 : curr.status === 'blocked'   ? 'blocked'   as const
                 : 'continued' as const

    return {
      ...curr,
      change,
      prev_status:  matched.status ?? null,
      prev_title:   matched.title !== curr.title ? matched.title : null,
      block_reason: null,
    }
  })
}

function findDropped(
  currItems: z.infer<typeof ExtractedItemSchema>[],
  prevItems: WeeklyReportItem[],
): WeeklyReportItem[] {
  return prevItems
    .filter(prev => !currItems.some(curr =>
      matchKey(curr.brand, prev.brand) ||
      (!curr.brand && !prev.brand && matchKey(curr.title, prev.title))
    ))
    .map(prev => ({
      ...prev,
      change: 'dropped' as const,
      detail: `전주 ${prev.status ?? '진행중'} 상태였으나 이번 주 언급 없음`,
    }))
}

type DbReport = {
  id: string
  team: string
  author: string | null
  source: string
  week_start: string
  raw_content: string | null
  summary: unknown
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
      "status": "in_progress|completed|blocked|pending 중 하나 또는 null"
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

        // 분석 윈도우: 목표 주차 + 전주 비교에 필요한 직전 주차들만.
        // 전체 과거를 매번 재분석하면 데이터 누적 시 Claude 호출 수·지연이 무한정 증가하므로
        // 최근 ANALYZE_WEEKS_WINDOW 주로 제한한다 (전주 diff 정확성은 윈도우 내에서 보장).
        const ANALYZE_WEEKS_WINDOW = 8
        const windowStart = (() => {
          let d = week_start
          for (let i = 0; i < ANALYZE_WEEKS_WINDOW; i++) d = subtractWeek(d)
          return d
        })()

        // 윈도우 범위의 보고서를 오래된 순으로 가져옴
        const { data: allReports, error: fetchErr } = await sb
          .from('weekly_reports')
          .select('*')
          .eq('workspace_id', workspaceId)
          .gte('week_start', windowStart)
          .lte('week_start', week_start)
          .order('week_start', { ascending: true })

        if (fetchErr) throw fetchErr
        if (!allReports || allReports.length === 0) {
          send('error', { message: '해당 주 보고서 데이터가 없습니다.' })
          return
        }

        // 주차별로 그룹핑
        const weekMap = new Map<string, DbReport[]>()
        for (const r of allReports) {
          const wk = r.week_start as string
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

          for (let i = 0; i < reports.length; i++) {
            const report = reports[i]
            if (report.author) currAuthors.add(report.author)

            const prevItems = prevTeamMap.get(report.team)?.items ?? []

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
