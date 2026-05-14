import React from 'react'
import { LayoutGrid, List, GanttChartSquare, CalendarDays, Columns3 } from 'lucide-react'
import type { TaskStatus } from '@/types'

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
