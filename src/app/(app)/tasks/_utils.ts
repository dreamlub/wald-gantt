import { todayStrKST, parseDateStr } from '@/lib/gantt-utils'
import type { TaskStatus } from '@/types'

/** "YYYY-MM-DD" 또는 타임스탬프 → "M/D" 표시 */
export function fmtDate(d: string | null) {
  if (!d) return '—'
  const [, m, day] = d.slice(0, 10).split('-').map(Number)
  return `${m}/${day}`
}

/** 시작/마감 합쳐서 "8/13 ~ 9/20" 형식 */
export function fmtRange(start: string | null, due: string | null) {
  if (!start && !due) return '—'
  if (!start) return `~ ${fmtDate(due)}`
  if (!due)   return `${fmtDate(start)} ~`
  return `${fmtDate(start)} ~ ${fmtDate(due)}`
}

/** 배경색 명도 판정 → 글자색 자동 대비 */
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 0.299 + g * 0.587 + b * 0.114) > 170
}

/** 마우스 좌표에서 툴팁 위치를 뷰포트 안으로 클램프
 *  - 오른쪽으로 넘치면 왼쪽으로 플립 (flipX)
 *  - 커서가 뷰포트 하단이면 bottom 기준으로 앵커 → 툴팁이 위로 자람 (flipY)
 *  반환된 top/bottom 중 하나만 정의됨 */
export function clampTooltipPos(x: number, y: number, tw = 320, margin = 8) {
  if (typeof window === 'undefined') {
    return { left: x + 14, top: y - 8 as number | undefined, bottom: undefined as number | undefined, flipX: false, flipY: false }
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  const flipX = x + 14 + tw + margin > vw
  const left = flipX ? Math.max(margin, x - tw - 14) : x + 14
  const flipY = y > vh / 2
  return {
    left,
    top:    flipY ? undefined          : y - 8,
    bottom: flipY ? Math.max(margin, vh - y - 8) : undefined,
    flipX,
    flipY,
  }
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

/** 시작일이 지났는데 아직 시작 안 함 — to-do/backlog 상태에서 start_date < today */
export function isStartDelayed(start: string | null, status: TaskStatus) {
  if (!start) return false
  if (status !== 'to-do' && status !== 'backlog') return false
  return start < todayStrKST()
}

/** KST 기준 시작일 지연 일수 */
export function startDelayedDays(start: string | null): number {
  if (!start) return 0
  return Math.max(0, Math.floor((parseDateStr(todayStrKST()).getTime() - parseDateStr(start).getTime()) / 864e5))
}

/** KST 기준 이번 주(오늘~이번 주 토요일) 마감 여부 */
export function isDueThisWeek(due: string | null) {
  if (!due) return false
  const today = todayStrKST()
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const daysUntilSat = 6 - kstNow.getUTCDay()
  const sat = new Date(kstNow.getTime() + daysUntilSat * 864e5)
  const endStr = `${sat.getUTCFullYear()}-${String(sat.getUTCMonth() + 1).padStart(2, '0')}-${String(sat.getUTCDate()).padStart(2, '0')}`
  return due >= today && due <= endStr
}

/** KST 기준 다음 주(다음 주 일~토) 마감 여부 */
export function isDueNextWeek(due: string | null) {
  if (!due) return false
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const daysUntilNextSun = 7 - kstNow.getUTCDay()
  const nextSun = new Date(kstNow.getTime() + daysUntilNextSun * 864e5)
  const nextSat = new Date(nextSun.getTime() + 6 * 864e5)
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return due >= ymd(nextSun) && due <= ymd(nextSat)
}

