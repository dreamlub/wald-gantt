'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { CalendarDays, Loader2, SlidersHorizontal } from 'lucide-react'
import {
  type TrackerIssueRow, type Relation, type TypeFilter, type RelationType,
  TYPE_META, TYPE_KEYS, nodeStatus,
} from './_tracker-shared'
import { NodeRow, ClusterGroup } from './tracker-node-row'
import { IssueDetailPanel } from './tracker-detail-panel'

interface Props { brandFilter?: string }

export function TimelineTracker({ brandFilter }: Props) {
  const [issues, setIssues] = useState<TrackerIssueRow[]>([])
  const [relations, setRelations] = useState<Relation[]>([])
  const [evidenceCounts, setEvidenceCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<Set<TypeFilter>>(new Set())
  const [showClosed, setShowClosed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 이슈 + 관계 로드 (좌·우 공유)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true)
    setSelectedId(null)
    const sp = new URLSearchParams()
    if (brandFilter) sp.set('brand', brandFilter)
    fetch(`/api/issues?${sp}`)
      .then(r => r.json())
      .then(({
        issues: rows,
        relations: rels,
        evidenceCounts: counts,
      }: {
        issues: TrackerIssueRow[]
        relations: Relation[]
        evidenceCounts: Record<string, number>
      }) => {
        setIssues(rows ?? [])
        setRelations(rels ?? [])
        setEvidenceCounts(counts ?? {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [brandFilter])
  /* eslint-enable react-hooks/set-state-in-effect */

  // 노드 토글 선택 (재클릭 시 해제)
  const toggleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id))
  }, [])

  const relCountOf = useCallback(
    (id: string) => relations.filter(r => r.from_issue_id === id || r.to_issue_id === id).length,
    [relations],
  )

  // 타입별 필터 + 트리 구성 (우측 포레스트)
  const { trees, standalones } = useMemo(() => {
    const rows = issues.filter(r =>
      (typeFilter.size === 0 || typeFilter.has(r.type as TypeFilter)) &&
      (showClosed || nodeStatus(r) !== 'closed')
    )
    const byId = new Map(rows.map(r => [r.id, r]))
    const parentIds = new Set(rows.filter(r => r.parent_issue_id && byId.has(r.parent_issue_id)).map(r => r.parent_issue_id!))
    const childMap = new Map<string, TrackerIssueRow[]>()
    for (const r of rows) {
      if (r.parent_issue_id && byId.has(r.parent_issue_id)) {
        const arr = childMap.get(r.parent_issue_id) ?? []
        arr.push(r)
        childMap.set(r.parent_issue_id, arr)
      }
    }
    const rank = (r: TrackerIssueRow) => ({ active: 0, warn: 1, closed: 2 }[nodeStatus(r)])
    const trees = rows
      .filter(r => parentIds.has(r.id))
      .sort((a, b) => rank(a) - rank(b))
      .map(root => ({ root, children: (childMap.get(root.id) ?? []).sort((a, b) => rank(a) - rank(b)) }))
    // 부모가 없거나, 부모가 현재 필터에서 빠져 보이지 않으면(고아 승격) standalone 으로
    const standalones = rows
      .filter(r => !parentIds.has(r.id) && (!r.parent_issue_id || !byId.has(r.parent_issue_id)))
      .sort((a, b) => rank(a) - rank(b))
    return { trees, standalones }
  }, [issues, typeFilter, showClosed])

  // 트래킹 작성 기준일 = 가장 최근 created_at (없으면 last_seen)
  const trackedLabel = useMemo(() => {
    const dates = issues.map(r => r.created_at ?? r.last_seen).filter(Boolean).sort()
    const latest = dates.at(-1)
    if (!latest) return null
    const [, mm, dd] = latest.slice(0, 10).split('-')
    return `${Number(mm)}월 ${Number(dd)}일 기준 작성`
  }, [issues])

  // 선택 이슈의 open 자식 수 (부모 닫기 confirm용)
  const selectedChildCount = useMemo(
    () => selectedId ? issues.filter(r => r.parent_issue_id === selectedId && r.status === 'open').length : 0,
    [issues, selectedId],
  )

  // 낙관적 갱신 + API 호출
  const handleStatusChange = useCallback(async (
    id: string,
    newStatus: 'open' | 'closed',
    includeChildren: boolean,
  ) => {
    // optimistic
    setIssues(prev => prev.map(r => {
      if (r.id === id) return { ...r, status: newStatus }
      if (includeChildren && r.parent_issue_id === id) return { ...r, status: newStatus }
      return r
    }))
    try {
      const res = await fetch(`/api/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, includeChildren }),
      })
      if (!res.ok) throw new Error('API error')
      const { updated } = await res.json() as { updated: TrackerIssueRow[] }
      const map = new Map(updated.map(u => [u.id, u]))
      setIssues(prev => prev.map(r => (map.has(r.id) ? map.get(r.id)! : r)))
    } catch {
      // 낙관적 업데이트 되돌리기
      const revert = newStatus === 'open' ? 'closed' : 'open'
      setIssues(prev => prev.map(r => {
        if (r.id === id) return { ...r, status: revert }
        if (includeChildren && r.parent_issue_id === id) return { ...r, status: revert }
        return r
      }))
    }
  }, [])

  // A안: 선택 노드 기준 관계 방향칩 맵 + 무관 노드 dim 집합 (미선택이면 null)
  const { relMap, dimSet } = useMemo(() => {
    if (selectedId == null) return { relMap: undefined, dimSet: null as Set<string> | null }
    const rm = new Map<string, { type: RelationType; outgoing: boolean }>()
    const connected = new Set<string>([selectedId])
    for (const r of relations) {
      if (r.from_issue_id === selectedId) { rm.set(r.to_issue_id, { type: r.relation_type, outgoing: true }); connected.add(r.to_issue_id) }
      if (r.to_issue_id === selectedId)   { rm.set(r.from_issue_id, { type: r.relation_type, outgoing: false }); connected.add(r.from_issue_id) }
    }
    // dim 대상 = 화면에 보이는 노드 중 선택·연결에 안 든 것
    const dim = new Set<string>()
    for (const t of trees) {
      if (!connected.has(t.root.id)) dim.add(t.root.id)
      for (const c of t.children) if (!connected.has(c.id)) dim.add(c.id)
    }
    for (const s of standalones) if (!connected.has(s.id)) dim.add(s.id)
    return { relMap: rm, dimSet: dim }
  }, [selectedId, relations, trees, standalones])

  const selectedRels = selectedId
    ? relations.filter(r => r.from_issue_id === selectedId || r.to_issue_id === selectedId)
    : []
  const selectedIssue = selectedId ? issues.find(r => r.id === selectedId) ?? null : null
  const titleOf = (id: string) => issues.find(r => r.id === id)?.title ?? '(삭제됨)'

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* 상단: 브랜드명 + 작성 기준일 + 타입 필터 */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 border-b border-ink-100">
        <span className="text-base font-bold text-foreground">{brandFilter ?? '전체'}</span>
        {trackedLabel && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays size={12} />
            {trackedLabel}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {TYPE_KEYS.map(key => {
            const meta = TYPE_META[key]
            const on = typeFilter.has(key)
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(prev => {
                  const next = new Set(prev)
                  if (next.has(key)) next.delete(key); else next.add(key)
                  return next
                })}
                className="inline-flex items-center text-3xs font-medium px-2 py-0.5 rounded-full border transition-all hover:opacity-80"
                style={on
                  ? { backgroundColor: meta.color, color: 'var(--color-tag-vivid-text)', borderColor: meta.color }
                  : { backgroundColor: 'transparent', color: meta.color, borderColor: meta.color }}
              >
                {meta.label}
              </button>
            )
          })}
          <div className="w-px h-3.5 bg-ink-200 shrink-0" />
          <button
            onClick={() => setShowClosed(v => !v)}
            className={`inline-flex items-center gap-1 text-3xs font-medium px-2 py-0.5 rounded-full border transition-all ${
              showClosed
                ? 'bg-ink-100 text-ink-600 border-ink-300'
                : 'bg-transparent text-ink-400 border-ink-200 hover:border-ink-300'
            }`}
          >
            <SlidersHorizontal size={10} />
            해결 포함
          </button>
        </div>
      </div>

      {/* 좌우 2단 — 좌측은 계층, 우측은 선택 상세 */}
      <div className="flex-1 flex min-h-0">
        {/* 좌: 이슈 하이어라키 (비율 2 : 우측 3) */}
        <div className="flex-[2] min-w-0 border-r border-ink-100 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 size={18} className="animate-spin text-ink-300" />
              </div>
            ) : trees.length === 0 && standalones.length === 0 ? (
              <div className="h-full flex items-center justify-center text-2xs text-ink-300">
                {typeFilter.size === 1
                  ? `${typeFilter.has('issue') ? '이슈' : typeFilter.has('project') ? '프로젝트' : '결정'}가 없습니다.`
                  : '항목이 없습니다.'
                }
              </div>
            ) : (
              <div className="pb-4">
                {trees.map(t => (
                  <ClusterGroup
                    key={t.root.id}
                    root={t.root}
                    childRows={t.children}
                    selectedId={selectedId}
                    relCountOf={relCountOf}
                    onSelect={toggleSelect}
                    relMap={relMap}
                    dimSet={dimSet}
                  />
                ))}
                {standalones.map(r => (
                  <NodeRow
                    key={r.id}
                    row={r}
                    selected={selectedId === r.id}
                    relCount={relCountOf(r.id)}
                    onSelect={toggleSelect}
                    relTo={relMap?.get(r.id)}
                    dimmed={dimSet?.has(r.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우: 선택 상세 — 흰 배경 위에 테두리 카드로 분리 (비율 3) */}
        <div className="flex-[3] min-w-0 bg-white p-4">
          <div className="h-full rounded-lg border bg-card shadow-sm overflow-hidden">
            <IssueDetailPanel
              issue={selectedIssue}
              relations={selectedRels}
              evidenceCount={selectedId ? evidenceCounts[selectedId] ?? 0 : 0}
              childCount={selectedChildCount}
              titleOf={titleOf}
              onSelect={setSelectedId}
              onStatusChange={handleStatusChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
