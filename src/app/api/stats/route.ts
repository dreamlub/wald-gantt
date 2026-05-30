import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { kstDate, kstParts, kstHour, kstToday, kstDayStart, addDaysYMD, kstDateRange } from '@/lib/kst'
import type { Tag, Priority } from '@/app/(app)/slack/_lib/types'
import type {
  StatsResponse, DailyVolumePoint, BrandBreakdownRow, TaskStatus,
} from '@/app/(app)/stats/_lib/stats-types'
import { EMPTY_STATS } from '@/app/(app)/stats/_lib/stats-types'

const TAG_KEYS: Tag[] = ['issue', 'decision', 'mention', 'schedule']
const PRIORITY_KEYS: Priority[] = ['high', 'medium', 'low']
const TASK_STATUSES: TaskStatus[] = ['to-do', 'in-progress', 'done', 'backlog']

interface ChRow {
  occurred_at: string
  brand_name: string | null
  tags: string[] | null
  priority: string | null
  author: string | null
  channel: string | null
}

// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
// 기본 기간: 최근 90일. KST 기준 일별 집계.
export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json(EMPTY_STATS)
  const wsId = member.workspace_id

  // ── 기간 파싱 (KST YYYY-MM-DD) ────────────────────────────
  const sp = req.nextUrl.searchParams
  const to = sp.get('to') || kstToday()
  const from = sp.get('from') || addDaysYMD(to, -89)
  const dates = kstDateRange(from, to)
  const gte = kstDayStart(from)
  const lt = kstDayStart(addDaysYMD(to, 1)) // 반열린 구간 [from, to+1)

  // ── client_history (분류 메시지) ──────────────────────────
  // PostgREST db-max-rows(기본 1000) 때문에 .limit()만으로는 전체를 못 받는다.
  // .range()로 페이지를 끝까지 순회해 누락 없이 집계한다.
  const rows: ChRow[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data: page } = await sb
      .from('client_history')
      .select('occurred_at, brand_name, tags, priority, author, channel')
      .eq('workspace_id', wsId)
      .is('deleted_at', null)
      .gte('occurred_at', gte)
      .lt('occurred_at', lt)
      .order('occurred_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    const batch = (page ?? []) as ChRow[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }

  // 일별 볼륨 (전체 날짜를 0으로 초기화 → 빈 날도 축에 표시)
  const dayMap = new Map<string, DailyVolumePoint>()
  for (const d of dates) dayMap.set(d, { date: d, total: 0, issue: 0, decision: 0, schedule: 0, mention: 0 })

  const brandMap = new Map<string, BrandBreakdownRow>()
  const tagTotal: Record<Tag, number> = { issue: 0, decision: 0, mention: 0, schedule: 0 }
  const priTotal: Record<Priority, number> = { high: 0, medium: 0, low: 0 }
  const weekday = [0, 0, 0, 0, 0, 0, 0]
  const hourly = Array(24).fill(0)
  const channelMap = new Map<string, number>()
  const authorMap = new Map<string, number>()

  for (const r of rows) {
    const { ymd, dow } = kstParts(r.occurred_at)
    const day = dayMap.get(ymd)
    if (day) day.total++
    weekday[dow]++
    hourly[kstHour(r.occurred_at)]++

    const brand = r.brand_name?.trim() || '미분류'
    const b = brandMap.get(brand) ?? { brand, total: 0, issue: 0, decision: 0, schedule: 0, mention: 0 }
    b.total++

    for (const raw of r.tags ?? []) {
      if ((TAG_KEYS as string[]).includes(raw)) {
        const t = raw as Tag
        tagTotal[t]++
        if (day) day[t]++
        b[t]++
      }
    }
    brandMap.set(brand, b)

    if (r.priority && (PRIORITY_KEYS as string[]).includes(r.priority)) priTotal[r.priority as Priority]++
    if (r.channel) channelMap.set(r.channel, (channelMap.get(r.channel) ?? 0) + 1)
    if (r.author) authorMap.set(r.author, (authorMap.get(r.author) ?? 0) + 1)
  }

  const dailyVolume = dates.map(d => dayMap.get(d)!)
  const brandBreakdown = [...brandMap.values()].sort((a, b) => b.total - a.total)
  const activeDays = dailyVolume.filter(d => d.total > 0).length
  const topN = (m: Map<string, number>, n: number) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n)

  // ── 투두 (gantt_tasks + gantt_task_history) ───────────────
  const { data: taskRows } = await sb
    .from('gantt_tasks')
    .select('id, status, created_at, deleted_at')
    .eq('workspace_id', wsId)
    .limit(5000)
  const tasks = taskRows ?? []
  const taskIds = tasks.map(t => t.id)

  const statusNow: Record<TaskStatus, number> = { 'to-do': 0, 'in-progress': 0, done: 0, backlog: 0 }
  const todoDayMap = new Map<string, { date: string; completed: number; created: number }>()
  for (const d of dates) todoDayMap.set(d, { date: d, completed: 0, created: 0 })

  let createdInRange = 0
  for (const t of tasks) {
    if (!t.deleted_at && t.status && (TASK_STATUSES as string[]).includes(t.status)) {
      statusNow[t.status as TaskStatus]++
    }
    if (t.created_at) {
      const day = todoDayMap.get(kstDate(t.created_at))
      if (day) { day.created++; createdInRange++ }
    }
  }

  let completedInRange = 0
  if (taskIds.length > 0) {
    const { data: histRows } = await sb
      .from('gantt_task_history')
      .select('changed_at, new_value')
      .in('task_id', taskIds)
      .eq('field_name', 'status')
      .eq('new_value', 'done')
      .gte('changed_at', gte)
      .lt('changed_at', lt)
      .limit(10000)
    for (const h of histRows ?? []) {
      const day = todoDayMap.get(kstDate(h.changed_at))
      if (day) { day.completed++; completedInRange++ }
    }
  }

  // ── 데일리리포트 커버리지 (기간 내 날짜별 생성 여부) ───────
  // report_date는 date 컬럼(KST 날짜) → 범위 문자열 직접 비교
  const { data: reportRows } = await sb
    .from('daily_reports')
    .select('report_date, item_count')
    .eq('workspace_id', wsId)
    .gte('report_date', from)
    .lte('report_date', to)
    .limit(2000)
  const reportMap = new Map<string, number>()
  for (const r of reportRows ?? []) reportMap.set(r.report_date as string, (r.item_count as number) ?? 0)
  const reportCoverage = dates.map(d => ({ date: d, has: reportMap.has(d), items: reportMap.get(d) ?? 0 }))
  const reportDays = reportMap.size

  const payload: StatsResponse = {
    range: { from, to, days: dates.length },
    totals: {
      messages: rows.length,
      activeDays,
      avgPerDay: activeDays > 0 ? Math.round((rows.length / activeDays) * 10) / 10 : 0,
      brands: brandMap.size,
      issues: tagTotal.issue,
      todosCompleted: completedInRange,
    },
    dailyVolume,
    brandBreakdown,
    tagTotals: TAG_KEYS.map(tag => ({ tag, count: tagTotal[tag] })),
    priorityTotals: priTotal,
    todo: {
      daily: dates.map(d => todoDayMap.get(d)!),
      statusNow,
      completedInRange,
      createdInRange,
    },
    weekday,
    hourly,
    topChannels: topN(channelMap, 6),
    topAuthors: topN(authorMap, 6),
    reportCoverage,
    reportDays,
  }

  return NextResponse.json(payload)
}
