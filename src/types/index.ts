export type GanttStatus = 'in-progress' | 'pending' | 'backlog' | 'to-do' | 'done'

/** 0 = 없음, 1 = 낮음, 2 = 보통, 3 = 높음 */
export type Priority = 0 | 1 | 2 | 3

export interface Workspace {
  id: string
  name: string
  created_at: string
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: 'admin' | 'member'
}

export interface GanttBoard {
  id: string
  workspace_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface GanttCategory {
  id: string
  workspace_id: string
  board_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProjectHistoryEntry {
  id: string
  project_id: string
  changed_at: string
  field_name: string
  old_value: string | null
  new_value: string | null
}

export interface TaskHistoryEntry {
  id: string
  task_id: string
  changed_at: string
  field_name: string
  old_value: string | null
  new_value: string | null
}

export type TaskStatus = 'backlog' | 'to-do' | 'in-progress' | 'done' | 'pending'
export type TaskType   = 'mine' | 'delegated'

export interface GanttTask {
  id: string
  workspace_id: string
  title: string
  status: TaskStatus
  type: TaskType
  assignee: string | null
  start_date: string | null // 'YYYY-MM-DD'
  due_date: string | null   // 'YYYY-MM-DD'
  memo: string | null
  labels: string[] | null
  parent_id: string | null
  priority: Priority | null
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  scheduled_at: string | null   // ISO 8601, time blocking 시작 시각
  duration_minutes: number | null
  // 연결된 프로젝트 (join 후 포함)
  projects?: { id: string; name: string; board_name: string }[]
}

export interface CalendarEvent {
  id: string
  title: string
  start: string   // ISO 8601
  end: string     // ISO 8601
  color: string | null
  isAllDay: boolean
  location: string | null
  description: string | null
}

export interface GanttProject {
  id: string
  workspace_id: string
  board_id: string
  category_id: string
  parent_id: string | null
  name: string
  status: GanttStatus
  start_date: string | null   // 'YYYY-MM-DD'
  end_date: string | null     // 'YYYY-MM-DD'
  sort_order: number
  team: string | null
  pm: string | null
  memo: string | null
  priority: Priority | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface WeeklySource {
  id: string
  workspace_id: string
  label: string
  collection_id: string
  sort_order: number
  created_at: string
}

export type WeeklyReportSource = 'biz_lead' | 'team_doc'

export interface WeeklyReport {
  id: string
  workspace_id: string
  source: WeeklyReportSource
  team: string
  author: string | null
  week_start: string       // 'YYYY-MM-DD' 월요일 기준
  raw_content: string | null
  summary: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
