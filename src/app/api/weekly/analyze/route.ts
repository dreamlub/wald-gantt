import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { WeeklyReportSummary } from '@/types/index'

const ReportSummarySchema = z.object({
  items: z.array(z.object({
    type: z.enum(['issue', 'decision', 'plan']),
    title: z.string(),
    detail: z.string(),
    date: z.string().nullable(),
    brand: z.string().nullable(),
  })),
  summary: z.string(),
})

const InsightNarrativeSchema = z.object({
  headline: z.string(),
  changes: z.string(),
})

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
        const prevWeekStart = subtractWeek(week_start)

        send('status', { message: '주간 보고서 조회 중...' })

        const [{ data: reports, error: currErr }, { data: prevReports, error: prevErr }] = await Promise.all([
          sb.from('weekly_reports').select('*').eq('workspace_id', workspaceId).eq('week_start', week_start),
          sb.from('weekly_reports').select('*').eq('workspace_id', workspaceId).eq('week_start', prevWeekStart),
        ])
        if (currErr) throw currErr
        if (prevErr) throw prevErr

        if (!reports || reports.length === 0) {
          send('error', { message: '해당 주 보고서 데이터가 없습니다.' })
          return
        }

        // Phase 1: per-report summarization (skip if summary already exists)
        const currSummaries: WeeklyReportSummary[] = []
        const currAuthors = new Set<string>()

        for (let i = 0; i < reports.length; i++) {
          const report = reports[i]
          if (report.author) currAuthors.add(report.author)

          if (report.summary) {
            currSummaries.push(report.summary as WeeklyReportSummary)
            continue
          }

          if (!report.raw_content) {
            currSummaries.push({ items: [], summary: '' })
            continue
          }

          send('status', { message: `보고서 분석 중... (${i + 1}/${reports.length}: ${report.team})` })

          const userPrompt = `다음 주간 보고서를 분석하여 이슈, 결정사항, 계획을 추출하세요.

[팀: ${report.team}, 작성자: ${report.author ?? '미상'}, 출처: ${report.source}]
${report.raw_content}

JSON 형식만 반환:
{
  "items": [
    { "type": "issue|decision|plan", "title": "30자 이내", "detail": "상세 내용 1~2문장", "date": "날짜 언급 시 YYYY-MM-DD 형식, 없으면 null", "brand": "관련 브랜드명 또는 null" }
  ],
  "summary": "핵심 내용 2~3문장 요약"
}`

          const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            messages: [{ role: 'user', content: userPrompt }],
          })

          const raw = (message.content[0] as { type: string; text: string }).text.trim()
          const jsonMatch = raw.match(/\{[\s\S]*\}/)
          if (!jsonMatch) throw new Error(`보고서 분석 실패 (${report.team}): JSON 응답 없음`)

          const parsed = ReportSummarySchema.safeParse(JSON.parse(jsonMatch[0]))
          if (!parsed.success) {
            const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' | ')
            throw new Error(`보고서 형식 오류 (${report.team}): ${issues}`)
          }

          const summaryData = parsed.data
          await sb
            .from('weekly_reports')
            .update({ summary: summaryData, updated_at: new Date().toISOString() })
            .eq('id', report.id)

          currSummaries.push(summaryData)
        }

        // Phase 2: aggregate insight generation
        send('status', { message: '종합 인사이트 생성 중...' })

        const prevSummaries: WeeklyReportSummary[] = (prevReports ?? [])
          .map(r => (r.summary as WeeklyReportSummary | null) ?? { items: [], summary: '' })

        const prevAuthors = new Set<string>(
          (prevReports ?? []).filter(r => r.author).map(r => r.author as string)
        )

        const stats = {
          authors:   { count: currAuthors.size,                     delta: currAuthors.size - prevAuthors.size },
          issues:    { count: countItems(currSummaries, 'issue'),    delta: countItems(currSummaries, 'issue') - countItems(prevSummaries, 'issue') },
          decisions: { count: countItems(currSummaries, 'decision'), delta: countItems(currSummaries, 'decision') - countItems(prevSummaries, 'decision') },
          plans:     { count: countItems(currSummaries, 'plan'),     delta: countItems(currSummaries, 'plan') - countItems(prevSummaries, 'plan') },
        }

        const allSummaryText = reports
          .map((r, i) => {
            const s = currSummaries[i]
            if (!s.summary && s.items.length === 0) return null
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

        const insightParsed = InsightNarrativeSchema.safeParse(JSON.parse(insightMatch[0]))
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
