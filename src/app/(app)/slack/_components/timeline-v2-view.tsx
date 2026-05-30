'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { brandColor } from '@/lib/history-service'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────
type IssueType   = 'issue' | 'project' | 'decision'
type IssueStatus = 'active' | 'quiet' | 'dormant'

// DB issues 테이블 row
interface IssueRow {
  id: string
  brand_name: string
  title: string
  type: IssueType
  priority: string
  status: 'open' | 'closed'
  body: string
  action: string
  first_seen: string
  last_seen: string
}

// client_history 기반 fallback용
interface RawItem {
  id: string
  brand_name: string
  title: string
  body: string
  priority: string
  tags: string[]
  occurred_at: string
}

interface IssueNode {
  title: string
  action: string
  type: IssueType
  priority: string
  firstSeen: string
  lastSeen: string
  daysSince: number
  status: IssueStatus
  count: number
  fromDb: boolean   // true = issues 테이블, false = fallback
}

interface BrandData {
  brand: string
  seeded: boolean   // issues 테이블에 데이터 있음
  seeding: boolean
  activeCount: number
  quietCount: number
  issues:    IssueNode[]
  projects:  IssueNode[]
  decisions: IssueNode[]
}

// ── Helpers ───────────────────────────────────────────────
function extractAction(body: string): string {
  const m = body.match(/조치(?:\/결과)?[：:]\s*(.+?)(?:\n|$)/)
  if (!m) return ''
  return m[1].trim().replace(/\*\*/g, '').replace(/\n[\s\S]*/g, '').slice(0, 100)
}

function inferType(tags: string[]): IssueType {
  if (tags?.includes('decision')) return 'decision'
  if (tags?.includes('schedule')) return 'project'
  return 'issue'
}

function daysBetween(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function statusOf(days: number): IssueStatus {
  if (days <= 7)  return 'active'
  if (days <= 30) return 'quiet'
  return 'dormant'
}

function clusterKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(cx-[\d-]+\)/gi, '')
    .trim()
    .slice(0, 32)
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
const STATUS_RANK: Record<IssueStatus, number> = { active: 0, quiet: 1, dormant: 2 }

function sortNodes(nodes: IssueNode[]) {
  return nodes.sort((a, b) => {
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status])
      return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    const pa = PRIORITY_RANK[a.priority] ?? 1
    const pb = PRIORITY_RANK[b.priority] ?? 1
    if (pa !== pb) return pa - pb
    return b.lastSeen.localeCompare(a.lastSeen)
  })
}

// DB rows → IssueNode[]
function dbRowsToNodes(rows: IssueRow[]): IssueNode[] {
  return rows.map(r => {
    const days = daysBetween(r.last_seen)
    return {
      title:     r.title,
      action:    r.action,
      type:      r.type,
      priority:  r.priority,
      firstSeen: r.first_seen,
      lastSeen:  r.last_seen,
      daysSince: days,
      status:    r.status === 'closed' ? 'dormant' : statusOf(days),
      count:     1,
      fromDb:    true,
    }
  })
}

// RawItems → IssueNode[] (fallback)
function rawItemsToNodes(items: RawItem[]): IssueNode[] {
  const clusters = new Map<string, RawItem[]>()
  for (const item of items) {
    const key = clusterKey(item.title)
    if (!clusters.has(key)) clusters.set(key, [])
    clusters.get(key)!.push(item)
  }
  const nodes: IssueNode[] = []
  for (const clusterItems of clusters.values()) {
    clusterItems.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    const newest = clusterItems[0]
    const oldest = clusterItems[clusterItems.length - 1]
    const days   = daysBetween(newest.occurred_at)
    nodes.push({
      title:     newest.title,
      action:    extractAction(newest.body),
      type:      inferType(newest.tags),
      priority:  newest.priority || 'medium',
      firstSeen: oldest.occurred_at,
      lastSeen:  newest.occurred_at,
      daysSince: days,
      status:    statusOf(days),
      count:     clusterItems.length,
      fromDb:    false,
    })
  }
  return nodes
}

function makeBrandData(
  brand: string,
  nodes: IssueNode[],
  seeded: boolean,
  seeding = false,
): BrandData {
  sortNodes(nodes)
  return {
    brand, seeded, seeding,
    activeCount: nodes.filter(n => n.type === 'issue' && n.status === 'active').length,
    quietCount:  nodes.filter(n => n.type === 'issue' && n.status === 'quiet').length,
    issues:      nodes.filter(n => n.type === 'issue'),
    projects:    nodes.filter(n => n.type === 'project'),
    decisions:   nodes.filter(n => n.type === 'decision'),
  }
}

