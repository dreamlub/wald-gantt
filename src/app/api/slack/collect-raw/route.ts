import { NextRequest } from 'next/server'
import { WebClient } from '@slack/web-api'
import { createClient } from '@/lib/supabase/server'
import {
  fetchBrandMappings, getExcludedChannelIds,
  buildSourceRef, delay, getSlackIdentity,
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

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  let d = new Date(Date.UTC(fy, fm - 1, fd))
  const end = new Date(Date.UTC(ty, tm - 1, td))
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  }
  return dates
}

export async function POST(req: NextRequest) {
  const { from, to, force } = await req.json() as { from: string; to: string; force?: boolean }

  if (!from || !to || !DATE_REGEX.test(from) || !DATE_REGEX.test(to) || from > to) {
    return new Response(JSON.stringify({ error: 'from, to 필드 필요 (YYYY-MM-DD, from ≤ to)' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = process.env.SLACK_USER_TOKEN
  if (!token) {
    return new Response(JSON.stringify({ error: 'SLACK_USER_TOKEN 환경변수 미설정' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const slack = new WebClient(token)

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const sb = await createClient()
        const workspaceId = await getWorkspaceId(sb)

        send('status', { message: '브랜드 매핑 / 사용자 디렉토리 조회 중...' })
        const [brandMappings, userDir, identity] = await Promise.all([
          fetchBrandMappings(sb, workspaceId),
          fetchUserDirectory(slack),
          getSlackIdentity(slack),
        ])
        const excludedChannels = getExcludedChannelIds(brandMappings)

        const dates = dateRange(from, to)
        let totalRaw = 0
        let totalSkipped = 0

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
          while (page <= 50) {
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
            send('status', { message: `[${di + 1}/${dates.length}] ${date} page ${page}: ${result.messages.matches.length}건 (누적 ${allMatches.length}건, 전체 ${result.messages.total ?? '?'})` })
            if (page >= (result.messages.paging?.pages ?? 1)) break
            if (page >= 50) {
              send('status', { message: `[${date}] ⚠ 페이지 한계(50) 도달 — 일부 메시지 누락 가능 (전체 ${result.messages.total ?? '?'}건)` })
              break
            }
            page++
            await delay(1000)
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
                .select('channel, parent_ts, raw_json')
                .eq('workspace_id', workspaceId)
                .in('parent_ts', allParentTs)
            : { data: [] }

          const existingMap = new Map<string, RawJson>(
            (existingRows ?? []).map(e => [`${e.channel}:${e.parent_ts}`, e.raw_json as RawJson])
          )

          const rawMessages: Array<{ channel: string; channel_id: string; parent_ts: string; raw_json: RawJson }> = []
          let skippedThreads = 0

          for (let i = 0; i < parents.length; i++) {
            if (i % 10 === 0 || i === parents.length - 1) {
              const skipLabel = skippedThreads > 0 ? `, ${skippedThreads}건 스킵` : ''
              send('status', { message: `[${di + 1}/${dates.length}] ${date} 스레드 (${i + 1}/${parents.length}${skipLabel})` })
            }
            const m = parents[i]
            let replies: RawReply[] = []
            if ((m.reply_count ?? 0) > 0) {
              const existing = existingMap.get(`${m.channel.name}:${m.ts}`)
              if (!force && existing && existing.replies.length === (m.reply_count ?? 0)) {
                replies = existing.replies
                skippedThreads++
              } else {
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
                  replies = existing?.replies ?? []
                }
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
                  permalink: buildSourceRef(identity.domain, op.channelId, parentTs),
                  reply_count: replies.length, replies,
                },
              })
            } catch {
              const existing = existingMap.get(`${op.channelName}:${op.ts}`)
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
              .upsert(upsertData, { onConflict: 'workspace_id,channel,parent_ts' })
            if (error) {
              send('status', { message: `[${date}] 저장 오류: ${error.message}` })
            } else {
              totalRaw += rawMessages.length
              totalSkipped += skippedThreads
              const skipNote = skippedThreads > 0 ? ` (${skippedThreads}건 스레드 스킵)` : ''
              send('status', { message: `[${di + 1}/${dates.length}] ${date} 완료 — ${rawMessages.length}건${skipNote}` })
            }
          }
        }

        const skipSummary = totalSkipped > 0 ? ` (${totalSkipped}건 스레드 스킵)` : ''
        send('result', { message: `완료 — ${dates.length}일 / 총 ${totalRaw}건 Raw 저장${skipSummary}` })
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
