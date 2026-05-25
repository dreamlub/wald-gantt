import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client, HistoryItem, HistoryType, StatusKind, Priority, Tag } from '@/app/(app)/summary/_lib/types'
import { kstDayEnd, kstDayStart, toKSTDate } from '@/lib/history-query-utils'

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
  const PAGE = 1000

  // thread reply IDs: DB에서 집계 (max_rows 제한 없음)
  const replyResult = await client.rpc('get_thread_reply_raw_ids', {
    p_workspace_id: await getWorkspaceId(client),
  })
  const threadReplyRawIds = new Set<string>(
    (replyResult.data ?? []).map((r: { id: string }) => r.id)
  )

  // client_history 전체를 1000행씩 페이지네이션
  const allRows: DbHistory[] = []
  let from = 0
  while (true) {
    const { data, error } = await client
      .from('client_history')
      .select('*')
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    allRows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  return allRows
    .filter(row => !row.raw_message_id || !threadReplyRawIds.has(row.raw_message_id))
    .map(toHistory)
}

async function getWorkspaceId(client: Sb): Promise<string> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { data: member } = await client
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!member) throw new Error('no workspace')
  return member.workspace_id
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
  brandCounts?: Record<string, number>
}

type BrandCountRow = {
  brand_name: string | null
  count: number | string | null
}

export function rowsToBrandCounts(rows: Array<{ brand_name: string | null }>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const brand = row.brand_name ?? '미분류'
    counts[brand] = (counts[brand] ?? 0) + 1
  }
  return counts
}

export function normalizeBrandCountRows(rows: BrandCountRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const brand = row.brand_name ?? '미분류'
    const count = typeof row.count === 'string' ? Number(row.count) : row.count
    counts[brand] = count !== null && Number.isFinite(count) ? count : 0
  }
  return counts
}

async function fetchBrandCountsFromRpc(client: Sb, params: HistoryPageParams): Promise<Record<string, number> | null> {
  const { data, error } = await client.rpc('get_history_brand_counts', {
    p_from: params.from ? kstDayStart(params.from) : null,
    p_to: params.to ? kstDayEnd(params.to) : null,
    p_brand: params.brand ?? null,
    p_priority: params.priority ?? null,
    p_tags: params.tags ?? null,
    p_author: params.author ?? null,
    p_q: params.q ?? null,
  })

  if (error || !data) return null
  return normalizeBrandCountRows(data as BrandCountRow[])
}

async function fetchBrandCountsFallback(client: Sb, params: HistoryPageParams): Promise<Record<string, number>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let brandQ: any = client.from('client_history').select('brand_name').is('deleted_at', null)
  if (params.from)     brandQ = brandQ.gte('occurred_at', kstDayStart(params.from))
  if (params.to)       brandQ = brandQ.lte('occurred_at', kstDayEnd(params.to))
  if (params.brand)    brandQ = brandQ.eq('brand_name', params.brand)
  if (params.priority) brandQ = brandQ.eq('priority', params.priority)
  if (params.tags?.length) brandQ = brandQ.contains('tags', params.tags)
  if (params.author)   brandQ = brandQ.eq('author', params.author)
  if (params.q)        brandQ = brandQ.or(`title.ilike.%${params.q}%,body.ilike.%${params.q}%,channel.ilike.%${params.q}%,author.ilike.%${params.q}%`)

  const { data, error } = await brandQ
  if (error) throw error
  return rowsToBrandCounts(data ?? [])
}

async function fetchBrandCounts(client: Sb, params: HistoryPageParams): Promise<Record<string, number> | undefined> {
  if (params.cursor) return undefined
  const facetParams = { ...params, brand: undefined }
  const rpcCounts = await fetchBrandCountsFromRpc(client, facetParams)
  return rpcCounts ?? fetchBrandCountsFallback(client, facetParams)
}

export async function listHistoryPage(params: HistoryPageParams, sb?: Sb): Promise<HistoryPage> {
  const client = sb ?? createBrowserClient()
  const limit = Math.min(params.limit ?? 50, 200)

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
    if (params.from) q = q.gte('occurred_at', kstDayStart(params.from)) as T
    if (params.to) q = q.lte('occurred_at', kstDayEnd(params.to)) as T
    if (params.brand) q = q.eq('brand_name', params.brand) as T
    if (params.priority) q = q.eq('priority', params.priority) as T
    if (params.tags?.length) q = q.contains('tags', params.tags) as T
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

  const [pageResult, countResult, brandCounts] = await Promise.all([
    query, countQuery, fetchBrandCounts(client, params),
  ])
  if (pageResult.error) throw pageResult.error

  const items = (pageResult.data ?? []).map(toHistory)
  let nextCursor: string | null = null
  if (items.length === limit) {
    const last = items[items.length - 1]
    nextCursor = `${last.occurred_at}|${last.id}`
  }

  return { items, nextCursor, total: countResult.count ?? 0, brandCounts }
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

  if (from) query = query.gte('occurred_at', kstDayStart(from))
  if (to) query = query.lte('occurred_at', kstDayEnd(to))

  const { data, error } = await query
  if (error) throw error

  const rows = data ?? []
  const dateCounts: Record<string, number> = {}
  const tagCounts: Record<string, number> = {}
  const priorityCounts: Record<string, number> = {}
  const authorCounts: Record<string, number> = {}

  for (const r of rows) {
    const ymd = toKSTDate(r.occurred_at)
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
