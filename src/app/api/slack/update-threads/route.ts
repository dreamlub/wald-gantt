import { WebClient } from '@slack/web-api'
import { createClient } from '@/lib/supabase/server'
import {
  matchBrand, classifyMessage, fetchBrandMappings, getExcludedChannelIds,
  buildSourceRef, tsToISO, delay,
  fetchUserDirectory, resolveUserName,
  getReplySourceIds, softDeleteReplyHistoryRows,
  fetchBrandAliasMap, resolveBrandAlias,
  type RawJson,
} from '@/lib/slack-service'

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

export async function POST() {
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

        send('status', { message: '스레드 업데이트 대상 조회 중...' })

        // 1. raw_message_id 있는 전체 client_history
        const { data: historyItems, error: histErr } = await sb
          .from('client_history')
          .select('id, source_id, raw_message_id')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .not('raw_message_id', 'is', null)

        if (histErr) throw histErr
        if (!historyItems || historyItems.length === 0) {
          send('result', { updated: 0, message: '업데이트 대상 없음' })
          return
        }

        // 2. 대응하는 raw_messages 조회
        const rawIds = historyItems.map(h => h.raw_message_id as string)
        const { data: rawRows, error: rawErr } = await sb
          .from('slack_raw_messages')
          .select('id, channel_id, parent_ts, raw_json')
          .in('id', rawIds)

        if (rawErr) throw rawErr
        if (!rawRows || rawRows.length === 0) {
          send('result', { updated: 0, message: 'raw 데이터 없음' })
          return
        }

        send('status', { message: `${rawRows.length}건 스레드 업데이트 중...` })

        const [brandMappings, userDir, aliasMap] = await Promise.all([
          fetchBrandMappings(sb, workspaceId),
          fetchUserDirectory(slack),
          fetchBrandAliasMap(sb, workspaceId),
        ])
        const excludedChannels = getExcludedChannelIds(brandMappings)
        const FALLBACK_BRAND = '미분류'

        let updated = 0
        let skipped = 0
        let deletedReplyRows = 0

        // 제외 채널 필터링
        const filteredRows = rawRows.filter(raw => {
          const rj = raw.raw_json as RawJson
          return !excludedChannels.has(rj.channel_id)
        })
        if (filteredRows.length < rawRows.length) {
          send('status', { message: `제외 채널 ${rawRows.length - filteredRows.length}건 스킵` })
        }

        const initialReplySourceIds = getReplySourceIds(filteredRows.map(raw => raw.raw_json as RawJson))
        if (initialReplySourceIds.length > 0) {
          send('status', { message: `기존 스레드 답글 중복 이력 ${initialReplySourceIds.length}건 정리 중...` })
          deletedReplyRows += await softDeleteReplyHistoryRows(sb, workspaceId, initialReplySourceIds)
        }

        for (let i = 0; i < filteredRows.length; i++) {
          const raw = filteredRows[i]
          const prevRj = raw.raw_json as RawJson

          send('status', { message: `스레드 업데이트 중... (${i + 1}/${filteredRows.length})` })

          // 3. 최신 replies 재수집
          const replies: RawJson['replies'] = []
          try {
            const thread = await slack.conversations.replies({
              channel: raw.channel_id!,
              ts: raw.parent_ts,
            })
            if (thread.ok && thread.messages) {
              for (const r of thread.messages.slice(1)) {
                if ((r as { bot_id?: string }).bot_id) continue
                const rMsg = r as { ts?: string; text?: string; user?: string; username?: string }
                replies.push({
                  ts: rMsg.ts ?? '',
                  text: rMsg.text ?? '',
                  user: rMsg.user ?? '',
                  user_name: resolveUserName(userDir, rMsg.user, rMsg.username),
                })
              }
            }
            await delay(300)
          } catch (e) {
            console.error(`[slack/update-threads] thread fetch error (${raw.parent_ts}):`, e)
            skipped++
            continue
          }

          // 이전과 동일하면 SKIP (길이 + 마지막 reply ts 둘 다 같을 때만)
          const prevLastTs = prevRj.replies[prevRj.replies.length - 1]?.ts ?? ''
          const newLastTs = replies[replies.length - 1]?.ts ?? ''
          if (replies.length === prevRj.replies.length && prevLastTs === newLastTs) {
            skipped++
            continue
          }

          // 4. raw_json upsert (replies 업데이트)
          const updatedRj: RawJson = { ...prevRj, replies, reply_count: replies.length }

          const { error: rawUpsertErr } = await sb
            .from('slack_raw_messages')
            .update({ raw_json: updatedRj, collected_at: new Date().toISOString() })
            .eq('id', raw.id)

          if (rawUpsertErr) { console.error(rawUpsertErr); skipped++; continue }

          deletedReplyRows += await softDeleteReplyHistoryRows(
            sb,
            workspaceId,
            getReplySourceIds([updatedRj]),
          )

          // 5. 재분류 → client_history 업데이트
          const rawBrand = matchBrand(updatedRj.channel_id, brandMappings) ?? FALLBACK_BRAND
          const brandName = resolveBrandAlias(rawBrand, aliasMap) ?? rawBrand

          try {
            const result = await classifyMessage(updatedRj, brandName)
            if (!result) { skipped++; await delay(80); continue }

            await sb.from('client_history').upsert(
              {
                workspace_id: workspaceId,
                brand_name: resolveBrandAlias(result.brand || brandName, aliasMap) ?? brandName,
                raw_message_id: raw.id,
                thread_count: replies.length,
                type: 'slack',
                tags: result.tags,
                channel: updatedRj.channel,
                source_id: updatedRj.ts,
                source_ref: buildSourceRef(updatedRj.channel_id, updatedRj.ts),
                title: result.title,
                body: result.body,
                priority: result.priority,
                author: resolveUserName(userDir, updatedRj.user, result.author || updatedRj.user_name),
                occurred_at: tsToISO(updatedRj.ts),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'workspace_id,source_id' }
            )
            updated++
          } catch (e) {
            console.error(`[slack/update-threads] classify error (${raw.parent_ts}):`, e)
            skipped++
          }

          await delay(120)
        }

        send('result', {
          updated,
          skipped,
          deleted_reply_rows: deletedReplyRows,
          message: `완료 — ${updated}건 업데이트, ${skipped}건 변경 없음/오류, 답글 중복 ${deletedReplyRows}건 정리`,
        })

      } catch (err) {
        console.error('[slack/update-threads]', err)
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
