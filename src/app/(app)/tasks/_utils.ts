import { todayStrKST, parseDateStr, MS_PER_DAY, formatYearMonth, type WeekInfo } from '@/lib/gantt-utils'
import { kstToday, kstParts, addDaysYMD } from '@/lib/kst'
import type { GanttTask, TaskStatus } from '@/types'

const LABEL_COLORS = [
  '#a5b4fc', '#c4b5fd', '#f9a8d4', '#fda4af',
  '#fdba74', '#fcd34d', '#86efac', '#5eead4',
  '#93c5fd', '#7dd3fc', '#f0abfc', '#d9f99d',
]

export function labelColor(name: string): string {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return LABEL_COLORS[hash % LABEL_COLORS.length]
}

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
  return Math.floor((todayMid - target) / MS_PER_DAY)
}

/** KST 기준 마감 초과 일수 */
export function overdueDays(due: string | null): number {
  if (!due) return 0
  return Math.max(0, Math.floor((parseDateStr(todayStrKST()).getTime() - parseDateStr(due).getTime()) / MS_PER_DAY))
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
  return Math.max(0, Math.floor((parseDateStr(todayStrKST()).getTime() - parseDateStr(start).getTime()) / MS_PER_DAY))
}

/** KST 기준 이번 주(오늘~이번 주 토요일) 마감 여부 */
export function isDueThisWeek(due: string | null) {
  if (!due) return false
  const today = kstToday()
  const sat = addDaysYMD(today, 6 - kstParts().dow)
  return due >= today && due <= sat
}

/** KST 기준 다음 주(다음 주 일~토) 마감 여부 */
export function isDueNextWeek(due: string | null) {
  if (!due) return false
  const nextSun = addDaysYMD(kstToday(), 7 - kstParts().dow)
  const nextSat = addDaysYMD(nextSun, 6)
  return due >= nextSun && due <= nextSat
}

// ── 간트 뷰 전용 유틸 ─────────────────────────────────────────────────────────

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export function calcViewRange(dates: string[]): { startYM: string; endYM: string } {
  const sorted = [...dates].sort()
  const pad = (y: number, mo: number) => `${y}-${String(mo).padStart(2, '0')}`
  const [sy, sm] = sorted[0].slice(0, 7).split('-').map(Number)
  const [ey, em] = sorted[sorted.length - 1].slice(0, 7).split('-').map(Number)
  return {
    startYM: sm - 1 < 1  ? pad(sy - 1, 12) : pad(sy, sm - 1),
    endYM:   em + 1 > 12 ? pad(ey + 1, 1)  : pad(ey, em + 1),
  }
}

export function yearGroups(weeks: WeekInfo[]): { year: number; count: number }[] {
  const groups: { year: number; count: number }[] = []
  for (const w of weeks) {
    if (!groups.length || groups[groups.length - 1].year !== w.year)
      groups.push({ year: w.year, count: 1 })
    else groups[groups.length - 1].count++
  }
  return groups
}

export function monthGroups(weeks: WeekInfo[]): { ym: string; label: string; count: number }[] {
  const groups: { ym: string; label: string; count: number }[] = []
  for (const w of weeks) {
    const ym = formatYearMonth(w.year, w.month)
    if (!groups.length || groups[groups.length - 1].ym !== ym)
      groups.push({ ym, label: `${w.month}월`, count: 1 })
    else groups[groups.length - 1].count++
  }
  return groups
}

export function reorderWithSubs(arr: GanttTask[]): { task: GanttTask; isSub: boolean }[] {
  const map = new Map(arr.map(t => [t.id, t]))
  const subsByParent = new Map<string, GanttTask[]>()
  for (const t of arr) {
    if (t.parent_id && map.has(t.parent_id)) {
      const list = subsByParent.get(t.parent_id) ?? []
      list.push(t)
      subsByParent.set(t.parent_id, list)
    }
  }
  const out: { task: GanttTask; isSub: boolean }[] = []
  const inserted = new Set<string>()
  for (const t of arr) {
    if (inserted.has(t.id) || (t.parent_id && map.has(t.parent_id))) continue
    out.push({ task: t, isSub: false }); inserted.add(t.id)
    for (const sub of subsByParent.get(t.id) ?? []) {
      out.push({ task: sub, isSub: true }); inserted.add(sub.id)
    }
  }
  return out
}

export function gantSortCompare(a: GanttTask, b: GanttTask): number {
  const FAR = '9999-12-31'
  const ap = a.start_date ?? a.due_date ?? FAR
  const bp = b.start_date ?? b.due_date ?? FAR
  if (ap !== bp) return ap < bp ? -1 : 1
  const as2 = a.due_date ?? FAR
  const bs2 = b.due_date ?? FAR
  if (as2 !== bs2) return as2 < bs2 ? -1 : 1
  return (a.sort_order ?? 0) - (b.sort_order ?? 0)
}

export function barLabel(s: string | null, e: string | null): string {
  const fmt = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${m}/${day}` }
  if (s && e && s !== e) {
    const [, sm, sd] = s.split('-').map(Number)
    const [, em, ed] = e.split('-').map(Number)
    return sm === em ? `${sm}/${sd} ~ ${ed}` : `${sm}/${sd} ~ ${em}/${ed}`
  }
  return s ? fmt(s) : e ? fmt(e) : ''
}

