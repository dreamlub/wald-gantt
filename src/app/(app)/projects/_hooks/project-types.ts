import type { GanttProject, GanttStatus, Priority } from '@/types'

export type DialogState =
  | { type: 'addProject'; categoryId: string; parentId?: string | null; isMilestone?: boolean; startDate?: string; endDate?: string }
  | { type: 'editProject'; project: GanttProject; initialTab?: 'info' | 'memo' | 'history' }
  | { type: 'share' }
  | null

export interface ProjectFormFields {
  categoryId: string
  parentId: string | null
  name: string
  status: GanttStatus
  start_date: string | null
  end_date: string | null
  team: string | null
  pm: string | null
  memo: string | null
  priority: Priority
  progress: number
  is_milestone: boolean
}
