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

// ── 프로젝트 통계 ─────────────────────────────────────────
export interface ProjectStatsResponse {
  totals: {
    total: number
    todo: number
    inProgress: number
    done: number
    overdue: number // 미완료 & 마감일 경과
    rescheduledCount: number // 마감일이 1회 이상 변경된 프로젝트 수
    avgReschedule: number // 변경된 프로젝트들의 평균 변경 횟수
  }
  reschedule: { name: string; changes: number; slipDays: number }[] // 마감 변경 Top
  deadlines: { name: string; endDate: string; daysLeft: number; overdue: boolean }[] // 임박·초과 (미완료)
  byCategory: { name: string; count: number }[]
  byPm: { name: string; count: number }[]
}

export const EMPTY_PROJECT_STATS: ProjectStatsResponse = {
  totals: { total: 0, todo: 0, inProgress: 0, done: 0, overdue: 0, rescheduledCount: 0, avgReschedule: 0 },
  reschedule: [], deadlines: [], byCategory: [], byPm: [],
}

// ── 이슈 트래커 통계 ──────────────────────────────────────
export interface IssueStatsResponse {
  totals: { total: number; open: number; closed: number; avgResolveDays: number; relations: number }
  byType: { type: string; label: string; open: number; closed: number }[]
  resolutionBuckets: { label: string; count: number }[] // 해결 소요시간 분포 (closed)
  aging: { title: string; brand: string; days: number }[] // 오래 열린 미해결 Top
  brandLoad: { brand: string; open: number; closed: number }[] // 브랜드별 미해결 부하
}

export const EMPTY_ISSUE_STATS: IssueStatsResponse = {
  totals: { total: 0, open: 0, closed: 0, avgResolveDays: 0, relations: 0 },
  byType: [], resolutionBuckets: [], aging: [], brandLoad: [],
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
