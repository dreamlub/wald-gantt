import React from 'react'
import { LayoutGrid, List, GanttChartSquare, CalendarDays, Columns3 } from 'lucide-react'
import type { TaskStatus, Priority } from '@/types'

export const STATUS_GROUPS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'backlog',     label: 'Backlog',     color: '#9ca3af' },
  { status: 'to-do',       label: 'To-Do',       color: '#6366f1' },
  { status: 'in-progress', label: 'In Progress', color: '#f59e0b' },
  { status: 'done',        label: 'Done',         color: '#22c55e' },
  { status: 'pending',     label: 'Pending',      color: '#a78bfa' },
]

export const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: '#9ca3af', 'to-do': '#6366f1', 'in-progress': '#f59e0b', done: '#22c55e', pending: '#a78bfa',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog', 'to-do': 'To-Do', 'in-progress': 'In Progress', done: 'Done', pending: 'Pending',
}

export const PROJECT_COLORS = [
  '#f59e0b', '#f97316', '#8b5cf6', '#22c55e',
  '#3b82f6', '#ec4899', '#14b8a6', '#a855f7',
]

export const ASSIGNEE_COLORS = [
  '#6366f1', '#f59e0b', '#22c55e', '#ec4899',
  '#3b82f6', '#a855f7', '#14b8a6', '#f97316',
]

export type ViewType = 'normal' | 'list' | 'kanban' | 'calendar' | 'gantt'

export const VIEW_TABS: { key: ViewType; label: string; icon: React.ReactNode }[] = [
  { key: 'normal',   label: '일반',   icon: <LayoutGrid size={13} /> },
  { key: 'list',     label: '목록',   icon: <List size={13} /> },
  { key: 'kanban',   label: '칸반',   icon: <Columns3 size={13} /> },
  { key: 'gantt',    label: '간트',   icon: <GanttChartSquare size={13} /> },
  { key: 'calendar', label: '캘린더', icon: <CalendarDays size={13} /> },
]

// ── 우선순위 ─────────────────────────────────────────────────

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  0: { label: '없음', color: '#9ca3af' },
  1: { label: '낮음', color: '#60a5fa' },
  2: { label: '보통', color: '#f59e0b' },
  3: { label: '높음', color: '#ef4444' },
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
    return showLabel ? <span className="text-[10px] text-gray-300">—</span> : null
  }
  const meta = PRIORITY_META[p]
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-end gap-[1px]">
        {[1, 2, 3].map(i => (
          <span
            key={i}
            className="w-[2px] rounded-sm"
            style={{
              height: `${3 + i * 2}px`,
              backgroundColor: i <= p ? meta.color : '#e5e7eb',
            }}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-[10px] font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
      )}
    </span>
  )
}
