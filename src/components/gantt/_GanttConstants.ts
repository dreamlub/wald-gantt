/** 평균 월 일수 (365.25 / 12) — 월뷰 드래그 스냅 계산용 */
export const AVG_DAYS_PER_MONTH = 30.4375

export const COL_WIDTH      = 72
export const WEEK_COL_WIDTH = 36
export const DAY_COL_WIDTH  = 28
export const LEFT_WIDTH_DEFAULT = 320
export const LEFT_WIDTH_MIN     = 160
export const LEFT_WIDTH_MAX     = 480

export const YEAR_H   = 34
export const MONTH_H  = 28
export const TODAY_H  = 18
export const HEADER_H = YEAR_H + MONTH_H + TODAY_H  // 80

export const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export type ViewMode = 'month' | 'week' | 'day'
