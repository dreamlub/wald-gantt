// 통계 대시보드 — 서버 집계(/api/stats) 응답 타입.
// API 라우트와 UI 컴포넌트가 공유한다.

import type { Tag, Priority } from '@/app/(app)/slack/_lib/types'

/** 일별 분류 메시지 볼륨 (KST 날짜 기준, 태그별 분해) */
export interface DailyVolumePoint {
  date: string // YYYY-MM-DD (KST)
  total: number
  issue: number
  decision: number
  schedule: number
  mention: number
}

/** 브랜드별 메시지·분류 분포 */
export interface BrandBreakdownRow {
  brand: string
  total: number
  issue: number
  decision: number
  schedule: number
  mention: number
}

/** 일별 투두 처리량 */
export interface TodoDailyPoint {
  date: string // YYYY-MM-DD (KST)
  completed: number // status → done 전환 수
  created: number // 신규 생성 수
}

export type TaskStatus = 'to-do' | 'in-progress' | 'done' | 'backlog'

export interface StatsResponse {
  range: { from: string; to: string; days: number }
  totals: {
    messages: number
    activeDays: number
    avgPerDay: number
    brands: number
    issues: number
    todosCompleted: number
  }
  dailyVolume: DailyVolumePoint[]
  brandBreakdown: BrandBreakdownRow[]
  tagTotals: { tag: Tag; count: number }[]
  priorityTotals: Record<Priority, number>
  todo: {
    daily: TodoDailyPoint[]
    statusNow: Record<TaskStatus, number>
    completedInRange: number
    createdInRange: number
  }
  weekday: number[] // 길이 7, index 0=일요일
  hourly: number[] // 길이 24, index = KST 시
  topChannels: { name: string; count: number }[]
  topAuthors: { name: string; count: number }[]
}

export const EMPTY_STATS: StatsResponse = {
  range: { from: '', to: '', days: 0 },
  totals: { messages: 0, activeDays: 0, avgPerDay: 0, brands: 0, issues: 0, todosCompleted: 0 },
  dailyVolume: [],
  brandBreakdown: [],
  tagTotals: [],
  priorityTotals: { high: 0, medium: 0, low: 0 },
  todo: { daily: [], statusNow: { 'to-do': 0, 'in-progress': 0, done: 0, backlog: 0 }, completedInRange: 0, createdInRange: 0 },
  weekday: [0, 0, 0, 0, 0, 0, 0],
  hourly: Array(24).fill(0),
  topChannels: [],
  topAuthors: [],
}
