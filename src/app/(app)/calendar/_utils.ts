import { addDays, parseISO, startOfWeek } from 'date-fns'
import type { CalendarEvent, GanttTask } from '@/types'
import { HOUR_H, SNAP_MIN, WORK_SLOTS } from './_constants'

/* ── 날짜 변환 ── */

/** Date → 'YYYY-MM-DD' (non-null 보장) */
export function toDateStr(d: Date): string {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** ISO string → 로컬 'YYYY-MM-DD' */
export function localDateStr(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 해당 날짜가 포함된 주의 일요일 반환 */
export function getSundayOf(dateStr: string): string {
  return toDateStr(startOfWeek(parseISO(dateStr), { weekStartsOn: 0 }))
}

/** 주 시작일(일요일)부터 7일 배열 반환 */
export function getWeekDates(sundayStr: string): string[] {
  const sunday = parseISO(sundayStr)
  return Array.from({ length: 7 }, (_, i) => toDateStr(addDays(sunday, i)))
}

/** ISO string → 자정 기준 분(0~1440) */
export function toMinutes(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** 날짜 + 총 분 → ISO string */
export function buildIso(date: string, totalMinutes: number): string {
  const [y, mo, d] = date.split('-').map(Number)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return new Date(y, mo - 1, d, h, m).toISOString()
}

/** 날짜 → 자정 ISO (종일 이벤트용) */
export function buildAllDayIso(date: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, 0, 0).toISOString()
}

/** ISO가 종일(자정) 스케줄인지 판별 */
export function isAllDayScheduled(iso: string): boolean {
  const d = new Date(iso)
  return d.getHours() === 0 && d.getMinutes() === 0
}

/* ── 그리드 계산 ── */

export function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN
}

export function minutesToPx(minutes: number): number {
  return (minutes / 60) * HOUR_H
}

export function pxToMinutes(px: number): number {
  return (px / HOUR_H) * 60
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/* ── 통계 ── */

/** 특정 날짜의 Google Calendar 이벤트가 업무시간에서 차지하는 시간 */
export function calcDayHours(date: string, events: CalendarEvent[]): number {
  const dayEvents = events.filter(e => !e.isAllDay && toDateStr(new Date(e.start)) === date)
  let total = 0
  for (const ev of dayEvents) {
    const evStart = new Date(ev.start).getHours() + new Date(ev.start).getMinutes() / 60
    const evEnd   = new Date(ev.end).getHours()   + new Date(ev.end).getMinutes()   / 60
    for (const slot of WORK_SLOTS) {
      const overlap = Math.min(evEnd, slot.end) - Math.max(evStart, slot.start)
      if (overlap > 0) total += overlap
    }
  }
  return total
}

/** 특정 날짜의 스케줄된 태스크 총 시간 */
export function calcTaskHours(date: string, tasks: GanttTask[]): number {
  return tasks
    .filter(t => !!t.scheduled_at && toDateStr(new Date(t.scheduled_at)) === date)
    .reduce((sum, t) => sum + (t.duration_minutes ?? 30) / 60, 0)
}

/** 시간을 '0h' / '3h' / '2.5h' 형태로 포매팅 */
export function fmtHrs(h: number): string {
  if (h === 0) return '0h'
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`
}

/* ── 포매팅 ── */

/** ISO → 'HH:MM' */
export function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** ISO → '5/18 09:30' 또는 '5/18 종일' */
export function fmtScheduledAt(iso: string): string {
  try {
    const d = new Date(iso)
    const base = `${d.getMonth() + 1}/${d.getDate()}`
    if (d.getHours() === 0 && d.getMinutes() === 0) return `${base} 종일`
    return `${base} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '' }
}

/** 날짜 문자열 → 'M/D' (nullish → '') */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  try {
    const parsed = parseISO(d)
    return `${parsed.getMonth() + 1}/${parsed.getDate()}`
  } catch { return '' }
}

/* ── 레이아웃 ── */

export interface LayoutItem { colIndex: number; totalCols: number }

/** 겹치는 블록의 컬럼 배치 계산 */
export function calcLayout(blocks: { startMin: number; endMin: number }[]): LayoutItem[] {
  const n = blocks.length
  if (n === 0) return []

  const sorted = blocks
    .map((b, i) => ({ ...b, origIdx: i }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  const cols: number[] = []
  const assigned = new Array<number>(n)

  for (const b of sorted) {
    let col = cols.findIndex(end => end <= b.startMin)
    if (col === -1) col = cols.length
    cols[col] = b.endMin
    assigned[b.origIdx] = col
  }

  return blocks.map((b, i) => {
    let maxCol = assigned[i]
    for (let j = 0; j < n; j++) {
      if (i !== j && b.startMin < blocks[j].endMin && b.endMin > blocks[j].startMin) {
        maxCol = Math.max(maxCol, assigned[j])
      }
    }
    return { colIndex: assigned[i], totalCols: maxCol + 1 }
  })
}
