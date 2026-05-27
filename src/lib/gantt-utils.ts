// 'YYYY-MM' 형식 유틸리티
import { format } from 'date-fns'

/** 1일의 밀리초 (24 * 60 * 60 * 1000) */
export const MS_PER_DAY = 86_400_000

/** hex 색상이 밝은 색인지 여부 (텍스트 색상 결정에 사용) */
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 0.299 + g * 0.587 + b * 0.114) > 170
}

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
  const parts = s.split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return undefined
  const d = new Date(parts[0], parts[1] - 1, parts[2])
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

/** ISO 타임스탬프 → "YYYY.MM.DD" (휴지통 삭제일 등 표시용) */
export function formatDateYMD(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

/** ISO 타임스탬프 → "YYYY.MM.DD  HH:MM" (히스토리 표시용) */
export function formatHistDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const STATUS_LABELS_MAP: Record<string, string> = {
  'to-do': 'To-Do', 'in-progress': 'In Progress', 'pending': 'Pending', 'backlog': 'Backlog', 'done': 'Done',
}
const TYPE_LABELS_MAP: Record<string, string> = { mine: '내 할일', delegated: '업무지시' }
const PRIORITY_LABELS_MAP: Record<string, string> = { '0': '없음', '1': '낮음', '2': '보통', '3': '높음' }

/** 히스토리 값 표시용 포맷 (프로젝트·태스크 공통) */
export function formatHistValue(field: string, value: string | null): string {
  if (value === null || value === '') return '없음'
  if (field === 'status')   return STATUS_LABELS_MAP[value] ?? value
  if (field === 'type')     return TYPE_LABELS_MAP[value] ?? value
  if (field === 'priority') return PRIORITY_LABELS_MAP[value] ?? value
  if (field === 'start_date' || field === 'end_date' || field === 'due_date') {
    const [y, m, d] = value.split('-')
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`
  }
  if (field === 'start_month' || field === 'end_month') {
    const [y, m] = value.split('-')
    return `${y}년 ${parseInt(m)}월`
  }
  return value
}

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
  const target = parseDateStr(dateStr)  // local midnight (not UTC) to match weekStart
  for (let i = 0; i < weeks.length; i++) {
    const weekEnd = new Date(weeks[i].weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    if (target <= weekEnd) {
      if (edge === 'start') {
        const diff = Math.max(0, (target.getTime() - weeks[i].weekStart.getTime()) / (7 * MS_PER_DAY))
        return i + diff
      } else {
        const diff = Math.min(1, (target.getTime() - weeks[i].weekStart.getTime()) / (7 * MS_PER_DAY) + 1 / 7)
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
