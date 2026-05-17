import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const ActionItemSchema = z.object({
  id:            z.string(),
  severity:      z.enum(['urgent', 'watch', 'info']),
  title:         z.string(),
  brand:         z.string(),
  related_count: z.number(),
  summary:       z.string(),
  action:        z.string(),
})

const UpcomingItemSchema = z.object({
  date:     z.string(),
  title:    z.string(),
  brand:    z.string(),
  priority: z.enum(['high', 'medium', 'low']),
})

const PendingItemSchema = z.object({
  brand: z.string(),
  count: z.number(),
  items: z.string(),
})

const DecisionItemSchema = z.object({
  id:    z.string(),
  title: z.string(),
  desc:  z.string(),
  brand: z.string(),
})

const InsightContentSchema = z.object({
  headline:     z.string(),
  action_items: z.array(ActionItemSchema),
  upcoming:     z.array(UpcomingItemSchema),
  pending:      z.array(PendingItemSchema),
  decisions:    z.array(DecisionItemSchema),
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

const SYSTEM_PROMPT = `당신은 발트루스트 DX팀의 클라이언트 업무 인사이트 분석기입니다.
발트루스트는 외식·유통 브랜드의 디지털 전환을 돕는 에이전시이며, DX팀은 클라이언트별 슬랙 채널을 통해 이슈·요청·결정 사항을 수집하고 주간 단위로 정리합니다.

[태그 정의]
- issue: 해결이 필요한 문제 또는 장애
- decision: 합의·확정된 의사결정
- mention: 담당자를 직접 멘션한 긴급 요청
- in_progress: 현재 진행 중인 작업
- done: 완료된 작업
- schedule: 날짜가 확정된 일정

[severity 판단 기준]
- urgent: mention+issue 조합, 또는 priority=high — 24시간 내 대응
- watch: issue 단독, 또는 in_progress 중 응답 지연 — 이번 주 내 팔로업
- info: decision / done / schedule — 참고용

[body 구조]
각 항목의 body는 불릿(•) 3줄 구조입니다. 반드시 활용하세요:
- 1줄(•): 이 건이 발생한 맥락 (날짜·매장명·대상자 포함)
- 2줄(•): 구체적으로 일어난 일
- 3줄(•): 필요한 조치 또는 완료 표현

[pending 판단 기준]
author가 외부([브랜드명] prefix)이고, tags에 in_progress가 있으며, 내부 담당자의 후속 응답·결정이 확인되지 않는 항목만 포함합니다.

[출력 규칙]
- 반드시 한국어로 작성
- done 태그 항목은 action_items에 포함하지 말 것
- upcoming은 title 또는 body에 구체적인 날짜가 언급된 항목만
- related_count는 해당 action_item과 관련된 원본 메시지 수
- brand 필드에는 아래 제공되는 클라이언트 목록의 정확한 name 값을 그대로 사용
- 설명이나 마크다운 코드블록 없이 순수 JSON만 반환`

const JSON_SCHEMA = `{
  "headline": "이번 주를 2~3문장으로 요약. 주요 이슈와 진행 상황 포함. 핵심 키워드는 **굵게** 표시.",
  "action_items": [
    {
      "id": "a1",
      "severity": "urgent|watch|info",
      "title": "30자 이내",
      "brand": "클라이언트 name",
      "related_count": 1,
      "summary": "배경·현상 중심 2~3문장",
      "action": "액션 필드 우선 사용. 없으면 현상에서 도출."
    }
  ],
  "upcoming": [
    {
      "date": "MM/DD",
      "title": "30자 이내",
      "brand": "클라이언트 name",
      "priority": "high|medium|low"
    }
  ],
  "pending": [{"brand":"클라이언트 name","count":숫자,"items":"미응답 항목들 콤마 구분"}],
  "decisions": [
    {
      "id": "d1",
      "title": "30자 이내",
      "desc": "결정 배경 또는 내용 1~2문장",
      "brand": "클라이언트 name"
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
        send('status', { message: '슬랙 데이터 조회 중...' })

        const sb = await createClient()
        const workspaceId = await getWorkspaceId(sb)

        // 주 범위 계산 (월~일)
        const monday = new Date(week_start + 'T00:00:00')
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        sunday.setHours(23, 59, 59, 999)
        const weekEnd = sunday.toISOString()

        // 기존 인사이트 조회
        const { data: existing } = await sb
          .from('insights')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('week_start', week_start)
          .single()

        // 신규 항목만 가져오기 (증분)
        let historyQuery = sb
          .from('client_history')
          .select('id, client_id, tags, title, body, occurred_at, priority, author, channel')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .gte('occurred_at', week_start + 'T00:00:00')
          .lte('occurred_at', weekEnd)
          .order('occurred_at', { ascending: false })

        // occurred_at이 아닌 created_at 기준: 이미 지난 날짜로 늦게 INSERT된 항목도 포함
        if (existing?.analyzed_at) {
          historyQuery = historyQuery.gt('created_at', existing.analyzed_at)
        }

        const { data: newItems, error: histErr } = await historyQuery
        if (histErr) throw histErr

        const sourceCount = (existing?.source_count ?? 0) + (newItems?.length ?? 0)

        // 신규 데이터 없음 → 기존 그대로
        if ((newItems?.length ?? 0) === 0 && existing) {
          send('result', existing)
          controller.close()
          return
        }

        // 클라이언트 목록 (브랜드명 매핑 + 프롬프트 주입용)
        const { data: clients } = await sb
          .from('clients')
          .select('id, name, name_en, keywords')
          .eq('workspace_id', workspaceId)
          .order('sort_order')

        const clientMap = Object.fromEntries((clients ?? []).map(c => [c.id, c.name]))
        const newItemsWithBrand = (newItems ?? []).map(h => ({
          ...h,
          brand: clientMap[h.client_id] ?? h.client_id,
        }))

        // 프롬프트에 주입할 클라이언트 목록 (name_en, keywords 포함)
        const clientListStr = (clients ?? []).map(c => {
          const extras = [c.name_en, ...(c.keywords ?? [])].filter(Boolean)
          return `- ${c.name}${extras.length ? ` (${extras.join(', ')})` : ''}`
        }).join('\n')

        const count = newItemsWithBrand.length
        send('status', { message: `AI 분석 중... (${count}건)` })

        // 프롬프트 구성
        let userPrompt: string
        if (existing?.content && count > 0) {
          userPrompt = `클라이언트 목록:
${clientListStr}

기존 분석 결과 (${week_start} 주):
${JSON.stringify(existing.content, null, 2)}

신규 항목 ${count}건:
${JSON.stringify(newItemsWithBrand, null, 2)}

기존 분석에 신규 항목을 반영하여 업데이트된 인사이트를 생성하세요.
- 기존 action_items / decisions의 id 유지, 신규 항목은 이어서 채번 (a1 다음 a2...)
- 신규 done 항목과 연관된 기존 action_items → decisions로 이동하거나 제거
- pending에서 내부 응답이 확인된 항목 제거
- 신규 이슈·결정·일정 추가
- headline은 주 전체를 반영해 재작성
- 기존 upcoming 중 이미 지난 날짜 항목 제거

아래 JSON 형식만 반환하세요:
${JSON_SCHEMA}`
        } else {
          userPrompt = `클라이언트 목록:
${clientListStr}

${week_start} 주(월~일) 슬랙 수집 내역 ${count}건:
${JSON.stringify(newItemsWithBrand, null, 2)}

이번 주 인사이트를 분석하세요. 아래 JSON 형식만 반환하세요:
${JSON_SCHEMA}`
        }

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        })

        send('status', { message: '저장 중...' })

        const raw = (message.content[0] as { type: string; text: string }).text.trim()
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('Claude did not return valid JSON')

        let jsonParsed: unknown
        try {
          jsonParsed = JSON.parse(jsonMatch[0])
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          throw new Error(`JSON 파싱 실패 (응답이 잘렸을 수 있음): ${msg}`)
        }
        const parsed = InsightContentSchema.safeParse(jsonParsed)
        if (!parsed.success) {
          const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' | ')
          throw new Error(`Claude 응답 형식 오류: ${issues}`)
        }
        const content = parsed.data

        // 브랜드명 → client_id 정규화 (name, name_en, keywords 모두 커버)
        const nameToId: Record<string, string> = {}
        for (const c of (clients ?? [])) {
          nameToId[c.name] = c.id
          if (c.name_en) nameToId[c.name_en] = c.id
          for (const kw of (c.keywords ?? [])) nameToId[kw] = c.id
        }
        function normalizeBrands<T extends { brand: string }>(items: T[]): T[] {
          return items.map(item => ({ ...item, brand: nameToId[item.brand] ?? item.brand }))
        }
        content.action_items = normalizeBrands(content.action_items)
        content.upcoming     = normalizeBrands(content.upcoming)
        content.pending      = normalizeBrands(content.pending)
        content.decisions    = normalizeBrands(content.decisions)

        const now = new Date().toISOString()
        const { data: upserted, error: upsertErr } = await sb
          .from('insights')
          .upsert(
            {
              workspace_id: workspaceId,
              week_start,
              content,
              analyzed_at: now,
              source_count: sourceCount,
              updated_at: now,
            },
            { onConflict: 'workspace_id,week_start' }
          )
          .select()
          .single()

        if (upsertErr) throw upsertErr
        send('result', upserted)
      } catch (err) {
        console.error('[insights/generate]', err)
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
