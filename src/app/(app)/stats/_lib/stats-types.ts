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
  // 데일리리포트 커버리지 — 기간 내 날짜별 리포트 존재 여부.
  // has=false → 미생성 갭. item_count는 신뢰 불가(대부분 0)라 색칠엔 미사용, 툴팁 참고용.
  reportCoverage: { date: string; has: boolean; items: number }[]
  reportDays: number // 기간 내 리포트 생성된 날 수
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

// ── Overview (Signal → Review → Task → Done 퍼널) ──────────
export interface OverviewStatsResponse {
  funnel: { key: string; label: string; value: number }[]
  reviewBySource: { source: string; label: string; count: number }[]
  conversion: { candidateToTask: number; reviewedRatio: number } // %
}

export const EMPTY_OVERVIEW_STATS: OverviewStatsResponse = {
  funnel: [], reviewBySource: [], conversion: { candidateToTask: 0, reviewedRatio: 0 },
}

// ── Review (일감 판단 큐 진단) ─────────────────────────────
export interface ReviewStatsResponse {
  statusTotals: { pending: number; created: number; snoozed: number; ignored: number }
  bySource: { source: string; label: string; count: number }[]
  avgDwellDays: number // created_at → reviewed_at (처리 완료 후보 평균)
  pendingAging: { title: string; brand: string; days: number }[] // 오래 머문 pending Top
}

export const EMPTY_REVIEW_STATS: ReviewStatsResponse = {
  statusTotals: { pending: 0, created: 0, snoozed: 0, ignored: 0 },
  bySource: [], avgDwellDays: 0, pendingAging: [],
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
  reportCoverage: [],
  reportDays: 0,
}
