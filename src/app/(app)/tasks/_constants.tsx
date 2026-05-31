import React from 'react'
import { LayoutGrid, List, GanttChartSquare, CalendarDays, Columns3 } from 'lucide-react'
import type { TaskStatus, Priority } from '@/types'

export const STATUS_GROUPS: { status: TaskStatus; label: string; color: string; bgColor: string; abbr: string }[] = [
  { status: 'backlog',     label: 'Backlog',     color: 'var(--task-status-backlog)',     bgColor: 'var(--task-status-backlog-bg)',     abbr: 'B' },
  { status: 'to-do',       label: 'To-Do',       color: 'var(--task-status-todo)',        bgColor: 'var(--task-status-todo-bg)',        abbr: 'T' },
  { status: 'in-progress', label: 'In Progress', color: 'var(--task-status-in-progress)', bgColor: 'var(--task-status-in-progress-bg)', abbr: 'I' },
  { status: 'done',        label: 'Done',        color: 'var(--task-status-done)',        bgColor: 'var(--task-status-done-bg)',        abbr: 'D' },
  { status: 'pending',     label: 'Pending',     color: 'var(--task-status-pending)',     bgColor: 'var(--task-status-pending-bg)',     abbr: 'P' },
]

export const STATUS_ABBR: Record<TaskStatus, string> = {
  backlog: 'B', 'to-do': 'T', 'in-progress': 'I', done: 'D', pending: 'P',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog:       'var(--task-status-backlog)',
  'to-do':       'var(--task-status-todo)',
  'in-progress': 'var(--task-status-in-progress)',
  done:          'var(--task-status-done)',
  pending:       'var(--task-status-pending)',
}

export const STATUS_BG_COLOR: Record<TaskStatus, string> = {
  backlog:       'var(--task-status-backlog-bg)',
  'to-do':       'var(--task-status-todo-bg)',
  'in-progress': 'var(--task-status-in-progress-bg)',
  done:          'var(--task-status-done-bg)',
  pending:       'var(--task-status-pending-bg)',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog', 'to-do': 'To-Do', 'in-progress': 'In Progress', done: 'Done', pending: 'Pending',
}

export const PROJECT_COLORS = [
  'var(--color-id-amber)',  'var(--color-id-orange)', 'var(--color-id-violet)', 'var(--color-id-green)',
  'var(--color-id-blue)',   'var(--color-id-pink)',   'var(--color-id-teal)',   'var(--color-id-purple)',
]

export const ASSIGNEE_COLORS = [
  'var(--color-id-indigo)', 'var(--color-id-amber)',  'var(--color-id-green)',  'var(--color-id-pink)',
  'var(--color-id-blue)',   'var(--color-id-purple)', 'var(--color-id-teal)',   'var(--color-id-orange)',
]

export type ViewType = 'basic' | 'listview' | 'kanban' | 'calendar' | 'gantt'

export const VIEW_TABS: { key: ViewType; label: string; icon: React.ReactNode }[] = [
  { key: 'basic',    label: 'Basic',    icon: <LayoutGrid size={13} /> },
  { key: 'listview', label: 'List',     icon: <List size={13} /> },
  { key: 'kanban',   label: 'Kanban',   icon: <Columns3 size={13} /> },
  { key: 'gantt',    label: 'Gantt',    icon: <GanttChartSquare size={13} /> },
  { key: 'calendar', label: 'Calendar', icon: <CalendarDays size={13} /> },
]

// ── 우선순위 ─────────────────────────────────────────────────

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  0: { label: '없음', color: 'var(--color-ink-300)' },
  1: { label: '낮음', color: 'var(--color-status-future)' },
  2: { label: '보통', color: 'var(--color-status-warn)' },
  3: { label: '높음', color: 'var(--color-status-late)' },
}

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 0, label: '없음' },
  { value: 1, label: '낮음' },
  { value: 2, label: '보통' },
  { value: 3, label: '높음' },
]

export function PriorityBars({ priority, showLabel }: {
  priority: Priority | null | undefined
  showLabel?: boolean
}) {
  const p = (priority ?? 0) as Priority
  if (p === 0) {
    return showLabel ? <span className="text-xs text-ink-300">—</span> : null
  }
  const meta = PRIORITY_META[p]
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-end gap-px">
        {[1, 2, 3].map(i => (
          <span
            key={i}
            className="w-0.5 rounded-sm"
            style={{
              height: `${3 + i * 2}px`,
              backgroundColor: i <= p ? meta.color : 'var(--color-ink-150)',
            }}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-xs font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
      )}
    </span>
  )
}
