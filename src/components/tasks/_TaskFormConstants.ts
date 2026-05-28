import type { GanttTask, TaskStatus, TaskType, Priority, RecurrenceRule } from '@/types'

export type FormTab = 'info' | 'memo' | 'history'

export interface ProjectOption {
  id: string
  name: string
  board_name: string
}

export const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: 'daily',   label: '매일' },
  { value: 'weekly',  label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly',  label: '매년' },
]

export interface Props {
  open: boolean
  onClose: () => void
  onSave: (
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; priority: Priority; labels: string[]; recurrence_rule: RecurrenceRule | null; recurrence_interval: number | null },
    projectIds: string[]
  ) => Promise<void>
  editTask?: GanttTask | null
  parentTask?: GanttTask | null
  defaultStatus?: TaskStatus
  defaultProjects?: ProjectOption[]
  onSearchProjects: (query: string) => Promise<ProjectOption[]>
  assigneeSuggestions?: string[]
  labelSuggestions?: string[]
  initialTitle?: string
  initialMemo?: string
  initialTab?: FormTab
}

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog',      label: 'Backlog' },
  { value: 'to-do',       label: 'To-Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done',        label: 'Done' },
  { value: 'pending',     label: 'Pending' },
]
