import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { kstToday } from '@/lib/kst'

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function getRecentMondays(currentMonday: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(currentMonday + 'T00:00:00')
    d.setDate(d.getDate() - i * 7)
    return d.toISOString().slice(0, 10)
  })
}

function weekEndOf(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00')
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}

function countItems(rawContent: string | null): number {
  if (!rawContent) return 0
  return rawContent.split('\n').filter(l => {
    const t = l.trim()
    return t.startsWith('- ') || t.startsWith('* ')
  }).length
}

export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

  const { data: teams } = await sb
    .from('weekly_sources')
    .select('id, label, sort_order, collection_id')
    .eq('workspace_id', member.workspace_id)
    .order('sort_order')

  const today      = kstToday()
  const curMonday  = getMondayOf(today)
  const mondays    = getRecentMondays(curMonday, 8)
  const oldestWeek = mondays[mondays.length - 1]

  const { data: reports } = await sb
    .from('weekly_reports')
    .select('team, week_start, raw_content')
    .eq('workspace_id', member.workspace_id)
    .gte('week_start', oldestWeek)

  // week_start → team → itemCount
  const reportMap = new Map<string, Map<string, number>>()
  for (const r of (reports ?? [])) {
    if (!reportMap.has(r.week_start)) reportMap.set(r.week_start, new Map())
    reportMap.get(r.week_start)!.set(r.team, countItems(r.raw_content))
  }

  const teamList = teams ?? []
  const weeks = mondays.map(weekStart => ({
    weekStart,
    weekEnd:   weekEndOf(weekStart),
    isCurrent: weekStart === curMonday,
    teams: teamList.map(t => ({
      id:            t.id,
      label:         t.label,
      collection_id: t.collection_id,
      hasData:       reportMap.get(weekStart)?.has(t.label) ?? false,
      itemCount:     reportMap.get(weekStart)?.get(t.label) ?? 0,
    })),
  }))

  return NextResponse.json({ teams: teamList, weeks })
}