// ── Sub-components ────────────────────────────────────────
const STATUS_CFG: Record<IssueStatus, { dot: string; cls: string }> = {
  active:  { dot: 'bg-status-late', cls: 'text-status-late' },
  quiet:   { dot: 'bg-status-warn', cls: 'text-status-warn' },
  dormant: { dot: 'bg-ink-200',     cls: 'text-ink-300'     },
}

function AgeBadge({ days, status }: { days: number; status: IssueStatus }) {
  const label =
    days === 0  ? '오늘' :
    days < 7    ? `${days}일` :
    days < 30   ? `${Math.round(days / 7)}주` :
    days < 90   ? `${Math.round(days / 30)}개월` : '3개월+'
  return (
    <span className={cn('text-[11px] tabular-nums shrink-0', STATUS_CFG[status].cls)}>
      {label}
    </span>
  )
}

function NodeCard({ node }: { node: IssueNode }) {
  const { dot } = STATUS_CFG[node.status]
  return (
    <div className={cn(
      'flex items-start gap-2.5 px-5 py-2.5 border-b border-line/40 hover:bg-muted/20',
      node.status === 'dormant' && 'opacity-40',
    )}>
      <span className={cn('mt-[5px] w-1.5 h-1.5 rounded-full shrink-0', dot)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-ink leading-snug line-clamp-1 flex-1">
            {node.title}
          </span>
          <AgeBadge days={node.daysSince} status={node.status} />
          {!node.fromDb && node.count > 1 && (
            <span className="text-[11px] text-ink-300 shrink-0">{node.count}건</span>
          )}
        </div>
        {node.action && (
          <p className="mt-0.5 text-[12px] text-ink-400 line-clamp-1">
            → {node.action}
          </p>
        )}
      </div>
    </div>
  )
}

function TypeHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-5 py-1.5 bg-muted/60 border-b border-line/50 flex items-center gap-2">
      <span className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{label}</span>
      <span className="text-[11px] text-ink-300">{count}</span>
    </div>
  )
}

interface BrandRowProps {
  data: BrandData
  defaultOpen: boolean
}

