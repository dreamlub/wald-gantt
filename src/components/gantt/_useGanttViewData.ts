import { useMemo } from 'react'
import {
  buildMonthRange, buildWeekRange, buildDayRange,
  formatYearMonth, MONTH_LABELS, monthOffset,
} from '@/lib/gantt-utils'
import type { WeekInfo, DayInfo } from '@/lib/gantt-utils'
import { kstToday } from '@/lib/kst'
import { COL_WIDTH, WEEK_COL_WIDTH, DAY_COL_WIDTH, type ViewMode } from './_GanttConstants'

export function useGanttViewData(viewMode: ViewMode, viewStart: string, viewEnd: string) {
  const months = buildMonthRange(viewStart, viewEnd)

  const colW = viewMode === 'week' ? WEEK_COL_WIDTH : viewMode === 'day' ? DAY_COL_WIDTH : COL_WIDTH

  const weeks = useMemo(
    () => viewMode === 'week' ? buildWeekRange(viewStart, viewEnd) : ([] as WeekInfo[]),
    [viewMode, viewStart, viewEnd]
  )
  const days = useMemo(
    () => viewMode === 'day' ? buildDayRange(viewStart, viewEnd) : ([] as DayInfo[]),
    [viewMode, viewStart, viewEnd]
  )
  const totalCols = viewMode === 'week' ? weeks.length : viewMode === 'day' ? days.length : months.length
  const totalWidth = colW * totalCols

  const yearGroups = useMemo(() => {
    const groups: { year: number; count: number }[] = []
    for (const year of (viewMode === 'month' ? months.map(ym => parseInt(ym)) : viewMode === 'week' ? weeks.map(w => w.year) : days.map(d => d.year))) {
      if (!groups.length || groups[groups.length-1].year !== year) groups.push({ year, count: 1 })
      else groups[groups.length-1].count++
    }
    return groups
  }, [viewMode, months, weeks, days])

  const monthGroups = useMemo(() => {
    const groups: { ym: string; label: string; count: number }[] = []
    for (const item of (viewMode === 'week' ? weeks : viewMode === 'day' ? days : []) as { year: number; month: number }[]) {
      const ym = formatYearMonth(item.year, item.month)
      if (!groups.length || groups[groups.length-1].ym !== ym) groups.push({ ym, label: MONTH_LABELS[item.month-1], count: 1 })
      else groups[groups.length-1].count++
    }
    return groups
  }, [viewMode, weeks, days])

  const gridLinePositions = useMemo(() => {
    const positions: number[] = []
    if (viewMode === 'month') {
      for (let i = 1; i < months.length; i++) positions.push(i * colW)
    } else if (viewMode === 'week') {
      let acc = 0
      for (let g = 0; g < monthGroups.length - 1; g++) {
        acc += monthGroups[g].count
        positions.push(acc * colW)
      }
    } else {
      for (let i = 1; i < days.length; i++) {
        if (days[i].date.getDay() === 0) positions.push(i * colW)
      }
    }
    return positions
  }, [viewMode, months, monthGroups, days, colW])

  // KST 기준 오늘 (로캘 무관하게 KST 날짜로 고정 후 그 날짜를 로컬 자정으로 앵커링)
  const todayStr = kstToday()
  const todayYM  = todayStr.slice(0, 7)
  const _today   = new Date(`${todayStr}T00:00:00`)

  let todayX: number | null = null
  if (viewMode === 'month') {
    const col = monthOffset(viewStart, todayYM)
    if (col >= 0 && col < totalCols) {
      const dayOfMonth  = _today.getDate()
      const daysInMonth = new Date(_today.getFullYear(), _today.getMonth() + 1, 0).getDate()
      todayX = col * colW + (dayOfMonth - 1) / daysInMonth * colW
    }
  } else if (viewMode === 'week') {
    const idx = weeks.findIndex(w => { const e = new Date(w.weekStart); e.setDate(e.getDate() + 7); return _today >= w.weekStart && _today < e })
    if (idx >= 0) {
      const dayOfWeek = (_today.getDay() + 6) % 7
      todayX = idx * colW + (dayOfWeek + 0.5) / 7 * colW
    }
  } else {
    const idx = days.findIndex(d => d.key === todayStr)
    todayX = idx >= 0 ? idx * colW + colW / 2 : null
  }

  return {
    months, colW, weeks, days, totalCols, totalWidth,
    yearGroups, monthGroups, gridLinePositions,
    todayStr, todayYM, todayX,
  }
}
