import { NextRequest } from 'next/server'
import { WebClient } from '@slack/web-api'
import { createClient } from '@/lib/supabase/server'
import { getApiKey } from '@/lib/workspace-api-keys'
import { kstDateRange } from '@/lib/kst'
import {
  fetchBrandMappings, getExcludedChannelIds,
  buildSourceRef, delay,
  fetchUserDirectory, resolveUserName, resolveChannelName,
  type RawJson, type RawReply,
} from '@/lib/slack-service'

const DATE_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/

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

const dateRange = kstDateRange

export async function POST(req: NextRequest) {
  const { from, to } = await req.json() as { from: string; to: string }

  if (!from || !to || !DATE_REGEX.test(from) || !DATE_REGEX.test(to) || from > to) {
    return new Response(JSON.stringify({ error: 'from, to 필드 필요 (YYYY-MM-DD, from ≤ to)' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const sb = await createClient()
        const workspaceId = await getWorkspaceId(sb)

        const [token, slackDomain] = await Promise.all([
          getApiKey(sb, workspaceId, 'slack_user', process.env.SLACK_USER_TOKEN),
          getApiKey(sb, workspaceId, 'slack_domain', process.env.SLACK_WORKSPACE_DOMAIN),
        ])
        if (!token) {
          send('error', { message: 'Slack User Token 미설정. 설정 > API 키에서 등록해 주세요.' })
          return
        }
        const slack = new WebClient(token)

        send('status', { message: '브랜드 매핑 / 사용자 디렉토리 조회 중...' })
        const [brandMappings, userDir] = await Promise.all([
          fetchBrandMappings(sb, workspaceId),
          fetchUserDirectory(slack),
        ])
        const excludedChannels = getExcludedChannelIds(brandMappings)

        const dates = dateRange(from, to)
        let totalRaw = 0
        const truncatedDays: { date: string; total: number }[] = []

        send('status', { message: `${dates.length}일 Raw 수집 시작 (${from} ~ ${to})` })

        for (let di = 0; di < dates.length; di++) {
          const date = dates[di]
          send('status', { message: `[${di + 1}/${dates.length}] ${date} 검색 중...` })

          type SlackMatch = {
            ts: string; text: string; username: string; user: string
            channel: { id: string; name: string }; permalink: string
            subtype?: string; bot_id?: string; reply_count?: number; thread_ts?: string
          }

          // KST 하루 범위를 Unix timestamp로 계산 (토큰 시간대 무관하게 정확히 필터)
          const kstStart = new Date(date + 'T00:00:00+09:00').getTime() / 1000
          const kstEnd   = new Date(date + 'T23:59:59+09:00').getTime() / 1000

          const allMatches: SlackMatch[] = []
          let page = 1
          let searchRetries = 0
          let lastPages = 1
          let lastTotal = 0
          while (page <= 10) {
            let result
            try {
              result = await slack.search.messages({
                query: `on:${date}`, sort: 'timestamp', count: 100, page,
              })
            } catch (e: unknown) {
              const status = (e as { code?: string; data?: { error?: string } }).data?.error
              if (status === 'ratelimited' && searchRetries < 3) {
                searchRetries++
                send('status', { message: `[${date}] 검색 rate limit — ${searchRetries * 60}s 대기 후 재시도` })
                await delay(searchRetries * 60_000)
                continue
              }
              send('status', { message: `[${date}] 검색 오류: ${e instanceof Error ? e.message : String(e)}` })
              break
            }
            if (!result.ok || !result.messages?.matches) {
              send('status', { message: `[${date}] 검색 결과 없음 (total=${result.messages?.total ?? '?'})` })
              break
            }
            allMatches.push(...(result.messages.matches as SlackMatch[]))
            lastPages = result.messages.paging?.pages ?? 1
            lastTotal = result.messages.total ?? 0
            send('status', { message: `[${di + 1}/${dates.length}] ${date} page ${page}: ${result.messages.matches.length}건 (누적 ${allMatches.length}건, 전체 ${result.messages.total ?? '?'})` })
            if (page >= lastPages) break
            page++
            await delay(1000)
          }

          // Slack 검색은 최대 10페이지(1,000건)만 반환 — 초과분은 조용히 누락되므로 경고
          if (lastPages > 10) {
            truncatedDays.push({ date, total: lastTotal })
            send('status', { message: `⚠️ [${date}] 검색 ${lastTotal}건 중 1,000건 상한 도달 — 약 ${lastTotal - 1000}건 누락 가능 (${lastPages}p)` })
          }

          const cleanMatches = allMatches.filter(m =>
            !m.bot_id &&
            m.subtype !== 'channel_join' &&
            m.subtype !== 'channel_leave' &&
            m.subtype !== 'bot_message' &&
            !excludedChannels.has(m.channel.id) &&
            parseFloat(m.ts) >= kstStart &&
            parseFloat(m.ts) <= kstEnd
          )

          if (cleanMatches.length === 0) {
            send('status', { message: `[${di + 1}/${dates.length}] ${date} — 메시지 없음` })
            continue
          }

          const seenKeys = new Set<string>()
          const parents = cleanMatches
            .filter(m => {
              if (m.thread_ts && m.thread_ts !== m.ts) return false
              if (m.permalink) {
                try {
                  const threadTs = new URL(m.permalink).searchParams.get('thread_ts')
                  if (threadTs && threadTs !== m.ts) return false
                } catch { /* ignore */ }
              }
              return true
            })
            .filter(m => {
              const key = `${m.channel.id}:${m.ts}`
              if (seenKeys.has(key)) return false
              seenKeys.add(key)
              return true
            })

          type OrphanParent = { channelId: string; channelName: string; ts: string }
          const orphanParents: OrphanParent[] = []
          for (const m of cleanMatches) {
            if (!m.thread_ts || m.thread_ts === m.ts) continue
            const key = `${m.channel.id}:${m.thread_ts}`
            if (seenKeys.has(key)) continue
            seenKeys.add(key)
            orphanParents.push({ channelId: m.channel.id, channelName: m.channel.name, ts: m.thread_ts })
          }

          const allParentTs = [...parents.map(p => p.ts), ...orphanParents.map(o => o.ts)]
          const { data: existingRows } = allParentTs.length > 0
            ? await sb.from('slack_raw_messages')
                .select('channel_id, parent_ts, raw_json')
                .eq('workspace_id', workspaceId)
                .in('parent_ts', allParentTs)
            : { data: [] }

          // channel_id 기준 키 (저장된 channel은 resolved 이름이라 DM에서 조회 키와 불일치)
          const existingMap = new Map<string, RawJson>(
            (existingRows ?? []).map(e => [`${e.channel_id}:${e.parent_ts}`, e.raw_json as RawJson])
          )

          const rawMessages: Array<{ channel: string; channel_id: string; parent_ts: string; raw_json: RawJson }> = []

          for (let i = 0; i < parents.length; i++) {
            if (i % 10 === 0 || i === parents.length - 1) {
              send('status', { message: `[${di + 1}/${dates.length}] ${date} 스레드 (${i + 1}/${parents.length})` })
            }
            const m = parents[i]
            let replies: RawReply[] = []
            if ((m.reply_count ?? 0) > 0) {
              try {
                const thread = await slack.conversations.replies({ channel: m.channel.id, ts: m.ts })
                if (thread.ok && thread.messages) {
                  for (const r of thread.messages.slice(1)) {
                    if ((r as { bot_id?: string }).bot_id) continue
                    const rMsg = r as { ts?: string; text?: string; user?: string; username?: string }
                    replies.push({
                      ts: rMsg.ts ?? '', text: rMsg.text ?? '', user: rMsg.user ?? '',
                      user_name: resolveUserName(userDir, rMsg.user, rMsg.username),
                    })
                  }
                }
                await delay(200)
              } catch {
                const existing = existingMap.get(`${m.channel.id}:${m.ts}`)
                replies = existing?.replies ?? []
              }
            }

            const chName = resolveChannelName(userDir, m.channel.name)
            rawMessages.push({
              channel: chName, channel_id: m.channel.id, parent_ts: m.ts,
              raw_json: {
                ts: m.ts, text: m.text, user: m.user,
                user_name: resolveUserName(userDir, m.user, m.username),
                channel: chName, channel_id: m.channel.id,
                permalink: m.permalink, reply_count: replies.length, replies,
              },
            })
          }

          for (let i = 0; i < orphanParents.length; i++) {
            const op = orphanParents[i]
            try {
              const thread = await slack.conversations.replies({ channel: op.channelId, ts: op.ts })
              await delay(300)
              if (!thread.ok || !thread.messages || thread.messages.length === 0) continue
              const parentMsg = thread.messages[0] as {
                ts?: string; text?: string; user?: string; username?: string; bot_id?: string; subtype?: string
              }
              if (parentMsg.bot_id || parentMsg.subtype === 'bot_message') continue

              const replies: RawReply[] = []
              for (const r of thread.messages.slice(1)) {
                if ((r as { bot_id?: string }).bot_id) continue
                const rMsg = r as { ts?: string; text?: string; user?: string; username?: string }
                replies.push({
                  ts: rMsg.ts ?? '', text: rMsg.text ?? '', user: rMsg.user ?? '',
                  user_name: resolveUserName(userDir, rMsg.user, rMsg.username),
                })
              }

              const parentTs = parentMsg.ts ?? op.ts
              const opChName = resolveChannelName(userDir, op.channelName)
              rawMessages.push({
                channel: opChName, channel_id: op.channelId, parent_ts: parentTs,
                raw_json: {
                  ts: parentTs, text: parentMsg.text ?? '', user: parentMsg.user ?? '',
                  user_name: resolveUserName(userDir, parentMsg.user, parentMsg.username),
                  channel: opChName, channel_id: op.channelId,
                  permalink: buildSourceRef(op.channelId, parentTs, slackDomain ?? undefined),
                  reply_count: replies.length, replies,
                },
              })
            } catch {
              const existing = existingMap.get(`${op.channelId}:${op.ts}`)
              if (existing) {
                rawMessages.push({
                  channel: op.channelName, channel_id: op.channelId, parent_ts: op.ts,
                  raw_json: existing,
                })
              }
            }
          }

          if (rawMessages.length > 0) {
            const upsertData = rawMessages.map(m => ({
              workspace_id: workspaceId,
              channel: m.channel, channel_id: m.channel_id,
              parent_ts: m.parent_ts, raw_json: m.raw_json,
              collected_at: new Date().toISOString(),
            }))
            const { error } = await sb
              .from('slack_raw_messages')
              .upsert(upsertData, { onConflict: 'workspace_id,channel_id,parent_ts' })
            if (error) {
              send('status', { message: `[${date}] 저장 오류: ${error.message}` })
            } else {
              totalRaw += rawMessages.length
              send('status', { message: `[${di + 1}/${dates.length}] ${date} 완료 — ${rawMessages.length}건` })
            }
          }
        }

        const truncNote = truncatedDays.length > 0
          ? ` ⚠️ 1,000건 상한으로 누락 가능한 날 ${truncatedDays.length}일: ${truncatedDays.map(d => `${d.date}(${d.total}건)`).join(', ')}`
          : ''
        send('result', { message: `완료 — ${dates.length}일 / 총 ${totalRaw}건 Raw 저장${truncNote}`, truncatedDays })
      } catch (err) {
        console.error('[collect-raw]', err)
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
