/* ── Calendar 공통 상수 ── */

// 타임그리드
export const HOUR_H   = 60   // 1시간 = 60px
export const START_H  = 6    // 그리드 시작 시각
export const END_H    = 23   // 그리드 끝 시각
export const TOTAL_H  = END_H - START_H
export const SNAP_MIN = 30   // 스냅 단위(분)

// 요일
export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

// 업무시간
export const WORK_SLOTS = [
  { start: 9, end: 12 },
  { start: 13, end: 18 },
] as const
export const WORK_HOURS_PER_DAY = 8

// 드래그
export const DRAG_OVER_BG = 'bg-lilac-100/30'

// 정렬
export type SortKey = 'deadline' | 'priority' | 'status'

export const SORT_LABELS: Record<SortKey, string> = {
  deadline: '마감일',
  priority: '중요도',
  status:   '진행상황',
}

export const SORT_CYCLE: SortKey[] = ['deadline', 'priority', 'status']

export const STATUS_ORDER: Record<string, number> = {
  'in-progress': 0,
  'to-do':       1,
  'pending':     2,
  'backlog':     3,
  'done':        4,
}
