import type { SupabaseClient } from '@supabase/supabase-js'
import type { HistoryItem, ThreadReply, SummaryVersion } from './types'

type RawJson = { ts?: string; user_name?: string; user?: string; text?: string }

export async function fetchThreadRepliesForItem(
  sb: SupabaseClient,
  item: Pick<HistoryItem, 'raw_message_id' | 'source_id' | 'channel'>,
): Promise<ThreadReply[]> {
  if (!item.source_id) return []

  const parentTs = item.source_id

  // 1. permalink에 thread_ts=PARENT_TS가 있는 raw 메시지 = 해당 스레드의 답글
  const { data: rawRows, error: rawErr } = await sb
    .from('slack_raw_messages')
    .select('id, raw_json')
    .eq('channel', item.channel)
    .filter('raw_json->>permalink', 'like', `%thread_ts=${parentTs}%`)

  if (rawErr) throw rawErr

  const replyRows = (rawRows ?? [])
    .filter(r => {
      const rj = r.raw_json as RawJson | null
      return !!rj?.ts && rj.ts !== parentTs
    })
    .sort((a, b) => {
      const aTs = parseFloat((a.raw_json as RawJson).ts ?? '0')
      const bTs = parseFloat((b.raw_json as RawJson).ts ?? '0')
      return aTs - bTs
    })

  if (replyRows.length === 0) return []

  // 2. client_history에서 author + AI 요약(title, body) 조회
  const rawIds = replyRows.map(r => r.id)
  const { data: histRows } = await sb
    .from('client_history')
    .select('raw_message_id, author, title, body')
    .in('raw_message_id', rawIds)
    .is('deleted_at', null)

  const histByRawId = new Map(
    (histRows ?? [])
      .filter(h => h.raw_message_id)
      .map(h => [h.raw_message_id as string, h])
  )

  return replyRows.map(r => {
    const rj = r.raw_json as RawJson
    const hist = histByRawId.get(r.id)
    return {
      author: hist?.author || rj.user_name || rj.user || '',
      occurred_at: new Date(parseFloat(rj.ts!) * 1000).toISOString(),
      text: rj.text || '',
      ai_title: hist?.title ?? null,
      ai_body: hist?.body ?? null,
    }
  })
}

export async function fetchSummaryVersions(
  sb: SupabaseClient,
  clientHistoryId: string,
): Promise<SummaryVersion[]> {
  const { data, error } = await sb
    .from('client_history_summaries')
    .select('id, thread_count, title, body, archived_at')
    .eq('client_history_id', clientHistoryId)
    .order('archived_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SummaryVersion[]
}
