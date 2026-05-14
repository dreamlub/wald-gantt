export type GanttStatus = 'in-progress' | 'pending' | 'backlog' | 'to-do' | 'done'

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
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  // 연결된 프로젝트 (join 후 포함)
  projects?: { id: string; name: string; board_name: string }[]
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
  created_at: string
  updated_at: string
  deleted_at: string | null
}
