import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).single()
  if (!member) return Response.json({ error: 'No workspace' }, { status: 400 })
  const workspaceId = member.workspace_id

  const date = req.nextUrl.searchParams.get('date') ?? '2026-05-22'
  const fromIso = `${date}T00:00:00.000Z`
  const toIso   = `${date}T23:59:59.999Z`

  // client_history 샘플 (해당 날짜, 20건)
  const { data: hist } = await sb
    .from('client_history')
    .select('id, source_id, source_ref, raw_message_id, channel, author, title, thread_count, occurred_at')
    .eq('workspace_id', workspaceId)
    .gte('occurred_at', fromIso)
    .lte('occurred_at', toIso)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false })
    .limit(20)

  // 위 hist의 raw_message_id 로 raw_json 조회
  const rawIds = (hist ?? []).map(h => h.raw_message_id).filter(Boolean) as string[]
  const { data: rawMsgs } = rawIds.length > 0
    ? await sb.from('slack_raw_messages')
        .select('id, parent_ts, raw_json')
        .in('id', rawIds)
    : { data: [] }

  const rawMap = new Map((rawMsgs ?? []).map(r => [r.id, r]))

  const samples = (hist ?? []).map(h => {
    const raw = h.raw_message_id ? rawMap.get(h.raw_message_id) : null
    const rj = raw?.raw_json as Record<string, unknown> | null
    return {
      id: h.id,
      title: h.title?.slice(0, 40),
      channel: h.channel,
      source_id: h.source_id,
      source_ref: h.source_ref,
      raw_message_id: h.raw_message_id,
      thread_count: h.thread_count,
      occurred_at: h.occurred_at,
      raw_parent_ts: raw?.parent_ts ?? null,
      raw_ts: rj?.ts ?? null,
      raw_thread_ts: rj?.thread_ts ?? null,   // 저장됐다면
      raw_reply_count: rj?.reply_count ?? null,
      raw_replies_len: Array.isArray(rj?.replies) ? (rj.replies as unknown[]).length : null,
      source_id_matches_parent_ts: h.source_id === raw?.parent_ts,
      permalink: typeof rj?.permalink === 'string' ? rj.permalink : null,
      is_thread_reply_by_permalink: typeof rj?.permalink === 'string' && rj.permalink.includes('thread_ts='),
    }
  })

  // channel이 U로 시작하는 항목 개수 (DM 채널 감지)
  const dmCount = (hist ?? []).filter(h => /^U[A-Z0-9]+$/.test(h.channel ?? '')).length

  return Response.json({
    date,
    total_in_date: hist?.length ?? 0,
    dm_count: dmCount,
    samples,
  })
}
