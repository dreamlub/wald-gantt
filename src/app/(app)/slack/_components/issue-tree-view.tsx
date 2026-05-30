'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────
interface IssueRow {
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
}

interface ClusterData {
  parent: IssueRow
  children: IssueRow[]
}

type NodeStatus = 'active' | 'quiet' | 'dormant' | 'closed'

// ── Helpers ───────────────────────────────────────────────
function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

function ageTxt(d: string) {
  const n = daysSince(d)
  if (n === 0) return '오늘'
  if (n < 7)   return `${n}일`
  if (n < 30)  return `${Math.round(n / 7)}주`
  if (n < 90)  return `${Math.round(n / 30)}개월`
  return '3개월+'
}

function nodeStatus(row: IssueRow): NodeStatus {
  if (row.status === 'closed') return 'closed'
  const n = daysSince(row.last_seen)
  if (n <= 7)  return 'active'
  if (n <= 30) return 'quiet'
  return 'dormant'
}

const S = {
  color:  { active: '#ef4444', quiet: '#f97316', dormant: '#9ca3af', closed: '#10b981' },
  bg:     { active: '#ffffff', quiet: '#ffffff', dormant: '#ffffff', closed: '#ffffff' },
  border: { active: '#fecaca', quiet: '#fed7aa', dormant: '#e5e7eb', closed: '#a7f3d0' },
  badge:  { active: '#fee2e2', quiet: '#ffedd5', dormant: '#f3f4f6', closed: '#d1fae5' },
  label:  { active: '활성', quiet: '조용함', dormant: '소멸', closed: '완료' },
} as const

// ── 상태 배지 ─────────────────────────────────────────────
function Badge({ st }: { st: NodeStatus }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px',
      borderRadius: 999, background: S.badge[st], color: S.color[st],
      whiteSpace: 'nowrap',
    }}>
      {S.label[st]}
    </span>
  )
}

function AgeBadge({ row, st }: { row: IssueRow; st: NodeStatus }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 6,
      background: S.badge[st], color: S.color[st], whiteSpace: 'nowrap',
    }}>
      {ageTxt(row.last_seen)}
    </span>
  )
}

