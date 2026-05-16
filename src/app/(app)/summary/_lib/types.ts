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
  id: string
  name: string
  name_en: string
  color: string
  keywords: string[]
}

export interface HistoryItem {
  id: string
  client_id: string
  type: HistoryType            // deprecated
  tags: Tag[]                  // 신규
  channel: string
  source_ref: string | null
  title: string
  body: string | null
  occurred_at: string
  status: string | null
  status_kind: StatusKind | null
  priority: Priority | null
  author: string | null
}
