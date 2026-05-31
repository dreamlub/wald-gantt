/**
 * conversations.history 채널별 보강 수집
 *
 * search.messages 3,000건(30p×100) 상한 초과일에만 호출.
 * 각 채널을 oldest/latest Unix timestamp로 조회 후 upsert.
 * 충돌 키 (workspace_id, channel_id, parent_ts) 동일 → 중복 안전.
 */
import type { WebClient } from '@slack/web-api'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveUserName, resolveChannelName, delay, buildSourceRef,
  type BrandMapping, type RawJson, type RawReply,
} from '@/lib/slack-service'

type Send = (event: string, data: unknown) => void

type HistoryMsg = {
  ts: string
  text?: string
  user?: string
  username?: string
  bot_id?: string
  subtype?: string
  reply_count?: number
  thread_ts?: string
}

type UserDirectory = Map<string, string>

const SKIP_ERRORS = new Set(['channel_not_found', 'not_in_channel', 'missing_scope', 'is_archived'])

export async function supplementByChannelHistory({
  slack, sb, workspaceId, date, brandMappings, userDir, slackDomain, send,
}: {
  slack: WebClient
  sb: SupabaseClient
  workspaceId: string
  date: string
  brandMappings: BrandMapping[]
  userDir: UserDirectory
  slackDomain: string | null
  send: Send
}): Promise<number> {
  const kstStart = new Date(date + 'T00:00:00+09:00').getTime() / 1000
  const kstEnd   = new Date(date + 'T23:59:59+09:00').getTime() / 1000

  const activeChannels = brandMappings.filter(m => !m.excluded && m.channel_id)
  if (activeChannels.length === 0) return 0

  let total = 0

  for (let ci = 0; ci < activeChannels.length; ci++) {
    const { channel_id, channel_name } = activeChannels[ci]
    const displayName = channel_name ?? channel_id
    send('status', { message: `[보강] ${date} 채널 ${ci + 1}/${activeChannels.length}: ${displayName}` })

    // ── conversations.history 페이지네이션 ──────────────────────────
    const msgs: HistoryMsg[] = []
    let cursor: string | undefined
    let retries = 0

    while (true) {
      let res
      try {
        res = await slack.conversations.history({
          channel: channel_id,
          oldest: String(kstStart),
          latest: String(kstEnd),
          inclusive: true,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        })
      } catch (e: unknown) {
        const errCode = (e as { data?: { error?: string } }).data?.error ?? ''
        if (errCode === 'ratelimited') {
          if (retries >= 3) { send('status', { message: `[보강] ${displayName} rate limit 초과 스킵` }); break }
          retries++
          send('status', { message: `[보강] rate limit — 60s 대기 (${retries}/3)` })
          await delay(60_000)
          continue
        }
        if (SKIP_ERRORS.has(errCode)) break   // 접근 불가 채널은 조용히 스킵
        send('status', { message: `[보강] ${displayName} 오류 스킵: ${errCode}` })
        break
      }

      if (!res.ok || !res.messages) break
      msgs.push(...(res.messages as HistoryMsg[]))

      const nextCursor = (res as { response_metadata?: { next_cursor?: string } }).response_metadata?.next_cursor
      if (!nextCursor) break
      cursor = nextCursor
      await delay(300)
    }

    // ── 부모 메시지 추출 (thread 루트 or 싱글) ──────────────────────
    const parents = msgs.filter(m =>
      !m.bot_id &&
      m.subtype !== 'bot_message' &&
      m.subtype !== 'channel_join' &&
      m.subtype !== 'channel_leave' &&
      (!m.thread_ts || m.thread_ts === m.ts),
    )

    if (parents.length === 0) { await delay(200); continue }

    const chName = resolveChannelName(userDir, channel_name ?? channel_id)
    const rawMessages: Array<{ channel: string; channel_id: string; parent_ts: string; raw_json: RawJson }> = []

    // ── 스레드 답글 수집 ──────────────────────────────────────────
    for (const m of parents) {
      const replies: RawReply[] = []
      if ((m.reply_count ?? 0) > 0) {
        try {
          const thread = await slack.conversations.replies({ channel: channel_id, ts: m.ts })
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
        } catch { /* 스레드 조회 실패 시 빈 배열 유지 */ }
      }

      rawMessages.push({
        channel: chName, channel_id, parent_ts: m.ts,
        raw_json: {
          ts: m.ts, text: m.text ?? '', user: m.user ?? '',
          user_name: resolveUserName(userDir, m.user, m.username),
          channel: chName, channel_id,
          permalink: buildSourceRef(channel_id, m.ts, slackDomain ?? undefined),
          reply_count: replies.length, replies,
        },
      })
    }

    // ── upsert (중복 safe) ────────────────────────────────────────
    if (rawMessages.length > 0) {
      const { error } = await sb.from('slack_raw_messages').upsert(
        rawMessages.map(m => ({
          workspace_id: workspaceId,
          channel: m.channel, channel_id: m.channel_id,
          parent_ts: m.parent_ts, raw_json: m.raw_json,
          collected_at: new Date().toISOString(),
        })),
        { onConflict: 'workspace_id,channel_id,parent_ts' },
      )
      if (error) {
        send('status', { message: `[보강] ${displayName} 저장 오류: ${error.message}` })
      } else {
        total += rawMessages.length
      }
    }

    await delay(300)
  }

  return total
}
