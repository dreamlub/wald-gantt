import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { kstDate } from '@/lib/kst'
import type { ResourceStatsResponse, ResourcePair } from '@/app/(app)/stats/_lib/stats-types'
import { EMPTY_RESOURCE_STATS } from '@/app/(app)/stats/_lib/stats-types'

const WINDOW_WEEKS = 26
const PAGE = 1000

// YYYY-MM-DD → 그 주 월요일(YYYY-MM-DD)
function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // 월=0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

function addDaysUtc(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function buildPayload(
  pairMap: Map<string, ResourcePair>,
  weekSet: Set<string>,
): ResourceStatsResponse {
  const sortedWeeks = [...weekSet].sort()
  const weeks: string[] = []
  if (sortedWeeks.length > 0) {
    let w = sortedWeeks[0]
    const last = sortedWeeks[sortedWeeks.length - 1]
    while (w <= last) { weeks.push(w); w = addDaysUtc(w, 7) }
  }
  return {
    weeks,
    pairs: [...pairMap.values()].filter(p => p.total >= 2).sort((a, b) => b.total - a.total),
  }
}

// ── 슬랙: client_history 메시지 건수 기반 ─────────────────────
async function fromSlack(wsId: string, sb: Awaited<ReturnType<typeof createClient>>): Promise<ResourceStatsResponse> {
  const sinceUtc = new Date(Date.now() - WINDOW_WEEKS * 7 * 86400000).toISOString()
  type Row = { author: string | null; brand_name: string | null; occurred_at: string }
  const { data, error } = await sb
    .from('client_history')
    .select('author, brand_name, occurred_at')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .gte('occurred_at', sinceUtc)
    .order('occurred_at', { ascending: true })
    .limit(50000)
  if (error) throw error
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return EMPTY_RESOURCE_STATS

  const pairMap = new Map<string, ResourcePair>()
  const weekSet = new Set<string>()
  for (const r of rows) {
    const author = r.author?.trim()
    const brand  = r.brand_name?.trim()
    if (!author || !brand) continue
    const week = mondayOf(kstDate(r.occurred_at))
    weekSet.add(week)
    const key = `${author}\0${brand}`
    let pair = pairMap.get(key)
    if (!pair) { pair = { author, brand, total: 0, weeks: {} }; pairMap.set(key, pair) }
    pair.total++
    pair.weeks[week] = (pair.weeks[week] ?? 0) + 1
  }
  return buildPayload(pairMap, weekSet)
}

// ── 주간보고: weekly_reports.summary items 기반 ────────────────
async function fromWeekly(wsId: string, sb: Awaited<ReturnType<typeof createClient>>): Promise<ResourceStatsResponse> {
  const sinceDate = mondayOf(
    new Date(Date.now() - WINDOW_WEEKS * 7 * 86400000).toISOString().slice(0, 10)
  )
  type ReportRow = { week_start: string; summary: { items?: { assignee?: string | null; brand?: string | null }[] } | null }
  const { data, error } = await sb
    .from('weekly_reports')
    .select('week_start, summary')
    .eq('workspace_id', wsId)
    .gte('week_start', sinceDate)
    .not('summary', 'is', null)
    .order('week_start', { ascending: true })
    .limit(500)
  if (error) throw error
  const reports = (data ?? []) as ReportRow[]
  if (reports.length === 0) return EMPTY_RESOURCE_STATS

  const pairMap = new Map<string, ResourcePair>()
  const weekSet = new Set<string>()

  for (const report of reports) {
    const items = report.summary?.items
    if (!Array.isArray(items)) continue
    const week = mondayOf(report.week_start)
    weekSet.add(week)
    for (const item of items) {
      const author = item.assignee?.trim()
      const brand  = item.brand?.trim()
      if (!author || !brand) continue
      const key = `${author}\0${brand}`
      let pair = pairMap.get(key)
      if (!pair) { pair = { author, brand, total: 0, weeks: {} }; pairMap.set(key, pair) }
      pair.total++
      pair.weeks[week] = (pair.weeks[week] ?? 0) + 1
    }
  }
  return buildPayload(pairMap, weekSet)
}

// GET /api/stats/resources?source=slack|weekly
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source') ?? 'slack'

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json(EMPTY_RESOURCE_STATS)

  try {
    const payload = source === 'weekly'
      ? await fromWeekly(member.workspace_id, sb)
      : await fromSlack(member.workspace_id, sb)
    return NextResponse.json(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
