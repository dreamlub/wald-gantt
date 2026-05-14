import { todayStrKST, parseDateStr } from '@/lib/gantt-utils'
import type { TaskStatus } from '@/types'

/** "YYYY-MM-DD" 또는 타임스탬프 → "M/D" 표시 */
export function fmtDate(d: string | null) {
  if (!d) return '—'
  const [, m, day] = d.slice(0, 10).split('-').map(Number)
  return `${m}/${day}`
}

/** KST 기준 몇 일 전/후 — 타임스탬프를 KST 날짜로 변환 후 비교 */
export function relativeTime(d: string | null) {
  if (!d) return '—'
  const todayStr  = todayStrKST()
  // ISO 타임스탬프는 KST 날짜 문자열로 변환
  const targetStr = d.length === 10 ? d : toKSTDateStr(d)
  if (targetStr === todayStr) return '오늘'
  const todayMid  = parseDateStr(todayStr).getTime()
  const targetMid = parseDateStr(targetStr).getTime()
  const diff = Math.floor((todayMid - targetMid) / 864e5)
  if (diff === 1) return '어제'
  if (diff < 0) return `${Math.abs(diff)}일 후`
  return `${diff}일 전`
}

/** KST 기준 몇 일 경과 */
export function daysDiff(d: string | null): number {
  if (!d) return 0
  const todayMid = parseDateStr(todayStrKST()).getTime()
  const target   = d.length === 10 ? parseDateStr(d).getTime() : new Date(d).getTime()
  return Math.floor((todayMid - target) / 864e5)
}

/** KST 기준 마감 초과 일수 */
export function overdueDays(due: string | null): number {
  if (!due) return 0
  return Math.max(0, Math.floor((parseDateStr(todayStrKST()).getTime() - parseDateStr(due).getTime()) / 864e5))
}

/** KST 오늘 기준 마감 초과 여부 */
export function isOverdue(due: string | null, status: TaskStatus) {
  if (!due || status === 'done') return false
  return due < todayStrKST()
}

/** KST 기준 이번 주(일~토) 마감 여부 */
export function isDueThisWeek(due: string | null) {
  if (!due) return false
  const today = todayStrKST()
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const daysUntilSat = 6 - kstNow.getUTCDay()
  const sat = new Date(kstNow.getTime() + daysUntilSat * 864e5)
  const endStr = `${sat.getUTCFullYear()}-${String(sat.getUTCMonth() + 1).padStart(2, '0')}-${String(sat.getUTCDate()).padStart(2, '0')}`
  return due >= today && due <= endStr
}

/** UTC 타임스탬프 → KST "YYYY-MM-DD" */
export function toKSTDateStr(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`
}

/** KST 기준 이번 주 일요일 자정 */
export function weekStart(): Date {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dayOfWeek = kstNow.getUTCDay()
  const sunKST = new Date(kstNow.getTime() - dayOfWeek * 864e5)
  sunKST.setUTCHours(0, 0, 0, 0)
  return new Date(sunKST.getTime() - 9 * 60 * 60 * 1000)
}

export function abbrev(name: string) { return name.slice(0, 2) }
