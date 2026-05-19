import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { WeeklyReportSummary, WeeklyReportItem, WeeklyDiffSummary } from '@/types/index'

// AI 추출용 스키마 - change/prev 필드 없이 순수 추출만
const ExtractedItemSchema = z.object({
  type:      z.enum(['issue', 'decision', 'plan']).catch('plan'),
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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** JSON 문자열 내부의 리터럴 줄바꿈/탭을 이스케이프 처리 */
function repairJson(raw: string): string {
  let inString = false
  let escape = false
  let result = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (escape) {
      result += ch
      escape = false
      continue
    }
    if (ch === '\\') { escape = true; result += ch; continue }
    if (ch === '"') { inString = !inString; result += ch; continue }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') { result += '\\r'; continue }
      if (ch === '\t') { result += '\\t'; continue }
    }
    result += ch
  }
  return result
}

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
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
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
  prevWeekStart: string,
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

  let message: Awaited<ReturnType<typeof anthropic.messages.create>> | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
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

  const raw = (message.content[0] as { type: string; text: string }).text.trim()
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`보고서 분석 실패 (${report.team}): JSON 응답 없음`)
  const repaired = repairJson(jsonMatch[0])

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(repaired)
  } catch (e) {
    console.error(`[analyze] JSON parse error (${report.team}):`, e)
    console.error(`[analyze] stop_reason:`, message.stop_reason)
    console.error(`[analyze] raw tail:`, raw.slice(-300))
    throw new Error(`보고서 JSON 파싱 실패 (${report.team}): ${e instanceof Error ? e.message : String(e)}`)
  }

  const parsed = ExtractedReportSchema.safeParse(parsedJson)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' | ')
    throw new Error(`보고서 형식 오류 (${report.team}): ${issues}`)
  }

  // 코드 기반 전주 비교
  const enrichedItems = applyDiff(parsed.data.items, prevItems)
  const droppedItems  = findDropped(parsed.data.items, prevItems)

  const summaryData: WeeklyReportSummary = {
    items: enrichedItems,
    summary: parsed.data.summary,
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

        send('status', { message: '주간 보고서 조회 중...' })

        // 요청 주차 이하의 모든 보고서를 오래된 순으로 가져옴
        const { data: allReports, error: fetchErr } = await sb
          .from('weekly_reports')
          .select('*')
          .eq('workspace_id', workspaceId)
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

            const summaryData = await analyzeReport(sb, report, prevItems, wk, prevWk)
            currTeamMap.set(report.team, summaryData)
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

        const insightMsg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: insightPrompt }],
        })

        const insightRaw = (insightMsg.content[0] as { type: string; text: string }).text.trim()
        const insightMatch = insightRaw.match(/\{[\s\S]*\}/)
        if (!insightMatch) throw new Error('인사이트 JSON 응답 없음')

        const insightParsed = InsightNarrativeSchema.safeParse(JSON.parse(repairJson(insightMatch[0])))
        if (!insightParsed.success) throw new Error('인사이트 형식 오류')

        const content = {
          headline: insightParsed.data.headline,
          stats,
          changes: insightParsed.data.changes,
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
