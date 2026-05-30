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

// 주는 쪽(outgoing = 선택 노드 → 이 노드) 라벨. 선택 노드가 이 노드에 영향을 줌.
export const REL_OUTGOING_LABEL: Record<RelationType, string> = {
  causes:    '악영향',      // 선택 노드가 이 노드에 악영향
  blocks:    '차단',        // 선택 노드가 이 노드를 차단
  recurs_as: '재발',        // 선택 노드가 이 노드로 재발
  continues: '다음 단계',   // 선택 노드 → 이 노드로 이어짐
  related:   '연관',
}

// 받는 쪽(incoming = 이 노드 → 선택 노드) 라벨. 이 노드가 영향을 '주는' from 쪽.
export const REL_INCOMING_LABEL: Record<RelationType, string> = {
  causes:    '원인',        // 이 노드가 선택 노드를 유발 → 이 노드가 원인
  blocks:    '차단요인',    // 이 노드가 선택 노드를 막음
  recurs_as: '재발원',      // 선택 노드가 이 노드의 재발
  continues: '이전 단계',   // 이 노드 → 선택 노드로 이어짐
  related:   '연관',
}

// 관계 타입별 색 (방향칩·관계도 공용, CSS 변수)
export const REL_COLOR: Record<RelationType, string> = {
  causes:    'var(--color-status-late)',
  blocks:    'var(--color-status-warn)',
  continues: 'var(--color-status-future)',
  recurs_as: 'var(--color-lilac-500)',
  related:   'var(--color-ink-400)',
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
// 슬랙/분류 본문 정리 — 리터럴 \n을 실제 줄바꿈으로, ** 볼드 마크업 제거
export function cleanText(body: string): string {
  return body
    .replace(/\\n/g, '\n')   // 이스케이프 안 풀린 리터럴 \n → 줄바꿈
    .replace(/\*\*/g, '')    // ** 볼드 마크업 제거
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export function toBullets(body: string): string[] {
  const cleaned = cleanText(body)
  const byLine = cleaned.split(/\n+/).map(s => s.trim().replace(/^[-•·]\s*/, '')).filter(Boolean)
  if (byLine.length > 1) return byLine
  return cleaned.split(/(?<=[.。!?])\s+/).map(s => s.trim()).filter(Boolean)
}

// 상태 3색 = status(open/closed) × last_seen 경과로 파생
export function nodeStatus(row: IssueRow): NodeStatus {
  if (row.status === 'closed') return 'closed'
  return daysSince(row.last_seen) <= 7 ? 'active' : 'warn'
}
