import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { kstToday } from '@/lib/kst'
import type { ProjectStatsResponse } from '@/app/(app)/stats/_lib/stats-types'
import { EMPTY_PROJECT_STATS } from '@/app/(app)/stats/_lib/stats-types'

interface ProjRow {
  id: string
  name: string
  status: string | null
  start_date: string | null
  end_date: string | null
  category_id: string | null
  pm: string | null
}

// YYYY-MM-DD 문자열 간 일수 차 (b - a). 잘못된 값은 null.
function dayDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ta = Date.parse(`${a}T00:00:00Z`), tb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.round((tb - ta) / 86400000)
}

// GET /api/stats/projects — 프로젝트 현황·리스케줄 집계 (워크스페이스 스코프)
export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json(EMPTY_PROJECT_STATS)
  const wsId = member.workspace_id
  const today = kstToday()

  const [{ data: projData }, { data: catData }] = await Promise.all([
    sb.from('gantt_projects')
      .select('id, name, status, start_date, end_date, category_id, pm')
      .eq('workspace_id', wsId).is('deleted_at', null).limit(5000),
    sb.from('gantt_categories').select('id, name').eq('workspace_id', wsId).limit(1000),
  ])
  const projects = (projData ?? []) as ProjRow[]
  if (projects.length === 0) return NextResponse.json(EMPTY_PROJECT_STATS)
  const catName = new Map((catData ?? []).map(c => [c.id as string, c.name as string]))

  // 마감일(end_date) 변경 이력 — 프로젝트별 변경 횟수 + 누적 슬립
  const ids = projects.map(p => p.id)
  const histByProj = new Map<string, { old_value: string | null; new_value: string | null }[]>()
  for (let off = 0; ; off += 1000) {
    const { data: h } = await sb.from('gantt_project_history')
      .select('project_id, old_value, new_value')
      .in('project_id', ids).eq('field_name', 'end_date')
      .order('changed_at', { ascending: true }).range(off, off + 999)
    const batch = h ?? []
    for (const row of batch) {
      const arr = histByProj.get(row.project_id) ?? []
      arr.push({ old_value: row.old_value, new_value: row.new_value })
      histByProj.set(row.project_id, arr)
    }
    if (batch.length < 1000) break
  }

  const nameById = new Map(projects.map(p => [p.id, p.name]))
  const reschedule = [...histByProj.entries()]
    .map(([pid, changes]) => {
      const first = changes[0]?.old_value ?? changes[0]?.new_value ?? null
      const last = changes[changes.length - 1]?.new_value ?? null
      return { name: nameById.get(pid) ?? '(삭제됨)', changes: changes.length, slipDays: dayDiff(first, last) ?? 0 }
    })
    .sort((a, b) => b.changes - a.changes || b.slipDays - a.slipDays)
    .slice(0, 10)

  // 상태 카운트 + 마감 초과
  let todo = 0, inProgress = 0, done = 0, overdue = 0
  const deadlines: ProjectStatsResponse['deadlines'] = []
  const catCount = new Map<string, number>()
  const pmCount = new Map<string, number>()
  for (const p of projects) {
    if (p.status === 'done') done++
    else if (p.status === 'in-progress') inProgress++
    else todo++ // to-do + backlog 등

    const isOpen = p.status !== 'done'
    if (isOpen && p.end_date) {
      const left = dayDiff(today, p.end_date)
      if (left !== null) {
        if (left < 0) overdue++
        if (left <= 7) deadlines.push({ name: p.name, endDate: p.end_date, daysLeft: left, overdue: left < 0 })
      }
    }
    if (isOpen) {
      const cn = p.category_id ? (catName.get(p.category_id) ?? '미분류') : '미분류'
      catCount.set(cn, (catCount.get(cn) ?? 0) + 1)
      const pm = p.pm?.trim()
      if (pm) pmCount.set(pm, (pmCount.get(pm) ?? 0) + 1)
    }
  }
  deadlines.sort((a, b) => a.daysLeft - b.daysLeft)

  const rescheduledCount = histByProj.size
  const totalChanges = [...histByProj.values()].reduce((s, c) => s + c.length, 0)
  const topN = (m: Map<string, number>, n: number) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n)

  const payload: ProjectStatsResponse = {
    totals: {
      total: projects.length, todo, inProgress, done, overdue,
      rescheduledCount,
      avgReschedule: rescheduledCount > 0 ? Math.round((totalChanges / rescheduledCount) * 10) / 10 : 0,
    },
    reschedule,
    deadlines: deadlines.slice(0, 12),
    byCategory: topN(catCount, 8),
    byPm: topN(pmCount, 8),
  }
  return NextResponse.json(payload)
}
