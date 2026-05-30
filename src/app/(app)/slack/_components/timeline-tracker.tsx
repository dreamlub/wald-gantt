'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import {
  type TrackerIssueRow, type Relation, type TypeFilter,
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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('issue')
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
    const rows = issues.filter(r => r.type === typeFilter)
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
    const standalones = rows
      .filter(r => !r.parent_issue_id && !parentIds.has(r.id))
      .sort((a, b) => rank(a) - rank(b))
    return { trees, standalones }
  }, [issues, typeFilter])

  // 트래킹 작성 기준일 = 가장 최근 created_at (없으면 last_seen)
  const trackedLabel = useMemo(() => {
    const dates = issues.map(r => r.created_at ?? r.last_seen).filter(Boolean).sort()
    const latest = dates.at(-1)
    if (!latest) return null
    const [, mm, dd] = latest.slice(0, 10).split('-')
    return `${Number(mm)}월 ${Number(dd)}일 기준 작성`
  }, [issues])

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
        <div className="ml-auto flex items-center gap-1.5">
          {TYPE_KEYS.map(key => {
            const meta = TYPE_META[key]
            const on = typeFilter === key
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className="inline-flex items-center text-3xs font-medium px-2 py-0.5 rounded-full border transition-all hover:opacity-80"
                style={on
                  ? { backgroundColor: meta.color, color: 'var(--color-tag-vivid-text)', borderColor: meta.color }
                  : { backgroundColor: 'transparent', color: meta.color, borderColor: meta.color }}
              >
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 좌우 2단 — 좌측은 계층, 우측은 선택 상세 */}
      <div className="flex-1 flex min-h-0">
        {/* 좌: 이슈 하이어라키 */}
        <div
          className="shrink-0 border-r border-ink-100 flex flex-col min-h-0"
          style={{ width: 'var(--tracker-list-w, 460px)' }}
        >
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 size={18} className="animate-spin text-ink-300" />
              </div>
            ) : trees.length === 0 && standalones.length === 0 ? (
              <div className="h-full flex items-center justify-center text-2xs text-ink-300">
                {typeFilter === 'issue' ? '이슈' : typeFilter === 'project' ? '프로젝트' : '결정'}가 없습니다.
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
                  />
                ))}
                {standalones.map(r => (
                  <NodeRow
                    key={r.id}
                    row={r}
                    selected={selectedId === r.id}
                    relCount={relCountOf(r.id)}
                    onSelect={toggleSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우: 선택 상세 — 흰 배경 위에 테두리 카드로 분리 */}
        <div className="flex-1 min-w-0 bg-white p-4">
          <div className="h-full rounded-lg border bg-card shadow-sm overflow-hidden">
            <IssueDetailPanel
              issue={selectedIssue}
              relations={selectedRels}
              evidenceCount={selectedId ? evidenceCounts[selectedId] ?? 0 : 0}
              titleOf={titleOf}
              onSelect={setSelectedId}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
