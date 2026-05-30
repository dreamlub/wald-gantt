import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { kstDate, kstToday } from '@/lib/kst'
import type { IssueStatsResponse } from '@/app/(app)/stats/_lib/stats-types'
import { EMPTY_ISSUE_STATS } from '@/app/(app)/stats/_lib/stats-types'

interface IssueRow {
  title: string
  type: string | null
  status: string | null
  brand_name: string | null
  first_seen: string | null
  last_seen: string | null
}

const TYPE_LABEL: Record<string, string> = { issue: '이슈', decision: '의사결정', project: '프로젝트' }

function dayDiffYMD(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

// 해결 소요시간 버킷 (일)
const BUCKETS: { label: string; max: number }[] = [
  { label: '≤3일', max: 3 }, { label: '4–7일', max: 7 }, { label: '8–14일', max: 14 },
  { label: '15–30일', max: 30 }, { label: '31–60일', max: 60 }, { label: '60일+', max: Infinity },
]

// GET /api/stats/issues — 이슈 트래커 현황 집계 (워크스페이스 스코프)
export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json(EMPTY_ISSUE_STATS)
  const wsId = member.workspace_id

  const [{ data: issueData }, { count: relCount }] = await Promise.all([
    sb.from('issues')
      .select('title, type, status, brand_name, first_seen, last_seen')
      .eq('workspace_id', wsId).limit(5000),
    sb.from('issue_relations').select('*', { count: 'exact', head: true }).eq('workspace_id', wsId),
  ])
  const issues = (issueData ?? []) as IssueRow[]
  if (issues.length === 0) return NextResponse.json({ ...EMPTY_ISSUE_STATS, totals: { ...EMPTY_ISSUE_STATS.totals, relations: relCount ?? 0 } })

  const today = kstToday()
  let open = 0, closed = 0, resolveSum = 0, resolveN = 0
  const typeMap = new Map<string, { open: number; closed: number }>()
  const brandMap = new Map<string, { open: number; closed: number }>()
  const bucketCount = BUCKETS.map(() => 0)
  const aging: { title: string; brand: string; days: number }[] = []

  for (const it of issues) {
    const isOpen = it.status !== 'closed'
    if (isOpen) open++; else closed++

    const t = it.type && TYPE_LABEL[it.type] ? it.type : 'issue'
    const tm = typeMap.get(t) ?? { open: 0, closed: 0 }
    tm[isOpen ? 'open' : 'closed']++
    typeMap.set(t, tm)

    const brand = it.brand_name?.trim() || '미분류'
    const bm = brandMap.get(brand) ?? { open: 0, closed: 0 }
    bm[isOpen ? 'open' : 'closed']++
    brandMap.set(brand, bm)

    if (!isOpen && it.first_seen && it.last_seen) {
      const d = dayDiffYMD(kstDate(it.first_seen), kstDate(it.last_seen))
      if (d >= 0) {
        resolveSum += d; resolveN++
        const bi = BUCKETS.findIndex(b => d <= b.max)
        if (bi >= 0) bucketCount[bi]++
      }
    }
    if (isOpen && it.last_seen) {
      aging.push({ title: it.title, brand, days: dayDiffYMD(kstDate(it.last_seen), today) })
    }
  }

  const payload: IssueStatsResponse = {
    totals: {
      total: issues.length, open, closed,
      avgResolveDays: resolveN > 0 ? Math.round(resolveSum / resolveN) : 0,
      relations: relCount ?? 0,
    },
    byType: ['issue', 'decision', 'project']
      .filter(t => typeMap.has(t))
      .map(t => ({ type: t, label: TYPE_LABEL[t], ...typeMap.get(t)! })),
    resolutionBuckets: BUCKETS.map((b, i) => ({ label: b.label, count: bucketCount[i] })),
    aging: aging.sort((a, b) => b.days - a.days).slice(0, 12),
    brandLoad: [...brandMap.entries()]
      .map(([brand, v]) => ({ brand, ...v }))
      .sort((a, b) => b.open - a.open || (b.open + b.closed) - (a.open + a.closed))
      .slice(0, 10),
  }
  return NextResponse.json(payload)
}
