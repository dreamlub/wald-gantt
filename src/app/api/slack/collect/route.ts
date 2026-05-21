import { NextRequest } from 'next/server'
import { WebClient } from '@slack/web-api'
import { createClient } from '@/lib/supabase/server'
import {
  matchBrand, classifyMessage, fetchClientsForWorkspace,
  buildSourceRef, tsToISO, delay, type RawJson,
} from '@/lib/slack-service'

const WORKSPACE_DOMAIN_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/

async function getWorkspaceId(sb: Awaited<ReturnType<typeof createClient>>) {
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

export async function POST(req: NextRequest) {
  const { date } = await req.json() as { date: string }

  if (!date || !WORKSPACE_DOMAIN_REGEX.test(date)) {
    return new Response(JSON.stringify({ error: 'date 필드 필요 (YYYY-MM-DD)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = process.env.SLACK_USER_TOKEN
  if (!token) {
    return new Response(JSON.stringify({ error: 'SLACK_USER_TOKEN 환경변수 미설정' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const slack = new WebClient(token)

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

        // 1. 클라이언트 목록 조회 (브랜드 매칭용)
        send('status', { message: '클라이언트 목록 조회 중...' })
        const clients = await fetchClientsForWorkspace(sb, workspaceId)
        const fallbackClientId = clients.find(c => c.name === '미분류')?.id ?? null

        // 2. Slack 메시지 검색 (전체 채널, 해당 날짜)
        send('status', { message: `${date} 슬랙 메시지 검색 중...` })

        type SlackMatch = {
          ts: string
          text: string
          username: string
          user: string
          channel: { id: string; name: string }
          permalink: string
          subtype?: string
          bot_id?: string
          reply_count?: number
          thread_ts?: string
        }

        const allMatches: SlackMatch[] = []
        let page = 1
        while (page <= 5) {
          const result = await slack.search.messages({
            query: `on:${date}`,
            sort: 'timestamp',
            count: 100,
            page,
          })
          if (!result.ok || !result.messages?.matches) break
          allMatches.push(...(result.messages.matches as SlackMatch[]))
          if (page >= (result.messages.paging?.pages ?? 1)) break
          page++
          await delay(1200)
        }

        // 3. 노이즈 제거 + 부모 메시지만 추출 (thread replies 별도 수집)
        const seen = new Set<string>()
        const parents = allMatches
          .filter(m =>
            !m.bot_id &&
            m.subtype !== 'channel_join' &&
            m.subtype !== 'channel_leave' &&
            m.subtype !== 'bot_message' &&
            (!m.thread_ts || m.thread_ts === m.ts)
          )
          .filter(m => {
            const key = `${m.channel.id}:${m.ts}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })

        send('status', { message: `${parents.length}건 부모 메시지 발견. 스레드 수집 중...` })

        // 4. 스레드 replies 수집 + raw_json 조립
        const rawMessages: Array<{
          channel: string
          channel_id: string
          parent_ts: string
          raw_json: RawJson
        }> = []

        for (const m of parents) {
          // 수집 단계: 스레드 fetch 없이 빠르게 원본만 저장
          // 스레드 내용은 [스레드 업데이트] 버튼으로 별도 수집
          rawMessages.push({
            channel: m.channel.name,
            channel_id: m.channel.id,
            parent_ts: m.ts,
            raw_json: {
              ts: m.ts,
              text: m.text,
              user: m.user,
              user_name: m.username,
              channel: m.channel.name,
              channel_id: m.channel.id,
              permalink: m.permalink,
              reply_count: m.reply_count ?? 0,
              replies: [],
            },
          })
        }

        // 5. slack_raw_messages upsert
        send('status', { message: `${rawMessages.length}건 raw 저장 중...` })

        const upsertData = rawMessages.map(m => ({
          workspace_id: workspaceId,
          channel: m.channel,
          channel_id: m.channel_id,
          parent_ts: m.parent_ts,
          raw_json: m.raw_json,
          collected_at: new Date().toISOString(),
        }))

        const { data: rawRows, error: upsertErr } = await sb
          .from('slack_raw_messages')
          .upsert(upsertData, { onConflict: 'workspace_id,channel,parent_ts' })
          .select('id, channel, parent_ts, raw_json')

        if (upsertErr) throw upsertErr

        // 6. AI 분류 → client_history upsert
        send('status', { message: 'AI 분류 중...' })

        let classified = 0
        let skipped = 0

        for (let i = 0; i < (rawRows ?? []).length; i++) {
          const raw = rawRows![i]
          const rj = raw.raw_json as RawJson
          const fullText = rj.text + ' ' + rj.replies.map(r => r.text).join(' ')
          const clientId = matchBrand(rj.channel, fullText, clients) ?? fallbackClientId

          send('status', { message: `AI 분류 중... (${i + 1}/${rawRows!.length})` })

          try {
            const result = await classifyMessage(rj, clientId, clients)
            if (!result) { skipped++; await delay(80); continue }

            await sb.from('client_history').upsert(
              {
                workspace_id: workspaceId,
                client_id: clientId,
                raw_message_id: raw.id,
                thread_count: rj.reply_count,
                type: 'slack',
                tags: result.tags,
                channel: rj.channel,
                source_id: rj.ts,
                source_ref: buildSourceRef(rj.channel_id, rj.ts),
                title: result.title,
                body: result.body,
                priority: result.priority,
                author: result.author,
                occurred_at: tsToISO(rj.ts),
              },
              { onConflict: 'workspace_id,source_id' }
            )
            classified++
          } catch (e) {
            console.error(`[slack/collect] classify error (${rj.channel}:${rj.ts}):`, e)
            skipped++
          }

          await delay(120)
        }

        send('result', {
          date,
          raw_count: rawRows?.length ?? 0,
          classified,
          skipped,
          message: `완료 — raw ${rawRows?.length ?? 0}건 저장, 분류 ${classified}건, 제외 ${skipped}건`,
        })

      } catch (err) {
        console.error('[slack/collect]', err)
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
