import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { kstToday } from '@/lib/kst'
import type { ReviewStatsResponse } from '@/app/(app)/stats/_lib/stats-types'
import { EMPTY_REVIEW_STATS } from '@/app/(app)/stats/_lib/stats-types'

interface RcRow {
  source: string
  status: string
  brand: string | null
  title: string
  created_at: string | null
  reviewed_at: string | null
  source_date: string | null
}

const SOURCE_LABEL: Record<string, string> = {
  daily_report: 'Daily', weekly: 'Weekly', note: 'Note', history: 'History',
}

function dayDiff(aIso: string, bYmd: string): number {
  const a = Date.parse(aIso)
  const b = Date.parse(`${bYmd}T00:00:00Z`)
  return Math.round((b - a) / 86400000)
}

// GET /api/stats/review — 일감 판단 큐 진단 (워크스페이스 스코프)
export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json(EMPTY_REVIEW_STATS)

  const { data } = await sb.from('review_candidates')
    .select('source, status, brand, title, created_at, reviewed_at, source_date')
    .eq('workspace_id', member.workspace_id).limit(5000)
  const rows = (data ?? []) as RcRow[]
  if (rows.length === 0) return NextResponse.json(EMPTY_REVIEW_STATS)

  const today = kstToday()
  const statusTotals = { pending: 0, created: 0, snoozed: 0, ignored: 0 }
  const sourceMap = new Map<string, number>()
  let dwellSum = 0, dwellN = 0
  const pendingAging: { title: string; brand: string; days: number }[] = []

  for (const r of rows) {
    if (r.status in statusTotals) statusTotals[r.status as keyof typeof statusTotals]++
    sourceMap.set(r.source, (sourceMap.get(r.source) ?? 0) + 1)

    if (r.status !== 'pending' && r.created_at && r.reviewed_at) {
      const d = Math.round((Date.parse(r.reviewed_at) - Date.parse(r.created_at)) / 86400000)
      if (d >= 0) { dwellSum += d; dwellN++ }
    }
    if (r.status === 'pending') {
      const base = r.created_at ? r.created_at : (r.source_date ? `${r.source_date}T00:00:00Z` : null)
      if (base) pendingAging.push({ title: r.title, brand: r.brand?.trim() || '미분류', days: dayDiff(base, today) })
    }
  }

  const payload: ReviewStatsResponse = {
    statusTotals,
    bySource: ['daily_report', 'weekly', 'note', 'history']
      .filter(s => sourceMap.has(s))
      .map(s => ({ source: s, label: SOURCE_LABEL[s] ?? s, count: sourceMap.get(s)! })),
    avgDwellDays: dwellN > 0 ? Math.round(dwellSum / dwellN) : 0,
    pendingAging: pendingAging.sort((a, b) => b.days - a.days).slice(0, 12),
  }
  return NextResponse.json(payload)
}
