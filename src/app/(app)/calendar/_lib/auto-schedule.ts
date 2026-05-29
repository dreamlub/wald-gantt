/* ── 자동 스케줄링 엔진 (순수함수) ──
 *
 * 미배치 태스크를 업무시간 안의 빈 슬롯에 "마감 임박 → 우선순위" 순으로 채운다.
 * 모든 시각은 자정 기준 분(minute) + 로컬 날짜 문자열('YYYY-MM-DD')로 다룬다.
 * ISO 변환·DB 저장은 호출부(boundary)에서만 처리한다. → 타임존 오염 없음.
 */

import { parseISO } from 'date-fns'

/* ── 타입 ── */

/** 자정 기준 분 구간 [start, end) */
export interface Interval {
  start: number
  end: number
}

/** 요일별 업무시간 (분). null = 쉬는 날 */
export type DayWorkHours = Interval | null

/** 0=일 … 6=토 → 업무시간. 누락된 요일은 쉬는 날로 간주 */
export type WorkHoursConfig = Partial<Record<number, DayWorkHours>>

/** 배치 대상 태스크 (필요한 필드만) */
export interface SchedulableTask {
  id: string
  /** 소요 시간(분). 0 이하면 배치하지 않음 */
  durationMin: number
  /** 마감일 'YYYY-MM-DD' (이 날짜까지만 배치 허용) */
  dueDate: string | null
  /** 시작 가능일 'YYYY-MM-DD' (이 날짜부터 배치 허용) */
  startDate: string | null
  /** 0~3, 클수록 중요 */
  priority: number
}

/** 이미 점유된 구간 (구글 이벤트 · 캘린더 이벤트 · 기배치 태스크) */
export interface BusyInterval {
  date: string
  start: number
  end: number
}

/** 배치 결과 1건 */
export interface Placement {
  taskId: string
  date: string
  start: number
  durationMin: number
}

export type UnplacedReason = 'no-slot' | 'past-deadline' | 'invalid-duration'

export interface UnplacedTask {
  taskId: string
  reason: UnplacedReason
}

export interface AutoScheduleInput {
  /** 미배치 태스크 */
  tasks: SchedulableTask[]
  /** 후보 날짜 (시간순 'YYYY-MM-DD'). 보통 오늘부터 N일 */
  days: string[]
  workHours: WorkHoursConfig
  /** 매 업무일에서 제외할 구간 (점심 등) */
  breaks?: Interval[]
  busy?: BusyInterval[]
  /** 스냅 단위(분). 기본 30 */
  snapMin?: number
  /** 현재 시각 — 오늘의 과거 슬롯을 막기 위함. null이면 과거 제한 없음 */
  now?: { date: string; minute: number } | null
}

export interface AutoScheduleResult {
  placements: Placement[]
  unplaced: UnplacedTask[]
}

/* ── 시각 파싱 ── */

/** 'HH:MM' → 자정 기준 분. 잘못된 입력은 null */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** 자정 기준 분 → 'HH:MM' */
export function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* ── 구간 계산 ── */

function ceilTo(v: number, step: number): number {
  return Math.ceil(v / step) * step
}

/** window 에서 blocks(겹침 허용)를 빼고 남은 빈 구간들 */
export function subtractIntervals(window: Interval, blocks: Interval[]): Interval[] {
  const clipped = blocks
    .map(b => ({ start: Math.max(b.start, window.start), end: Math.min(b.end, window.end) }))
    .filter(b => b.end > b.start)
    .sort((a, b) => a.start - b.start)

  // 겹치는 구간 병합
  const merged: Interval[] = []
  for (const b of clipped) {
    const last = merged[merged.length - 1]
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end)
    else merged.push({ ...b })
  }

  const free: Interval[] = []
  let cursor = window.start
  for (const m of merged) {
    if (m.start > cursor) free.push({ start: cursor, end: m.start })
    cursor = Math.max(cursor, m.end)
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end })
  return free
}

/** 해당 날짜의 업무시간 윈도우. 쉬는 날·이미 끝난 날이면 null */
function dayWindow(
  date: string,
  workHours: WorkHoursConfig,
  now: { date: string; minute: number } | null,
): Interval | null {
  const weekday = parseISO(date).getDay()
  const wh = workHours[weekday]
  if (!wh) return null
  let start = wh.start
  // 오늘이면 현재 시각 이후로만
  if (now && now.date === date) start = Math.max(start, now.minute)
  if (start >= wh.end) return null
  return { start, end: wh.end }
}

/* ── 정렬: 마감 임박 → 우선순위 ── */

function compareTasks(a: SchedulableTask, b: SchedulableTask): number {
  // 마감일 오름차순 (없으면 뒤로)
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  // 우선순위 내림차순 (숫자 클수록 중요)
  return b.priority - a.priority
}

/* ── 메인 엔진 ── */

export function autoSchedule(input: AutoScheduleInput): AutoScheduleResult {
  const snap = input.snapMin ?? 30
  const breaks = input.breaks ?? []
  const now = input.now ?? null

  // 날짜별 점유 구간 맵 (배치하며 갱신)
  const busyByDate = new Map<string, Interval[]>()
  for (const d of input.days) busyByDate.set(d, [])
  for (const b of input.busy ?? []) {
    busyByDate.get(b.date)?.push({ start: b.start, end: b.end })
  }

  const placements: Placement[] = []
  const unplaced: UnplacedTask[] = []

  const sorted = [...input.tasks].sort(compareTasks)

  for (const task of sorted) {
    if (task.durationMin <= 0) {
      unplaced.push({ taskId: task.id, reason: 'invalid-duration' })
      continue
    }

    let placed = false
    let deadlineBlocked = false

    for (const date of input.days) {
      // 시작 가능일 이전이면 건너뜀
      if (task.startDate && date < task.startDate) continue
      // 마감일 초과 → 이후 날짜도 모두 초과(시간순) → 중단
      if (task.dueDate && date > task.dueDate) {
        deadlineBlocked = true
        break
      }

      const win = dayWindow(date, input.workHours, now)
      if (!win) continue

      const blocks = [...breaks, ...(busyByDate.get(date) ?? [])]
      const free = subtractIntervals(win, blocks)

      for (const slot of free) {
        const start = ceilTo(slot.start, snap)
        if (start + task.durationMin <= slot.end) {
          placements.push({ taskId: task.id, date, start, durationMin: task.durationMin })
          busyByDate.get(date)?.push({ start, end: start + task.durationMin })
          placed = true
          break
        }
      }
      if (placed) break
    }

    if (!placed) {
      unplaced.push({ taskId: task.id, reason: deadlineBlocked ? 'past-deadline' : 'no-slot' })
    }
  }

  return { placements, unplaced }
}