function BrandRow({ data, defaultOpen }: BrandRowProps) {
  const [open, setOpen] = useState(defaultOpen)
  const color = brandColor(data.brand)

  const visibleIssues   = data.issues.filter(n => n.status !== 'dormant')
  const closedIssues    = data.issues.filter(n => n.status === 'dormant')
  const visibleProjects = data.projects.filter(n => n.status !== 'dormant')
  const recentDecisions = data.decisions.slice(0, 5)
  const hasContent      = visibleIssues.length + visibleProjects.length + recentDecisions.length > 0

  return (
    <div className="border-b border-line">
      <button
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/20 text-left"
        onClick={() => setOpen(v => !v)}
      >
        {open
          ? <ChevronDown size={13} className="text-ink-300 shrink-0" />
          : <ChevronRight size={13} className="text-ink-300 shrink-0" />}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[13px] font-semibold text-ink flex-1 min-w-0 truncate">
          {data.brand}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {data.seeded && (
            <span className="text-[11px] text-lilac-400">✦</span>
          )}
          {data.activeCount > 0 && (
            <span className="text-[11px] font-medium text-status-late bg-status-late/10 px-1.5 py-0.5 rounded-full">
              🔴 {data.activeCount}
            </span>
          )}
          {data.quietCount > 0 && (
            <span className="text-[11px] text-status-warn">
              🟡 {data.quietCount}
            </span>
          )}
        </div>
      </button>

      {open && hasContent && (
        <div>
          {visibleIssues.length > 0 && (
            <>
              <TypeHeader label="이슈" count={visibleIssues.length} />
              {visibleIssues.map((n, i) => <NodeCard key={i} node={n} />)}
            </>
          )}
          {visibleProjects.length > 0 && (
            <>
              <TypeHeader label="프로젝트" count={visibleProjects.length} />
              {visibleProjects.map((n, i) => <NodeCard key={i} node={n} />)}
            </>
          )}
          {recentDecisions.length > 0 && (
            <>
              <TypeHeader label="결정" count={recentDecisions.length} />
              {recentDecisions.map((n, i) => <NodeCard key={i} node={n} />)}
            </>
          )}
          {closedIssues.length > 0 && (
            <div className="px-5 py-2 text-[11px] text-ink-300 border-b border-line/30">
              {data.seeded ? `완료/소멸 이슈 ${closedIssues.length}건 숨김` : `소멸 이슈 ${closedIssues.length}건 숨김 (30일+ 미언급)`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────
interface Props {
  brandFilter?: string
}

export function TimelineV2View({ brandFilter }: Props) {
  const [brandMap,   setBrandMap]   = useState<Map<string, BrandData>>(new Map())
  const [loading,    setLoading]    = useState(true)

  // issues 테이블 조회 (있으면 우선 사용)
  const loadIssues = useCallback(async (brand?: string) => {
    const sp = new URLSearchParams()
    if (brand) sp.set('brand', brand)
    const res  = await fetch(`/api/issues?${sp}`)
    const data = await res.json() as { issues: IssueRow[] }
    return data.issues ?? []
  }, [])

  // fallback: client_history 직접 조회
  const loadRaw = useCallback(async (brand?: string) => {
    const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const sp   = new URLSearchParams({ from, limit: '1000' })
    if (brand) sp.set('brand', brand)
    const res  = await fetch(`/api/history?${sp}`)
    const page = await res.json()
    return (page.items ?? []) as RawItem[]
  }, [])

  const buildMap = useCallback(async () => {
    setLoading(true)
    try {
      const [dbIssues, rawItems] = await Promise.all([
        loadIssues(brandFilter),
        loadRaw(brandFilter),
      ])

      // 브랜드 목록 수집
      const brands = new Set<string>()
      dbIssues.forEach(r => brands.add(r.brand_name))
      rawItems.forEach(r => brands.add(r.brand_name || '미분류'))

      const map = new Map<string, BrandData>()

      for (const brand of brands) {
        const seededRows = dbIssues.filter(r => r.brand_name === brand)
        const seeded     = seededRows.length > 0

        const nodes = seeded
          ? dbRowsToNodes(seededRows)
          : rawItemsToNodes(rawItems.filter(r => (r.brand_name || '미분류') === brand))

        map.set(brand, makeBrandData(brand, nodes, seeded))
      }

      setBrandMap(map)
    } finally {
      setLoading(false)
    }
  }, [brandFilter, loadIssues, loadRaw])

  useEffect(() => { buildMap() }, [buildMap])

  // AI 시딩
  const handleSeed = useCallback(async (brand: string) => {
    setBrandMap(prev => {
      const next = new Map(prev)
      const cur  = next.get(brand)
      if (cur) next.set(brand, { ...cur, seeding: true })
      return next
    })
    try {
      const res = await fetch('/api/issues/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: brand }),
      })
      const result = await res.json()
      if (!res.ok) {
        alert(`시딩 실패: ${result.error}`)
        setBrandMap(prev => {
          const next = new Map(prev)
          const cur  = next.get(brand)
          if (cur) next.set(brand, { ...cur, seeding: false })
          return next
        })
        return
      }
      // 시딩 완료 → 해당 브랜드 데이터 재로드
      const freshIssues = await loadIssues(brand)
      const seededNodes = dbRowsToNodes(freshIssues)
      setBrandMap(prev => {
        const next = new Map(prev)
        next.set(brand, makeBrandData(brand, seededNodes, true))
        return next
      })
    } catch {
      setBrandMap(prev => {
        const next = new Map(prev)
        const cur  = next.get(brand)
        if (cur) next.set(brand, { ...cur, seeding: false })
        return next
      })
    }
  }, [loadIssues])

  const brandGroups = useMemo(() => {
    const list = Array.from(brandMap.values())
    return list.sort((a, b) =>
      (b.seeded ? 1 : 0) - (a.seeded ? 1 : 0)
      || b.activeCount - a.activeCount
      || b.quietCount  - a.quietCount
    )
  }, [brandMap])

  const totalActive = useMemo(
    () => brandGroups.reduce((s, b) => s + b.activeCount, 0),
    [brandGroups]
  )
  const seededCount = brandGroups.filter(b => b.seeded).length

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-ink-300" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 상단 요약 */}
      <div className="shrink-0 px-5 py-2.5 border-b bg-card flex items-center gap-3 text-[12px]">
        <span className="text-ink-400">최근 90일</span>
        <span className="text-ink-200">|</span>
        <span className="text-ink font-medium">{brandGroups.length}개 브랜드</span>
        <span className="text-ink-200">|</span>
        <span className="text-status-late font-medium">🔴 활성 이슈 {totalActive}건</span>
        {seededCount > 0 && (
          <>
            <span className="text-ink-200">|</span>
            <span className="text-lilac-500 font-medium">✦ AI 통합 {seededCount}개 브랜드</span>
          </>
        )}
        <span className="ml-auto text-[11px] text-ink-300">
          ✦ AI 통합된 브랜드
        </span>
      </div>

      {/* 브랜드 목록 */}
      <div className="flex-1 overflow-y-auto">
        {brandGroups.map((data, i) => (
          <BrandRow
            key={data.brand}
            data={data}
            defaultOpen={i < 5 || data.brand === brandFilter || data.seeded}
          />
        ))}
      </div>
    </div>
  )
}
