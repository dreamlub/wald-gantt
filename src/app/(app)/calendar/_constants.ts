/* ── Calendar 공통 상수 ── */

// 타임그리드
export const HOUR_H   = 44   // 1시간 = 44px
export const START_H  = 6    // 그리드 시작 시각
export const END_H    = 23   // 그리드 끝 시각
export const TOTAL_H  = END_H - START_H
export const SNAP_MIN = 30   // 스냅 단위(분)

// 요일
export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

// sticky 헤더 레이아웃 (px) — 날짜 → 마감 → ALL-DAY 순으로 쌓임
export const HEADER_DATE_H   = 32   // 날짜 헤더 (h-8)
export const DEADLINE_ROW_H  = 56   // 마감 행
export const STICKY_DEADLINE_TOP = HEADER_DATE_H                       // 32
export const STICKY_ALLDAY_TOP   = STICKY_DEADLINE_TOP + DEADLINE_ROW_H // 88
// 하이라이트 스크롤 시 가려지지 않도록 빼줄 sticky 헤더 총 높이 (ALL-DAY 상단까지)
export const STICKY_HEADER_H = STICKY_ALLDAY_TOP

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