// ── 자식 이슈 카드 ────────────────────────────────────────
function ChildCard({ row, lineColor }: { row: IssueRow; lineColor: string }) {
  const st = nodeStatus(row)
  return (
    <div className="flex items-start gap-0 mb-2">
      {/* 수평 브랜치 */}
      <div className="shrink-0" style={{ width: 28, paddingTop: 19 }}>
        <div style={{ height: 1, background: lineColor, opacity: 0.5, borderRadius: 2 }} />
      </div>
      {/* 카드 — 흰 배경, 좌측 컬러 없음 */}
      <div
        className="flex-1 rounded-xl overflow-hidden"
        style={{ border: '1px solid #e5e7eb', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <div className="flex items-start gap-2 px-3.5 pt-3 pb-1.5">
          <div className="mt-[4px] shrink-0 rounded-full"
            style={{ width: 7, height: 7, background: S.color[st], boxShadow: `0 0 0 2px ${S.badge[st]}` }} />
          <span className="flex-1 text-[13px] font-semibold text-ink leading-snug">{row.title}</span>
          <AgeBadge row={row} st={st} />
        </div>
        {row.body && (
          <p className="px-3.5 pb-1.5 text-[12px] text-ink-500 leading-relaxed">{row.body}</p>
        )}
        {row.action && (
          <div className="mx-3.5 mb-3 px-3 py-2 rounded-lg bg-red-50">
            <span className="text-[11px] font-bold text-red-400">→ 조치 필요</span>
            <p className="mt-0.5 text-[12px] text-red-600 leading-snug">{row.action}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 클러스터 (부모 + 자식) ────────────────────────────────
function ClusterBlock({ cluster }: { cluster: ClusterData }) {
  const [open, setOpen] = useState(true)
  const { parent, children } = cluster

  const worstSt = children.reduce<NodeStatus>((acc, c) => {
    const s = nodeStatus(c)
    const rank = { active: 0, quiet: 1, dormant: 2, closed: 3 }
    return rank[s] < rank[acc] ? s : acc
  }, 'closed')

  const lc       = S.color[worstSt]
  const lastSeen = children.reduce((l, c) => c.last_seen > l ? c.last_seen : l, parent.last_seen)

  return (
    <div className="mb-6">
      {/* 헤더 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-all"
        style={{
          background: S.badge[worstSt],
          border: `1.5px solid ${S.border[worstSt]}`,
          borderLeft: `4px solid ${lc}`,
          borderRadius: open ? '12px 12px 0 0' : 12,
        }}
      >
        <div className="shrink-0 rounded-full"
          style={{ width: 10, height: 10, background: lc, boxShadow: `0 0 0 3px ${S.badge[worstSt]}` }} />
        <span className="flex-1 text-[14px] font-bold text-ink">{parent.title}</span>
        <Badge st={worstSt} />
        <AgeBadge row={{ ...parent, last_seen: lastSeen }} st={worstSt} />
        <span className="text-[11px] text-ink-300 mr-0.5">{children.length}건</span>
        {open ? <ChevronDown size={13} className="text-ink-400 shrink-0" /> : <ChevronRight size={13} className="text-ink-400 shrink-0" />}
      </button>

      {/* 자식들 — 수직선은 헤더 하단에서 시작, 컨테이너 좌측에 표시 */}
      {open && (
        <div
          className="pt-3 pb-1 pr-1"
          style={{
            borderLeft: `1.5px solid ${lc}`,
            borderRight: '1px solid #e5e7eb',
            borderBottom: '1px solid #e5e7eb',
            borderRadius: '0 0 12px 12px',
            background: '#f9f9f9',
          }}
        >
          {children.map(child => (
            <ChildCard key={child.id} row={child} lineColor={lc} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── 단독 이슈 ─────────────────────────────────────────────
function StandaloneCard({ row }: { row: IssueRow }) {
  const st = nodeStatus(row)
  return (
    <div
      className="mb-2.5 rounded-xl overflow-hidden"
      style={{
        border: `1.5px solid ${S.border[st]}`,
        background: S.bg[st],
        borderLeft: `4px solid ${S.color[st]}`,
      }}
    >
      <div className="flex items-start gap-2.5 px-4 pt-3 pb-1.5">
        <div
          className="mt-[3px] shrink-0 rounded-full"
          style={{ width: 9, height: 9, background: S.color[st], boxShadow: `0 0 0 2.5px ${S.badge[st]}` }}
        />
        <span className="flex-1 text-[13px] font-semibold text-ink">{row.title}</span>
        <Badge st={st} />
        <AgeBadge row={row} st={st} />
      </div>
      {row.body && (
        <p className="px-4 pb-1.5 text-[12px] text-ink-500 leading-relaxed">{row.body}</p>
      )}
      {row.action && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg" style={{ background: '#fff1f2' }}>
          <span className="text-[11px] font-bold" style={{ color: '#ef4444' }}>→ 조치 필요</span>
          <p className="mt-0.5 text-[12px] leading-snug" style={{ color: '#dc2626' }}>{row.action}</p>
        </div>
      )}
    </div>
  )
}

// ── 프로젝트 카드 ─────────────────────────────────────────
function ProjectCard({ row }: { row: IssueRow }) {
  const closed = row.status === 'closed'
  const [color, bg, border] = closed
    ? ['#10b981', '#f0fdf4', '#a7f3d0']
    : ['#3b82f6', '#eff6ff', '#bfdbfe']

  return (
    <div
      className="mb-2.5 rounded-xl overflow-hidden"
      style={{ border: `1.5px solid ${border}`, background: bg, borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <span className="text-[13px] shrink-0" style={{ color }}>{closed ? '✅' : '▲'}</span>
        <span className={cn('flex-1 text-[13px] font-semibold', closed ? 'text-ink-400 line-through' : 'text-ink')}>
          {row.title}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: closed ? '#d1fae5' : '#dbeafe', color }}>
          {closed ? '완료' : '진행중'}
        </span>
        <span style={{ fontSize: 11, color, fontWeight: 500 }}>{ageTxt(row.last_seen)}</span>
      </div>
      {!closed && row.action && (
        <p className="px-4 pb-2.5 text-[12px] text-ink-400">{row.action}</p>
      )}
    </div>
  )
}

// ── 결정 카드 ─────────────────────────────────────────────
function DecisionCard({ row }: { row: IssueRow }) {
  return (
    <div className="mb-2.5 rounded-xl overflow-hidden"
      style={{ border: '1.5px solid #ddd6fe', background: '#f5f3ff', borderLeft: '4px solid #8b5cf6' }}
    >
      <div className="flex items-start gap-2.5 px-4 py-2.5">
        <span className="text-[13px] mt-px shrink-0" style={{ color: '#7c3aed' }}>◆</span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium text-ink-600">{row.title}</span>
          {row.body && <p className="mt-0.5 text-[12px] text-ink-300 line-clamp-2">{row.body}</p>}
        </div>
        <span className="text-[11px] shrink-0" style={{ color: '#7c3aed' }}>
          {row.last_seen.slice(5, 10).replace('-', '/')}
        </span>
      </div>
    </div>
  )
}

// ── 섹션 헤더 ─────────────────────────────────────────────
function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3 mt-10 mb-5">
      <span className="text-[22px] font-bold text-ink">{label}</span>
      <span className="text-[13px] font-semibold text-ink-300 bg-ink-50 px-2 py-0.5 rounded-full">{count}</span>
      <div className="flex-1 border-t border-ink-100 mb-1" />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────
interface Props { brandFilter?: string }

export function IssueTreeView({ brandFilter }: Props) {
  const [issues,  setIssues]  = useState<IssueRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (brandFilter) sp.set('brand', brandFilter)
    fetch(`/api/issues?${sp}`)
      .then(r => r.json())
      .then(({ issues: rows }: { issues: IssueRow[] }) => { setIssues(rows ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [brandFilter])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={18} className="animate-spin text-ink-300" />
    </div>
  )

  const issueRows    = issues.filter(r => r.type === 'issue')
  const projectRows  = issues.filter(r => r.type === 'project')
  const decisionRows = issues.filter(r => r.type === 'decision')

  const parentIds = new Set(issueRows.filter(r => r.parent_issue_id).map(r => r.parent_issue_id!))
  const childMap  = issueRows.filter(r => r.parent_issue_id).reduce<Record<string, IssueRow[]>>((acc, r) => {
    const pid = r.parent_issue_id!
    if (!acc[pid]) acc[pid] = []
    acc[pid].push(r)
    return acc
  }, {})

  const RANK = { active: 0, quiet: 1, dormant: 2, closed: 3 }

  const clusters = issueRows
    .filter(r => parentIds.has(r.id))
    .map(p => ({
      parent: p,
      children: (childMap[p.id] ?? []).sort((a, b) => RANK[nodeStatus(a)] - RANK[nodeStatus(b)]),
    }))
    .sort((a, b) => {
      const wa = a.children.reduce<NodeStatus>((acc, c) => RANK[nodeStatus(c)] < RANK[acc] ? nodeStatus(c) : acc, 'closed')
      const wb = b.children.reduce<NodeStatus>((acc, c) => RANK[nodeStatus(c)] < RANK[acc] ? nodeStatus(c) : acc, 'closed')
      return RANK[wa] - RANK[wb]
    })

  const standalones = issueRows
    .filter(r => !r.parent_issue_id && !parentIds.has(r.id))
    .sort((a, b) => RANK[nodeStatus(a)] - RANK[nodeStatus(b)])

  const openProj   = projectRows.filter(r => r.status === 'open')
  const closedProj = projectRows.filter(r => r.status === 'closed')

  const activeCount = issueRows.filter(r => nodeStatus(r) === 'active').length
  const quietCount  = issueRows.filter(r => nodeStatus(r) === 'quiet').length

  const allDates = issues.map(r => r.first_seen).filter(Boolean).sort()
  const fromDate = allDates[0]?.slice(0, 10) ?? ''
  const toDate   = issues.map(r => r.last_seen).filter(Boolean).sort().at(-1)?.slice(0, 10) ?? ''

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-12 bg-white">
      {/* 요약 */}
      <div className="flex items-center gap-3 py-4 border-b border-ink-100 mb-2 text-[12px]">
        {fromDate && toDate && (
          <span className="text-ink-400 font-medium">{fromDate} → {toDate}</span>
        )}
        <span className="text-ink-200">·</span>
        <span className="text-ink-400">{issues.length}개 노드</span>
        <span className="text-ink-100">|</span>
        <span className="font-bold" style={{ color: '#ef4444' }}>🔴 {activeCount}건</span>
        <span className="font-bold" style={{ color: '#f97316' }}>🟡 {quietCount}건</span>
      </div>

      {/* 이슈 */}
      {(clusters.length > 0 || standalones.length > 0) && (
        <>
          <SectionHead label="이슈" count={issueRows.filter(r => r.status === 'open').length} />
          {clusters.map(c => <ClusterBlock key={c.parent.id} cluster={c} />)}
          {standalones.map(r => <StandaloneCard key={r.id} row={r} />)}
        </>
      )}

      {/* 프로젝트 */}
      {projectRows.length > 0 && (
        <>
          <SectionHead label="프로젝트" count={openProj.length} />
          {openProj.map(r => <ProjectCard key={r.id} row={r} />)}
          {closedProj.map(r => <ProjectCard key={r.id} row={r} />)}
        </>
      )}

      {/* 결정 */}
      {decisionRows.length > 0 && (
        <>
          <SectionHead label="결정" count={decisionRows.length} />
          {decisionRows.map(r => <DecisionCard key={r.id} row={r} />)}
        </>
      )}
    </div>
  )
}
