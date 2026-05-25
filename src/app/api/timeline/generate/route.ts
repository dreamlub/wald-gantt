import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const TimelineCardSchema = z.object({
  brand_name:        z.string(),
  topic:             z.string(),
  summary:           z.string(),
  item_count:        z.number(),
  key_tags:          z.array(z.string()),
  max_priority:      z.enum(['high', 'medium', 'low']),
  thread_id:         z.string().uuid().optional(),
  parent_thread_ids: z.array(z.string().uuid()).optional(),
})

const TimelineResponseSchema = z.object({
  cards: z.array(TimelineCardSchema),
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

const SYSTEM_PROMPT = `당신은 발트루스트 DX팀의 주간 타임라인 생성기입니다.
발트루스트는 외식·유통 브랜드의 디지털 전환을 돕는 에이전시이며, DX팀은 클라이언트별 슬랙 채널을 통해 이슈를 수집하고 주간 단위로 정리합니다.

[역할]
데일리 리포트(월~금)를 종합해 브랜드별·주제별 "타임라인 카드"를 생성합니다. 단순 나열이 아니라 "이번 주 이 브랜드는 어떤 국면에 있는가"를 추론·분석합니다.

[카드 분리 원칙]
- 같은 브랜드라도 주제가 다르면 별도 카드 (예: "더리터 — POS 안정성", "더리터 — 브랜드 요청")
- 하나의 카드에 여러 주제를 합치지 않는다

[2주 흐름 판단]
이전 2주 타임라인을 참조해 지속·악화·해소·신규 여부를 판단한다.
- 2주 연속 등장한 이슈 → "장기화" 또는 "반복" 표현 사용
- 이전 주에 있다가 이번 주 해소됨 → summary에 "해소" 명시
- 이번 주 처음 등장 → 신규로 판단

[thread_id 규칙]
이전 2주 타임라인의 thread_id를 참조해 아래 5가지 케이스를 판단:

1. 이월: 직전 주와 같은 브랜드+같은 주제 계속됨 → 직전 주 card의 thread_id를 그대로 사용
2. 신규: 이번 주 처음 등장, 이전 이슈와 관계 없음 → thread_id 생략
3. 분기: 하나의 이슈에서 여러 세부 이슈로 갈라짐 → thread_id 생략, parent_thread_ids에 부모 thread_id 배열
4. 인과: 이전 이슈가 직접 원인("~로 인해", "~에서 비롯된") → thread_id 생략, parent_thread_ids에 원인 thread_id 배열
5. 재발: 이전에 해소된 이슈가 1주+ 공백 후 재등장 → thread_id 생략, parent_thread_ids에 이전 해소 thread_id 배열

이월 판단은 엄격: 브랜드명+topic이 실질적으로 동일할 때만.

[summary 작성]
- 추론·분석 중심 서술형 텍스트
- 중요 키워드는 **볼드** (반드시 쌍으로, 홀수 * 금지)
- 주제 전환 시 개행으로 문단 분리

[출력 규칙]
- 반드시 한국어
- 설명·마크다운 코드블록 없이 순수 JSON만 반환
- key_tags: issue, decision, mention, schedule 중 해당하는 것들
- max_priority: 해당 주제의 최고 우선순위 (high > medium > low)`

const JSON_SCHEMA = `{
  "cards": [
    {
      "brand_name": "브랜드명",
      "topic": "주제 키워드 (50자 이내)",
      "summary": "추론 포함 서술형 텍스트. **키워드** 볼드.",
      "item_count": 3,
      "key_tags": ["issue", "decision"],
      "max_priority": "high|medium|low",
      "thread_id": "직전 주 카드의 UUID (이월인 경우만)",
      "parent_thread_ids": ["부모 UUID (분기/인과/재발인 경우만)"]
    }
  ]
}`

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
        send('status', { message: '데일리 리포트 조회 중...' })

        const sb = await createClient()
        const workspaceId = await getWorkspaceId(sb)

        const monday = new Date(week_start + 'T00:00:00')
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        const weekEnd = sunday.toISOString().slice(0, 10)

        // 해당 주 데일리 리포트
        const { data: dailyReports, error: drErr } = await sb
          .from('daily_reports')
          .select('report_date, content')
          .eq('workspace_id', workspaceId)
          .gte('report_date', week_start)
          .lte('report_date', weekEnd)
          .order('report_date')

        if (drErr) throw drErr

        if (!dailyReports || dailyReports.length === 0) {
          send('error', { message: `${week_start} 주에 데일리 리포트가 없습니다.` })
          controller.close()
          return
        }

        send('status', { message: `데일리 리포트 ${dailyReports.length}건 확인. 이전 타임라인 조회 중...` })

        // 이전 2주 타임라인 (thread_id 이월 판단용)
        const prev2Monday = new Date(monday)
        prev2Monday.setDate(monday.getDate() - 14)
        const prevMonday = new Date(monday)
        prevMonday.setDate(monday.getDate() - 7)

        const { data: prevTimeline } = await sb
          .from('weekly_brand_summaries')
          .select('brand_name, topic, summary, week_start, thread_id, parent_thread_ids, max_priority, key_tags')
          .eq('workspace_id', workspaceId)
          .in('week_start', [
            prev2Monday.toISOString().slice(0, 10),
            prevMonday.toISOString().slice(0, 10),
          ])
          .order('week_start')
          .order('brand_name')

        send('status', { message: `AI 타임라인 생성 중... (데일리 리포트 ${dailyReports.length}건, 이전 타임라인 ${prevTimeline?.length ?? 0}건)` })

        const userPrompt = buildUserPrompt(week_start, dailyReports, prevTimeline ?? [])

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 16384,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        })

        send('status', { message: '응답 파싱 중...' })

        const raw = (message.content[0] as { type: string; text: string }).text.trim()
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('Claude did not return valid JSON')

        const repaired = jsonMatch[0].replace(
          /"((?:[^"\\]|\\.)*)"/g,
          (_m, inner: string) => `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`
        )

        let jsonParsed: unknown
        try {
          jsonParsed = JSON.parse(repaired)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          throw new Error(`JSON 파싱 실패: ${msg}`)
        }

        const parsed = TimelineResponseSchema.safeParse(jsonParsed)
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join(' | ')
          throw new Error(`응답 형식 오류: ${issues}`)
        }

        const { cards } = parsed.data

        send('status', { message: `${cards.length}개 카드 저장 중...` })

        // 기존 해당 주 데이터 삭제 (재생성 지원)
        await sb
          .from('weekly_brand_summaries')
          .delete()
          .eq('workspace_id', workspaceId)
          .eq('week_start', week_start)

        // 새 카드 삽입
        const rows = cards.map((card: z.infer<typeof TimelineCardSchema>) => ({
          workspace_id: workspaceId,
          week_start,
          brand_name: card.brand_name,
          topic: card.topic,
          summary: card.summary,
          item_count: card.item_count,
          key_tags: card.key_tags,
          max_priority: card.max_priority,
          ...(card.thread_id ? { thread_id: card.thread_id } : {}),
          ...(card.parent_thread_ids?.length ? { parent_thread_ids: card.parent_thread_ids } : {}),
        }))

        const { error: insertErr } = await sb
          .from('weekly_brand_summaries')
          .insert(rows)

        if (insertErr) throw insertErr

        send('result', { cards_count: cards.length, week_start })
      } catch (err) {
        console.error('[timeline/generate]', err)
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

function buildUserPrompt(
  weekStart: string,
  dailyReports: { report_date: string; content: unknown }[],
  prevTimeline: { brand_name: string; topic: string; summary: string; week_start: string; thread_id: string; parent_thread_ids: string[] | null; max_priority: string | null; key_tags: string[] | null }[],
): string {
  const prev = prevTimeline.length > 0
    ? `이전 2주 타임라인:\n${JSON.stringify(prevTimeline, null, 2)}`
    : '이전 2주 타임라인: 없음 (첫 주)'

  const reports = dailyReports.map(r =>
    `### ${r.report_date}\n${JSON.stringify(r.content, null, 2)}`
  ).join('\n\n')

  return `${prev}

---

이번 주(${weekStart}) 데일리 리포트:

${reports}

---

위 데이터를 기반으로 이번 주 타임라인 카드를 생성하세요.
- 이전 2주 thread_id를 확인해 이월/신규/분기/인과/재발을 정확히 판단
- thread_id를 제공하는 경우는 "이월"인 경우만 (직전 주 동일 주제의 UUID)
- parent_thread_ids는 분기/인과/재발인 경우만
- 신규는 thread_id, parent_thread_ids 모두 생략

아래 JSON 형식만 반환하세요:
${JSON_SCHEMA}`
}
