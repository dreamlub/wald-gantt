// ── 인사이트 ─────────────────────────────────────────────────
export interface ActionItem {
  id: string
  severity: 'urgent' | 'watch' | 'info'
  title: string
  brand: string
  related_count: number
  summary: string
  action: string
}

export interface UpcomingItem {
  date: string
  title: string
  brand: string
  priority: Priority
}

export interface PendingItem {
  brand: string
  count: number
  items: string
}

export interface DecisionItem {
  id: string
  title: string
  desc: string
  brand: string
}

export interface InsightContent {
  headline: string
  action_items: ActionItem[]
  upcoming: UpcomingItem[]
  pending: PendingItem[]
  decisions: DecisionItem[]
}

export interface Insight {
  id: string
  workspace_id: string
  week_start: string
  content: InsightContent
  analyzed_at: string
  source_count: number
  created_at: string
  updated_at: string
}

// 신규 태그 시스템 (단일 type → 다중 tags)
export type Tag =
  | 'issue'        // 🔴 이슈
  | 'decision'     // 🟡 의사결정
  | 'mention'      // 🔵 나를 멘션
  | 'in_progress'  // 🟢 진행중
  | 'done'         // ✅ 진행완료
  | 'schedule'     // 📅 일정수립

// 기존 type 컬럼은 호환용 (deprecated)
export type HistoryType = 'issue' | 'decision' | 'task' | 'doc' | 'slack'

export type StatusKind = 'late' | 'warn' | 'ok' | 'future'

export type Priority = 'high' | 'medium' | 'low'

export interface Client {
  name: string
  color: string
}

export interface ThreadReply {
  author: string
  occurred_at: string
  text: string
  // AI 분류 결과 (client_history에서)
  ai_title?: string | null
  ai_body?: string | null
}

export interface SummaryVersion {
  id: string
  thread_count: number
  title: string
  body: string
  archived_at: string
}

export interface HistoryItem {
  id: string
  brand_name: string | null
  type: HistoryType            // deprecated
  tags: Tag[]                  // 신규
  channel: string
  source_id: string | null
  source_ref: string | null
  title: string
  body: string | null
  occurred_at: string
  updated_at: string
  status: string | null
  status_kind: StatusKind | null
  priority: Priority | null
  author: string | null
  raw_message_id: string | null
  thread_count: number
  reclassified_at?: string | null
  thread_replies?: ThreadReply[]
}
