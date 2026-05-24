import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client, HistoryItem, HistoryType, StatusKind, Priority, Tag } from '@/app/(app)/summary/_lib/types'

type Sb = SupabaseClient

// 브랜드명 → 색상 결정론적 할당 (팔레트 기반 해시)
const BRAND_PALETTE = [
  '#818cf8', '#34d399', '#fb7185', '#fbbf24',
  '#60a5fa', '#fb923c', '#a78bfa', '#4ade80',
  '#f472b6', '#38bdf8', '#e879f9', '#2dd4bf',
]

export function brandColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return BRAND_PALETTE[Math.abs(hash) % BRAND_PALETTE.length]
}

interface DbHistory {
  id: string
  workspace_id: string
  brand_name: string | null
  type: HistoryType
  tags: Tag[] | null
  channel: string
  source_ref: string | null
  source_id: string | null
  title: string
  body: string | null
  occurred_at: string
  updated_at: string
  status: string | null
  status_kind: StatusKind | null
  priority: Priority | null
  author: string | null
  raw_message_id: string | null
  thread_count: number
  reclassified_at: string | null
  deleted_at: string | null
}

function toHistory(r: DbHistory): HistoryItem {
  return {
    id: r.id,
    brand_name: r.brand_name,
    type: r.type,
    tags: r.tags ?? [],
    channel: r.channel,
    source_id: r.source_id,
    source_ref: r.source_ref,
    title: r.title,
    body: r.body,
    occurred_at: r.occurred_at,
    updated_at: r.updated_at,
    status: r.status,
    status_kind: r.status_kind,
    priority: r.priority,
    author: r.author,
    raw_message_id: r.raw_message_id,
    thread_count: r.thread_count ?? 0,
    reclassified_at: r.reclassified_at,
  }
}

// Slack permalink에 ?thread_ts=X&... 가 있고 X !== ts 이면 스레드 답글
export function isThreadReplyPermalink(permalink: string, ts: string): boolean {
  try {
    const threadTs = new URL(permalink).searchParams.get('thread_ts')
    return !!threadTs && threadTs !== ts
  } catch {
    return false
  }
}

export async function listHistory(sb?: Sb): Promise<HistoryItem[]> {
  const client = sb ?? createBrowserClient()

  const [histResult, rawResult] = await Promise.all([
    client
      .from('client_history')
      .select('*')
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false }),
    client
      .from('slack_raw_messages')
      .select('id, raw_json'),
  ])

  if (histResult.error) throw histResult.error
  if (rawResult.error) throw rawResult.error

  const threadReplyRawIds = new Set<string>()
  for (const row of rawResult.data ?? []) {
    const rj = row.raw_json as { permalink?: string; ts?: string } | null
    if (rj?.permalink && rj?.ts && isThreadReplyPermalink(rj.permalink, rj.ts)) {
      threadReplyRawIds.add(row.id)
    }
  }

  const rows = histResult.data ?? []
  const filtered = rows.filter(row =>
    !row.raw_message_id || !threadReplyRawIds.has(row.raw_message_id)
  )

  return filtered.map(toHistory)
}

export interface HistoryPageParams {
  from?: string
  to?: string
  brand?: string
  priority?: string
  tags?: string[]
  author?: string
  q?: string
  cursor?: string
  limit?: number
}

export interface HistoryPage {
  items: HistoryItem[]
  nextCursor: string | null
  total: number
}

export async function listHistoryPage(params: HistoryPageParams, sb?: Sb): Promise<HistoryPage> {
  const client = sb ?? createBrowserClient()
  const limit = params.limit ?? 50

  let countQuery = client
    .from('client_history')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)

  let query = client
    .from('client_history')
    .select('*')
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  const applyFilters = <T extends typeof query>(q: T): T => {
    if (params.from) q = q.gte('occurred_at', params.from + 'T00:00:00') as T
    if (params.to) q = q.lte('occurred_at', params.to + 'T23:59:59') as T
    if (params.brand) q = q.eq('brand_name', params.brand) as T
    if (params.priority) q = q.eq('priority', params.priority) as T
    if (params.author) q = q.eq('author', params.author) as T
    if (params.q) q = q.or(`title.ilike.%${params.q}%,body.ilike.%${params.q}%,channel.ilike.%${params.q}%,author.ilike.%${params.q}%`) as T
    return q
  }

  query = applyFilters(query)
  countQuery = applyFilters(countQuery)

  if (params.cursor) {
    const [cursorDate, cursorId] = params.cursor.split('|')
    query = query.or(`occurred_at.lt.${cursorDate},and(occurred_at.eq.${cursorDate},id.lt.${cursorId})`)
  }

  const [pageResult, countResult] = await Promise.all([query, countQuery])
  if (pageResult.error) throw pageResult.error

  const items = (pageResult.data ?? []).map(toHistory)
  let nextCursor: string | null = null
  if (items.length === limit) {
    const last = items[items.length - 1]
    nextCursor = `${last.occurred_at}|${last.id}`
  }

  return { items, nextCursor, total: countResult.count ?? 0 }
}

export interface HistoryStats {
  dateCounts: Record<string, number>
  tagCounts: Record<string, number>
  priorityCounts: Record<string, number>
  authorCounts: Record<string, number>
  total: number
}

export async function getHistoryStats(from?: string, to?: string, sb?: Sb): Promise<HistoryStats> {
  const client = sb ?? createBrowserClient()

  let query = client
    .from('client_history')
    .select('occurred_at, tags, priority, author')
    .is('deleted_at', null)

  if (from) query = query.gte('occurred_at', from + 'T00:00:00')
  if (to) query = query.lte('occurred_at', to + 'T23:59:59')

  const { data, error } = await query
  if (error) throw error

  const rows = data ?? []
  const dateCounts: Record<string, number> = {}
  const tagCounts: Record<string, number> = {}
  const priorityCounts: Record<string, number> = {}
  const authorCounts: Record<string, number> = {}

  for (const r of rows) {
    const ymd = r.occurred_at.slice(0, 10)
    dateCounts[ymd] = (dateCounts[ymd] ?? 0) + 1
    if (r.priority) priorityCounts[r.priority] = (priorityCounts[r.priority] ?? 0) + 1
    if (r.author) authorCounts[r.author] = (authorCounts[r.author] ?? 0) + 1
    for (const t of r.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1
  }

  return { dateCounts, tagCounts, priorityCounts, authorCounts, total: rows.length }
}

// 히스토리에서 distinct 브랜드명 추출 → Client 배열 반환
export async function getDistinctBrands(sb?: Sb): Promise<Client[]> {
  const client = sb ?? createBrowserClient()
  const { data, error } = await client
    .from('client_history')
    .select('brand_name')
    .is('deleted_at', null)
    .not('brand_name', 'is', null)

  if (error) throw error

  const names = [...new Set((data ?? []).map(r => r.brand_name as string).filter(Boolean))]
  names.sort((a, b) => a.localeCompare(b, 'ko'))

  return names.map(name => ({ name, color: brandColor(name) }))
}
