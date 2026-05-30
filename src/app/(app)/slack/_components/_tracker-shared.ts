// TimelineTracker 좌/우 패널 공용 타입·상수·헬퍼

// ── Types ─────────────────────────────────────────────────
export interface IssueRow {
  id: string
  title: string
  type: 'issue' | 'project' | 'decision'
  priority: string
  status: 'open' | 'closed'
  body: string
  action: string
  first_seen: string
  last_seen: string
  parent_issue_id: string | null
  created_at?: string
}

export type RelationType = 'causes' | 'blocks' | 'recurs_as' | 'continues' | 'related'

export interface Relation {
  id: string
  from_issue_id: string
  to_issue_id: string
  relation_type: RelationType
  note: string | null
}

export type NodeStatus = 'active' | 'warn' | 'closed'
export type TypeFilter = 'issue' | 'project' | 'decision'
export type TrackerIssueRow = IssueRow & { brand_name?: string }

// ── 상수 ──────────────────────────────────────────────────
// 타입별 색상 (좌측 필터칩·우측 상세헤더 공용)
export const TYPE_META: Record<TypeFilter, { label: string; color: string }> = {
  issue:    { label: '이슈',     color: 'var(--color-status-late)' },
  project:  { label: '프로젝트', color: 'var(--color-status-future)' },
  decision: { label: '결정',     color: 'var(--color-lilac-500)' },
}

export const STATUS_META: Record<NodeStatus, { label: string; dot: string; ring: string; cls: string }> = {
  active: { label: '활성', dot: 'bg-status-late', ring: 'border-status-late-border', cls: 'text-status-late' },
  warn:   { label: '주의', dot: 'bg-status-warn', ring: 'border-status-warn-border', cls: 'text-status-warn' },
  closed: { label: '해결', dot: 'bg-ink-300',     ring: 'border-ink-200',            cls: 'text-ink-300'    },
}

export const ST_BG: Record<NodeStatus, string> = {
  active: 'var(--color-status-late)',
  warn:   'var(--color-status-warn)',
  closed: 'var(--color-ink-300)',
}

export const ST_SYMBOL: Record<NodeStatus, string> = { active: '!', warn: '~', closed: '✓' }

export const REL_META: Record<RelationType, { label: string; from: string }> = {
  causes:    { label: '유발',  from: '→' },
  blocks:    { label: '차단',  from: '⊘' },
  recurs_as: { label: '재발',  from: '↻' },
  continues: { label: '연속',  from: '⇒' },
  related:   { label: '연관',  from: '∼' },
}

export const TYPE_KEYS: TypeFilter[] = ['issue', 'project', 'decision']

// ── Helpers ───────────────────────────────────────────────
export function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export function ageTxt(d: string) {
  const n = daysSince(d)
  if (n <= 0) return '오늘'
  if (n < 7)  return `${n}일 전`
  if (n < 30) return `${Math.round(n / 7)}주 전`
  if (n < 90) return `${Math.round(n / 30)}개월 전`
  return '3개월+'
}

// 상세 설명을 항목 단위로 분리 — 줄바꿈 우선, 없으면 문장(마침표) 단위
export function toBullets(body: string): string[] {
  const byLine = body.split(/\n+/).map(s => s.trim().replace(/^[-•·]\s*/, '')).filter(Boolean)
  if (byLine.length > 1) return byLine
  return body.split(/(?<=[.。!?])\s+/).map(s => s.trim()).filter(Boolean)
}

// 상태 3색 = status(open/closed) × last_seen 경과로 파생
export function nodeStatus(row: IssueRow): NodeStatus {
  if (row.status === 'closed') return 'closed'
  return daysSince(row.last_seen) <= 7 ? 'active' : 'warn'
}
