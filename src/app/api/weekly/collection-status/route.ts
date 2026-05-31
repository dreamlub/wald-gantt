import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { kstToday } from '@/lib/kst'

/** Date → 'YYYY-MM-DD' (로컬 기준, KST 환경에서 toISOString() 쓰면 하루 밀림) */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return ymd(d)
}

/** currentMonday 부터 oldestMonday 까지 월요일 목록을 내림차순으로 반환 */
function getMondaysBetween(currentMonday: string, oldestMonday: string): string[] {
  const result: string[] = []
  const cur = new Date(currentMonday + 'T00:00:00')
  const old = new Date(oldestMonday + 'T00:00:00')
  const d = new Date(cur)
  while (d >= old) {
    result.push(ymd(d))
    d.setDate(d.getDate() - 7)
  }
  return result
}

function weekEndOf(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00')
  d.setDate(d.getDate() + 4)
  return ymd(d)
}

function countSummaryItems(summary: unknown): number {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return 0
  const obj = summary as { items?: unknown; diff_summary?: { dropped_items?: unknown } }
  const items = Array.isArray(obj.items) ? obj.items.length : 0
  const dropped = Array.isArray(obj.diff_summary?.dropped_items)
    ? obj.diff_summary.dropped_items.length
    : 0
  return items + dropped
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

  const { data: teams, error: teamsError } = await sb
    .from('weekly_sources')
    .select('id, label, sort_order, collection_id')
    .eq('workspace_id', member.workspace_id)
    .order('sort_order')
  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })

  const today     = kstToday()
  const curMonday = getMondayOf(today)

  // DB에 저장된 모든 주차 조회 (가장 오래된 주차 파악용)
  // PostgREST 기본 1000행 캡 → .range()로 끝까지 순회해 누락 없이 수집
  type WReportRow = { team: string; week_start: string; summary: unknown }
  const reports: WReportRow[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error: pageError } = await sb
      .from('weekly_reports')
      .select('team, week_start, summary')
      .eq('workspace_id', member.workspace_id)
      .order('week_start', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 })
    const batch = (page ?? []) as WReportRow[]
    reports.push(...batch)
    if (batch.length < PAGE) break
  }

  // 2026-01-01 이후 데이터만 표시 — 그 이전은 제외
  const FLOOR = '2026-01-01'
  const allWeekStarts = (reports ?? []).map(r => r.week_start as string).filter(w => w >= FLOOR)
  const oldestWeek    = allWeekStarts.length > 0 ? allWeekStarts[0] : curMonday
  const oldestMonday  = getMondayOf(oldestWeek < FLOOR ? FLOOR : oldestWeek)

  const mondays = getMondaysBetween(curMonday, oldestMonday)

  // week_start(비-월요일일 수 있음) → 해당 주 월요일로 정규화 후 매핑
  const reportMap = new Map<string, Map<string, number>>()
  for (const r of (reports ?? [])) {
    const monday = getMondayOf(r.week_start)   // 어떤 요일이든 해당 주 월요일로
    if (!reportMap.has(monday)) reportMap.set(monday, new Map())
    const prev = reportMap.get(monday)!.get(r.team) ?? 0
    reportMap.get(monday)!.set(r.team, prev + countSummaryItems(r.summary))
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
