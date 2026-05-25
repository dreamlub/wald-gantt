import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  matchBrand, classifyMessage, fetchBrandMappings,
  buildSourceRef, tsToISO, delay, isObviousNoise,
  fetchUserDirectory, resolveUserName, getSlackIdentity,
  type RawJson,
} from '@/lib/slack-service'
import { WebClient } from '@slack/web-api'

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

export async function POST(req: NextRequest) {
  const { date } = await req.json() as { date: string }

  if (!date || !DATE_REGEX.test(date)) {
    return new Response(JSON.stringify({ error: 'date 필드 필요 (YYYY-MM-DD)' }), {
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
        const FALLBACK_BRAND = '미분류'

        // KST 날짜 기준 기존 raw 메시지 조회 (RPC)
        send('status', { message: `${date} raw 메시지 조회 중...` })
        const { data: rawRows, error: rpcErr } = await sb.rpc('get_raw_messages_by_date', {
          p_workspace_id: workspaceId,
          p_date: date,
        })
        if (rpcErr) throw rpcErr
        if (!rawRows || rawRows.length === 0) {
          send('result', { date, classified: 0, skipped: 0, message: '재분류할 raw 데이터 없음' })
          return
        }

        send('status', { message: `${rawRows.length}건 강제 재분류 시작...` })

        // 기존 client_history 조회 (아카이브용)
        const allRawIds = rawRows.map((r: { id: string }) => r.id)
        const { data: existingHist } = await sb
          .from('client_history')
          .select('id, raw_message_id, thread_count, title, body')
          .in('raw_message_id', allRawIds)
          .is('deleted_at', null)

        type ExistingEntry = { id: string; raw_message_id: string; thread_count: number; title: string; body: string | null }
        const existingHistMap = new Map<string, ExistingEntry>(
          (existingHist ?? []).map(h => [h.raw_message_id as string, h as ExistingEntry])
        )

        type UpsertRow = {
          workspace_id: string; brand_name: string; raw_message_id: string
          thread_count: number; type: string; tags: string[]; channel: string
          source_id: string; source_ref: string; title: string; body: string
          priority: 'high' | 'medium' | 'low'; author: string; occurred_at: string
          reclassified_at: string
        }

        let classified = 0
        let skipped = 0
        let totalNoise = 0
        let totalAiSkip = 0
        let totalError = 0
        let totalUpsertFail = 0
        let totalProcessed = 0
        const BATCH_SIZE = 5
        const now = new Date().toISOString()

        for (let bIdx = 0; bIdx < rawRows.length; bIdx += BATCH_SIZE) {
          const batch = rawRows.slice(bIdx, bIdx + BATCH_SIZE)
          const endIdx = Math.min(bIdx + BATCH_SIZE, rawRows.length)
          send('status', { message: `AI 재분류 중... (${endIdx}/${rawRows.length})` })

          const results = await Promise.all(batch.map(async (raw: { id: string; channel: string; raw_json: RawJson }): Promise<UpsertRow | null> => {
            const rj = raw.raw_json
            if (isObviousNoise(rj)) { totalNoise++; return null }

            const brandName = matchBrand(rj.channel_id, brandMappings) ?? FALLBACK_BRAND
            try {
              const result = await classifyMessage(rj, brandName, identity.userId)
              if (!result) { totalAiSkip++; return null }
              return {
                workspace_id: workspaceId,
                brand_name: result.brand || brandName,
                raw_message_id: raw.id,
                thread_count: rj.reply_count,
                type: 'slack',
                tags: result.tags,
                channel: rj.channel,
                source_id: rj.ts,
                source_ref: buildSourceRef(identity.domain, rj.channel_id, rj.ts),
                title: result.title,
                body: result.body,
                priority: result.priority,
                author: resolveUserName(userDir, rj.user, result.author || rj.user_name),
                occurred_at: tsToISO(rj.ts),
                reclassified_at: now,
              }
            } catch {
              totalError++
              return null
            }
          }))

          const valid = results.filter((r): r is UpsertRow => r !== null)
          totalProcessed += results.length
          skipped += results.length - valid.length

          if (valid.length > 0) {
            // 이전 분류 아카이브
            const oldSummaries = valid
              .filter(r => existingHistMap.has(r.raw_message_id))
              .map(r => {
                const old = existingHistMap.get(r.raw_message_id)!
                return { workspace_id: workspaceId, client_history_id: old.id, thread_count: old.thread_count, title: old.title, body: old.body ?? '' }
              })
            if (oldSummaries.length > 0) {
              await sb.from('client_history_summaries').insert(oldSummaries)
            }

            const { error: upsertErr } = await sb
              .from('client_history')
              .upsert(valid, { onConflict: 'workspace_id,source_id' })
            if (upsertErr) {
              totalUpsertFail += valid.length
              send('status', { message: `저장실패: ${upsertErr.message} (code: ${upsertErr.code})` })
            } else {
              classified += valid.length
            }
          }

          if (endIdx < rawRows.length) await delay(200)
        }

        const detail = [
          totalNoise > 0 ? `노이즈 ${totalNoise}` : '',
          totalAiSkip > 0 ? `AI제외 ${totalAiSkip}` : '',
          totalError > 0 ? `API오류 ${totalError}` : '',
          totalUpsertFail > 0 ? `저장실패 ${totalUpsertFail}` : '',
        ].filter(Boolean).join(', ')

        send('result', {
          date, classified,
          skipped: skipped + totalNoise + totalAiSkip + totalError,
          message: `완료 — raw ${rawRows.length}건, 처리 ${totalProcessed}건, 분류 ${classified}건${detail ? `, 제외(${detail})` : ''}`,
        })
      } catch (err) {
        console.error('[reclassify]', err)
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
