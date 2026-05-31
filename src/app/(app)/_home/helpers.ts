import type { GanttTask, TaskStatus } from '@/types'
import type { Priority, Tag } from '../slack/_lib/types'
import { STATUS_COLOR } from '../tasks/_constants'
import { PRIORITY_META } from '../slack/_lib/constants'
import { toYMD, toShortDate } from '@/lib/date-utils'

export const DAY_MS = 86_400_000

export function todayLocal(): string {
  return toYMD(new Date())
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toYMD(d)
}

export const fmtDay = (iso: string | null | undefined) => toShortDate(iso)

export function plainInsightText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function queryValue(value: string): string {
  return encodeURIComponent(value)
}

export function tasksQuickHref(quick: string): string {
  return `/tasks?quick=${quick}`
}

export function taskHref(task: GanttTask, today: string): string {
  if (task.scheduled_at) {
    const date = task.scheduled_at.slice(0, 10)
    return `/calendar?date=${date}&highlight=${task.id}`
  }
  const q = `&q=${queryValue(task.title)}`
  if (task.due_date && task.due_date < today) return `${tasksQuickHref('overdue')}${q}`
  if (task.due_date === today) return `${tasksQuickHref('due-today')}${q}`
  if (task.due_date && task.due_date > today) return `${tasksQuickHref('due-this-week')}${q}`
  return `/tasks?q=${queryValue(task.title)}`
}

export function summaryHref(filters: { priority?: Priority; tag?: Tag; query?: string }): string {
  const params = new URLSearchParams()
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.tag) params.set('tags', filters.tag)
  if (filters.query) params.set('q', filters.query)
  const qs = params.toString()
  return qs ? `/slack?${qs}` : '/slack'
}

export function daysUntil(date: string | null | undefined, today: string): number | null {
  if (!date) return null
  return Math.round((new Date(date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / DAY_MS)
}

export function statusTone(status: TaskStatus) {
  return {
    color: STATUS_COLOR[status],
    backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[status]} 12%, transparent)`,
  }
}

export function priorityLabel(priority: Priority | null) {
  if (!priority) return null
  return PRIORITY_META[priority]
}

const REVIEW_PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
export function reviewPriorityRank(p: string | null): number {
  if (!p) return 3
  return REVIEW_PRIORITY_RANK[p] ?? 3
}
