export type GanttStatus = 'in-progress' | 'pending' | 'backlog' | 'to-do'

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

export interface GanttCategory {
  id: string
  workspace_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface GanttProject {
  id: string
  workspace_id: string
  category_id: string
  parent_id: string | null
  name: string
  status: GanttStatus
  start_month: string | null  // 'YYYY-MM'
  end_month: string | null    // 'YYYY-MM'
  sort_order: number
  team: string | null
  pm: string | null
  created_at: string
  updated_at: string
}
