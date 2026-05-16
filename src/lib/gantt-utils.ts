// 'YYYY-MM' 형식 유틸리티
import { format } from 'date-fns'

// ── KST(UTC+9) 유틸 ───────────────────────────────────────────

/** KST(UTC+9) 기준 오늘 날짜 문자열 "YYYY-MM-DD" 반환 */
export function todayStrKST(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** KST(UTC+9) 기준 현재 연도 */
export function currentYearKST(): number {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear()
}

/** "YYYY-MM-DD" 문자열을 로컬 자정 Date로 파싱 (UTC midnight 파싱 문제 방지) */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** ISO/날짜 문자열 → Date (invalid면 undefined) */
export function toDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

/** Date → "YYYY-MM-DD" (없으면 null) */
export function toDateStr(d: Date | undefined): string | null {
  if (!d) return null
  return format(d, 'yyyy-MM-dd')
}

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [year, month] = ym.split('-').map(Number)
  return { year, month }
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function buildMonthRange(startYM: string, endYM: string): string[] {
  const result: string[] = []
  const start = parseYearMonth(startYM)
  const end = parseYearMonth(endYM)

  let year = start.year
  let month = start.month
  while (year < end.year || (year === end.year && month <= end.month)) {
    result.push(formatYearMonth(year, month))
    month++
    if (month > 12) { month = 1; year++ }
  }
  return result
}

// 0-based column index of target relative to viewStart
export function monthOffset(viewStart: string, target: string): number {
  const s = parseYearMonth(viewStart)
  const t = parseYearMonth(target)
  return (t.year - s.year) * 12 + (t.month - s.month)
}

export function getDefaultViewRange(): { startYM: string; endYM: string } {
  const year = currentYearKST()
  return {
    startYM: `${year}-01`,
    endYM: `${year}-12`,
  }
}

export const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

// ── Day-level bar positioning ──────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** YYYY-MM-DD → fractional column offset from viewStart (YYYY-MM) */
export function dayOffset(viewStart: string, dateStr: string, edge: 'start' | 'end'): number {
  const [dy, dm, dd] = dateStr.split('-').map(Number)
  const { year: sy, month: sm } = parseYearMonth(viewStart)
  const monthIdx = (dy - sy) * 12 + (dm - sm)
  const dim = daysInMonth(dy, dm)
  if (edge === 'start') return monthIdx + (dd - 1) / dim
  return monthIdx + dd / dim
}

/** YYYY-MM-DD → fractional week column from weeks array */
export function dayOffsetInWeeks(weeks: WeekInfo[], dateStr: string, edge: 'start' | 'end'): number {
  const target = new Date(dateStr)
  for (let i = 0; i < weeks.length; i++) {
    const weekEnd = new Date(weeks[i].weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    if (target <= weekEnd) {
      if (edge === 'start') {
        const diff = Math.max(0, (target.getTime() - weeks[i].weekStart.getTime()) / (7 * 86400000))
        return i + diff
      } else {
        const diff = Math.min(1, (target.getTime() - weeks[i].weekStart.getTime()) / (7 * 86400000) + 1 / 7)
        return i + diff
      }
    }
  }
  return edge === 'start' ? 0 : weeks.length
}

/** fractional month column index → YYYY-MM-DD */
export function colFracToDate(viewStart: string, frac: number): string {
  const { year: sy, month: sm } = parseYearMonth(viewStart)
  const monthIdx = Math.floor(frac)
  const totalMonths = sy * 12 + (sm - 1) + monthIdx
  const year = Math.floor(totalMonths / 12)
  const month = (totalMonths % 12) + 1
  const dim = daysInMonth(year, month)
  const day = Math.round((frac - monthIdx) * dim) + 1
  const clampedDay = Math.max(1, Math.min(dim, day))
  return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

// ── Week view utilities ────────────────────────────────────

export interface WeekInfo {
  key: string
  weekStart: Date
  year: number
  month: number        // 1-based, month of Monday
  weekInMonth: number
  label: string        // 'W1', 'W2', ...
}

/** 주어진 월 범위에 포함되는 모든 주(월요일 기준)를 반환 */
export function buildWeekRange(startYM: string, endYM: string): WeekInfo[] {
  const { year: sy, month: sm } = parseYearMonth(startYM)
  const { year: ey, month: em } = parseYearMonth(endYM)

  // startYM 1일 기준으로, 그 이전 월요일로 이동
  const d0 = new Date(sy, sm - 1, 1)
  const dow = d0.getDay() // 0=일
  d0.setDate(d0.getDate() - (dow === 0 ? 6 : dow - 1))

  // endYM 마지막 날
  const dEnd = new Date(ey, em, 0)

  const weeks: WeekInfo[] = []
  const countByYM: Record<string, number> = {}
  const cur = new Date(d0)

  while (cur <= dEnd) {
    const year = cur.getFullYear()
    const month = cur.getMonth() + 1
    const ym = formatYearMonth(year, month)
    countByYM[ym] = (countByYM[ym] || 0) + 1
    weeks.push({
      key: `${ym}-W${countByYM[ym]}`,
      weekStart: new Date(cur),
      year,
      month,
      weekInMonth: countByYM[ym],
      label: `W${countByYM[ym]}`,
    })
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

/** weeks 배열에서 특정 월의 첫/마지막 주 인덱스를 반환 */
export function weekIndexOfMonth(weeks: WeekInfo[], ym: string, pos: 'first' | 'last'): number {
  if (pos === 'first') return weeks.findIndex(w => formatYearMonth(w.year, w.month) === ym)
  let last = -1
  weeks.forEach((w, i) => { if (formatYearMonth(w.year, w.month) === ym) last = i })
  return last
}

// ── Day view utilities ─────────────────────────────────────

export interface DayInfo {
  key: string        // 'YYYY-MM-DD'
  date: Date
  year: number
  month: number      // 1-based
  day: number        // 1-based
  isWeekend: boolean
}

/** 주어진 월 범위에 포함되는 모든 날(일요일=0 기준 주말 표시)을 반환 */
export function buildDayRange(startYM: string, endYM: string): DayInfo[] {
  const { year: sy, month: sm } = parseYearMonth(startYM)
  const { year: ey, month: em } = parseYearMonth(endYM)
  const endDate = new Date(ey, em, 0)  // endYM 마지막 날
  const result: DayInfo[] = []
  const cur = new Date(sy, sm - 1, 1)
  while (cur <= endDate) {
    const year = cur.getFullYear()
    const month = cur.getMonth() + 1
    const day = cur.getDate()
    const dow = cur.getDay()
    result.push({
      key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      date: new Date(cur),
      year, month, day,
      isWeekend: dow === 0 || dow === 6,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}
