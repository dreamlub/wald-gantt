import { NextRequest } from 'next/server'
import { WebClient } from '@slack/web-api'
import { createClient } from '@/lib/supabase/server'
import {
  matchBrand, classifyMessage, fetchBrandMappings, getExcludedChannelIds,
  buildSourceRef, tsToISO, delay, isObviousNoise,
  fetchUserDirectory, resolveUserName, resolveChannelName,
  getReplySourceIds, softDeleteReplyHistoryRows,
  type RawJson, type RawReply,
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

        // 1. 브랜드 매핑 + Slack 사용자 디렉토리 조회
        send('status', { message: '브랜드 매핑 / 사용자 디렉토리 조회 중...' })
        const [brandMappings, userDir] = await Promise.all([
          fetchBrandMappings(sb, workspaceId),
          fetchUserDirectory(slack),
        ])
        const excludedChannels = getExcludedChannelIds(brandMappings)
        const FALLBACK_BRAND = '미분류'

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
          await delay(800)
        }

        // 3. 노이즈 + 제외 채널 제거
        const botCount = allMatches.filter(m => m.bot_id || m.subtype === 'bot_message').length
        const joinLeaveCount = allMatches.filter(m => m.subtype === 'channel_join' || m.subtype === 'channel_leave').length
        const excludedCount = allMatches.filter(m => excludedChannels.has(m.channel.id)).length

        const cleanMatches = allMatches.filter(m =>
          !m.bot_id &&
          m.subtype !== 'channel_join' &&
          m.subtype !== 'channel_leave' &&
          m.subtype !== 'bot_message' &&
          !excludedChannels.has(m.channel.id)
        )

        if (excludedCount > 0) {
          const excludedByChannel: Record<string, number> = {}
          for (const m of allMatches) {
            if (excludedChannels.has(m.channel.id)) {
              const name = m.channel.name || m.channel.id
              excludedByChannel[name] = (excludedByChannel[name] ?? 0) + 1
            }
          }
          const detail = Object.entries(excludedByChannel).map(([ch, n]) => `${ch}(${n})`).join(', ')
          send('status', { message: `제외 채널: ${detail}` })
        }

        send('status', {
          message: `검색 ${allMatches.length}건 → 봇 ${botCount}, 입퇴장 ${joinLeaveCount}, 제외채널 ${excludedCount} 제거 → ${cleanMatches.length}건 처리`,
        })

        // 4-a. search 결과에서 직접 발견된 부모 메시지
        const seenKeys = new Set<string>()
        const parents = cleanMatches
          .filter(m => {
            // thread_ts 필드 체크 (Slack API가 항상 포함하지 않음)
            if (m.thread_ts && m.thread_ts !== m.ts) return false
            // permalink의 thread_ts 파라미터로 이중 확인 (더 신뢰도 높음)
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

        // 4-b. orphan 답글 → 부모 ts 추출 (오늘 답글, 다른 날 부모)
        type OrphanParent = { channelId: string; channelName: string; ts: string }
        const orphanParents: OrphanParent[] = []
        for (const m of cleanMatches) {
          if (!m.thread_ts || m.thread_ts === m.ts) continue
          const key = `${m.channel.id}:${m.thread_ts}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          orphanParents.push({
            channelId: m.channel.id,
            channelName: m.channel.name,
            ts: m.thread_ts,
          })
        }

        send('status', {
          message: `부모 ${parents.length}건 + 외부 부모 ${orphanParents.length}건 발견. 스레드 수집 중...`,
        })

        // 5. 기존 raw_json 사전 조회 (스레드 fetch 실패 시 fallback)
        const allParentTs = [...parents.map(p => p.ts), ...orphanParents.map(o => o.ts)]
        const { data: existingRows } = await sb
          .from('slack_raw_messages')
          .select('channel, parent_ts, raw_json')
          .eq('workspace_id', workspaceId)
          .in('parent_ts', allParentTs)

        const existingMap = new Map<string, RawJson>(
          (existingRows ?? []).map(e => [`${e.channel}:${e.parent_ts}`, e.raw_json as RawJson])
        )

        // 6. raw_json 조립
        const rawMessages: Array<{
          channel: string
          channel_id: string
          parent_ts: string
          raw_json: RawJson
        }> = []

        // 6-a. search 부모: conversations.replies로 스레드 fetch + 가짜 부모 감지
        // search.messages가 thread_ts 없이 답글을 반환하면 부모로 오분류됨
        // → conversations.replies 응답의 thread_ts 확인으로 실제 답글 감지
        type DiscoveredParent = { channelId: string; channelName: string; ts: string }
        const discoveredParents: DiscoveredParent[] = []
        const discoveredKeys = new Set<string>()
        let skippedReplies = 0

        for (let i = 0; i < parents.length; i++) {
          const m = parents[i]
          if (i % 5 === 0 || i === parents.length - 1) {
            send('status', { message: `스레드 수집 중... (${i + 1}/${parents.length})` })
          }

          let replies: RawReply[] = []
          let isActuallyReply = false

          try {
            const thread = await slack.conversations.replies({
              channel: m.channel.id,
              ts: m.ts,
            })

            if (thread.ok && thread.messages && thread.messages.length > 0) {
              const firstMsg = thread.messages[0] as {
                thread_ts?: string; ts?: string
              }

              // thread_ts가 현재 ts와 다르면 → 이 메시지는 실제로 스레드 답글
              if (firstMsg.thread_ts && firstMsg.thread_ts !== m.ts) {
                isActuallyReply = true
                const realParentKey = `${m.channel.id}:${firstMsg.thread_ts}`
                if (!seenKeys.has(realParentKey) && !discoveredKeys.has(realParentKey)) {
                  discoveredKeys.add(realParentKey)
                  discoveredParents.push({
                    channelId: m.channel.id,
                    channelName: m.channel.name,
                    ts: firstMsg.thread_ts,
                  })
                }
              } else if (thread.messages.length > 1) {
                // 진짜 부모 — 답글 수집
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
            }
            await delay(200)
          } catch (e) {
            console.error(`[slack/collect] thread fetch error (${m.channel.name}:${m.ts}):`, e)
            const existing = existingMap.get(`${m.channel.name}:${m.ts}`)
            replies = existing?.replies ?? []
          }

          // 답글로 판명된 메시지는 rawMessages에 추가하지 않음
          if (isActuallyReply) {
            skippedReplies++
            continue
          }

          const chName = resolveChannelName(userDir, m.channel.name)
          rawMessages.push({
            channel: chName,
            channel_id: m.channel.id,
            parent_ts: m.ts,
            raw_json: {
              ts: m.ts,
              text: m.text,
              user: m.user,
              user_name: resolveUserName(userDir, m.user, m.username),
              channel: chName,
              channel_id: m.channel.id,
              permalink: m.permalink,
              reply_count: replies.length,
              replies,
            },
          })
        }

        // 6-a-2. 가짜 부모에서 발견된 진짜 부모를 orphanParents에 추가
        if (discoveredParents.length > 0) {
          send('status', {
            message: `답글 ${skippedReplies}건 제외, 진짜 부모 ${discoveredParents.length}건 추가 발견`,
          })
          orphanParents.push(...discoveredParents)
        }

        // 6-b. orphan 부모: 부모 메시지 + 스레드 전체 fetch
        for (let i = 0; i < orphanParents.length; i++) {
          const op = orphanParents[i]
          if (i % 5 === 0 || i === orphanParents.length - 1) {
            send('status', { message: `외부 부모 스레드 수집 중... (${i + 1}/${orphanParents.length})` })
          }

          try {
            const thread = await slack.conversations.replies({
              channel: op.channelId,
              ts: op.ts,
            })
            await delay(300)

            if (!thread.ok || !thread.messages || thread.messages.length === 0) continue

            const parentMsg = thread.messages[0] as {
              ts?: string
              text?: string
              user?: string
              username?: string
              bot_id?: string
              subtype?: string
            }
            // 부모가 봇/시스템 메시지면 스킵
            if (parentMsg.bot_id || parentMsg.subtype === 'bot_message') continue

            const replies: RawReply[] = []
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

            const parentTs = parentMsg.ts ?? op.ts
            const opChName = resolveChannelName(userDir, op.channelName)
            rawMessages.push({
              channel: opChName,
              channel_id: op.channelId,
              parent_ts: parentTs,
              raw_json: {
                ts: parentTs,
                text: parentMsg.text ?? '',
                user: parentMsg.user ?? '',
                user_name: resolveUserName(userDir, parentMsg.user, parentMsg.username),
                channel: opChName,
                channel_id: op.channelId,
                permalink: buildSourceRef(op.channelId, parentTs),
                reply_count: replies.length,
                replies,
              },
            })
          } catch (e) {
            console.error(`[slack/collect] orphan thread fetch error (${op.channelName}:${op.ts}):`, e)
            // 기존 데이터 있으면 보존
            const existing = existingMap.get(`${op.channelName}:${op.ts}`)
            if (existing) {
              rawMessages.push({
                channel: op.channelName,
                channel_id: op.channelId,
                parent_ts: op.ts,
                raw_json: existing,
              })
            }
          }
        }

        // 6. slack_raw_messages upsert
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

        // 7. AI 분류 → client_history upsert (배치 5건씩 병렬)
        send('status', { message: 'AI 분류 중...' })

        let classified = 0
        let skipped = 0
        const BATCH_SIZE = 5
        const rawList = rawRows ?? []
        let deletedReplyRows = 0

        // 이미 분류된 항목 조회 — thread_count 변경 시 재분류 대상 포함
        const allRawIds = rawList.map(r => r.id)
        const { data: existingHist } = allRawIds.length > 0
          ? await sb
              .from('client_history')
              .select('id, raw_message_id, thread_count, title, body')
              .in('raw_message_id', allRawIds)
              .is('deleted_at', null)
          : { data: [] }

        type ExistingEntry = { id: string; raw_message_id: string; thread_count: number; title: string; body: string | null }
        const existingHistMap = new Map<string, ExistingEntry>(
          (existingHist ?? []).map(h => [h.raw_message_id as string, h as ExistingEntry])
        )

        const newRawList = rawList.filter(r => {
          const existing = existingHistMap.get(r.id)
          if (!existing) return true  // 신규
          const rj = r.raw_json as RawJson
          return rj.reply_count !== existing.thread_count  // 스레드 수 변경 → 재분류
        })

        const reclassifyCount = newRawList.filter(r => existingHistMap.has(r.id)).length
        const newCount = newRawList.length - reclassifyCount
        const skipCount = rawList.length - newRawList.length
        send('status', { message: `신규 ${newCount}건, 재분류 ${reclassifyCount}건, 스킵 ${skipCount}건` })

        const replySourceIds = getReplySourceIds(rawList.map(raw => raw.raw_json as RawJson))
        if (replySourceIds.length > 0) {
          send('status', { message: `스레드 답글 중복 이력 ${replySourceIds.length}건 정리 중...` })
          deletedReplyRows = await softDeleteReplyHistoryRows(sb, workspaceId, replySourceIds)
        }

        type UpsertRow = {
          workspace_id: string
          brand_name: string
          raw_message_id: string
          thread_count: number
          type: string
          tags: string[]
          channel: string
          source_id: string
          source_ref: string
          title: string
          body: string
          priority: 'high' | 'medium' | 'low'
          author: string
          occurred_at: string
          reclassified_at?: string
        }

        let totalNoise = 0
        let totalAiSkip = 0
        let totalError = 0

        for (let bIdx = 0; bIdx < newRawList.length; bIdx += BATCH_SIZE) {
          const batch = newRawList.slice(bIdx, bIdx + BATCH_SIZE)
          const endIdx = Math.min(bIdx + BATCH_SIZE, newRawList.length)
          send('status', { message: `AI 분류 중... (${endIdx}/${newRawList.length})` })

          let noiseCount = 0
          let aiSkipCount = 0

          const results = await Promise.all(batch.map(async (raw): Promise<UpsertRow | null> => {
            const rj = raw.raw_json as RawJson

            // 사전 필터: 명백한 노이즈는 AI 호출 생략
            if (isObviousNoise(rj)) { noiseCount++; return null }

            const fullText = rj.text + ' ' + rj.replies.map(r => r.text).join(' ')
            const brandName = matchBrand(rj.channel_id, brandMappings) ?? FALLBACK_BRAND

            try {
              const result = await classifyMessage(rj, brandName)
              if (!result) {
                aiSkipCount++
                send('status', { message: `AI 제외: #${rj.channel} "${rj.text.slice(0, 40)}..."` })
                return null
              }
              return {
                workspace_id: workspaceId,
                brand_name: brandName,
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
                author: resolveUserName(userDir, rj.user, result.author || rj.user_name),
                occurred_at: tsToISO(rj.ts),
              }
            } catch (e) {
              totalError++
              const errMsg = e instanceof Error ? e.message : String(e)
              send('status', { message: `분류 오류: #${rj.channel} — ${errMsg.slice(0, 60)}` })
              return null
            }
          }))

          const valid = results.filter((r): r is UpsertRow => r !== null)
          skipped += results.length - valid.length

          totalNoise += noiseCount
          totalAiSkip += aiSkipCount

          if (valid.length > 0) {
            const now = new Date().toISOString()

            // 재분류 항목: 이전 요약을 client_history_summaries에 아카이브
            const oldSummaries = valid
              .filter(r => existingHistMap.has(r.raw_message_id))
              .map(r => {
                const old = existingHistMap.get(r.raw_message_id)!
                return {
                  workspace_id: workspaceId,
                  client_history_id: old.id,
                  thread_count: old.thread_count,
                  title: old.title,
                  body: old.body ?? '',
                }
              })
            if (oldSummaries.length > 0) {
              await sb.from('client_history_summaries').insert(oldSummaries)
            }

            // 재분류 항목에만 reclassified_at 추가
            const validWithMeta = valid.map(r => ({
              ...r,
              ...(existingHistMap.has(r.raw_message_id) ? { reclassified_at: now } : {}),
            }))

            const { error: batchErr } = await sb
              .from('client_history')
              .upsert(validWithMeta, { onConflict: 'workspace_id,source_id' })
            if (batchErr) {
              console.error('[slack/collect] batch upsert error:', batchErr)
              skipped += valid.length
            } else {
              classified += valid.length
            }
          }

          // 배치 간 짧은 대기 (Anthropic rate limit 안전 마진)
          if (endIdx < newRawList.length) await delay(200)
        }

        const skipDetail = [
          skipCount > 0 ? `기존 ${skipCount}` : '',
          totalNoise > 0 ? `노이즈 ${totalNoise}` : '',
          totalAiSkip > 0 ? `AI제외 ${totalAiSkip}` : '',
          totalError > 0 ? `오류 ${totalError}` : '',
        ].filter(Boolean).join(', ')

        send('result', {
          date,
          raw_count: rawRows?.length ?? 0,
          classified,
          skipped: skipped + skipCount,
          deleted_reply_rows: deletedReplyRows,
          message: `완료 — raw ${rawRows?.length ?? 0}건, 분류 ${classified}건${skipDetail ? `, 제외(${skipDetail})` : ''}, 답글중복 ${deletedReplyRows}건`,
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
