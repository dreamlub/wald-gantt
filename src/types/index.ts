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

export type TaskStatus = 'inbox' | 'backlog' | 'to-do' | 'in-progress' | 'done' | 'pending'
export type TaskType   = 'mine' | 'delegated'
export type RecurrenceRule = 'daily' | 'weekly' | 'monthly' | 'yearly'

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
  archived_at: string | null
  scheduled_at: string | null   // ISO 8601, time blocking 시작 시각
  duration_minutes: number | null
  // 반복 설정
  recurrence_rule: RecurrenceRule | null
  recurrence_interval: number | null  // N일/N주/N개월마다
  series_id: string | null            // 같은 반복 시리즈 연결
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

// 캘린더 전용 이벤트 (할일과 분리, 빈 시간대 클릭으로 생성 → 구글 동기화)
export interface CalEvent {
  id: string
  workspace_id: string
  title: string
  scheduled_at: string         // ISO 8601 시작 시각
  duration_minutes: number
  google_event_id: string | null
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

export interface WeeklyReportItem {
  type: 'issue' | 'decision' | 'plan'
  title: string
  detail: string
  date: string | null
  brand: string | null
  // 확장 필드 (하위 호환: 기존 저장 데이터에 없을 수 있음)
  assignee?: string | null
  task_type?: string | null
  status?: string | null
  // 비교 필드 (AI가 전주 대비 채움)
  prev_status?: string | null
  change?: 'new' | 'continued' | 'completed' | 'blocked' | 'dropped' | null
  prev_title?: string | null
  block_reason?: string | null
}

export interface WeeklyDiffSummary {
  new: number
  completed: number
  continued: number
  blocked: number
  dropped: number
  dropped_items?: WeeklyReportItem[]
}

export interface WeeklyReportSummary {
  items: WeeklyReportItem[]
  summary: string
  diff_summary?: WeeklyDiffSummary
}

export interface WeeklyInsightStats {
  authors:   { count: number; delta: number }
  issues:    { count: number; delta: number }
  decisions: { count: number; delta: number }
  plans:     { count: number; delta: number }
}

export interface WeeklyInsightContent {
  headline: string
  stats: WeeklyInsightStats
  changes: string
}

export interface WeeklyInsight {
  id: string
  workspace_id: string
  week_start: string
  content: WeeklyInsightContent | null
  analyzed_at: string | null
  created_at: string
}

export interface WeeklySource {
  id: string
  workspace_id: string
  label: string
  collection_id: string
  sort_order: number
  created_at: string
}

export type WeeklyReportSource = 'biz_lead' | 'team_doc' | 'outline'

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

export type NoteColor = 'default' | 'yellow' | 'blue' | 'green' | 'pink' | 'purple'

export interface NoteLink {
  type:  'task' | 'project'
  id:    string
  title: string
}

export interface Note {
  id: string
  user_id: string
  title: string
  content: string
  color: NoteColor
  pinned: boolean
  sort_order: number
  links: NoteLink[]
  created_at: string
  updated_at: string
}
