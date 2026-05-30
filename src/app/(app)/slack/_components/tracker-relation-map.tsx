'use client'

import { useMemo } from 'react'
import { scalePoint } from 'd3-scale'
import { line, curveBumpX, curveBumpY } from 'd3-shape'
import { type TrackerIssueRow, type Relation, nodeStatus } from './_tracker-shared'

// 관계 타입별 색 (CSS 변수)
const REL_COLOR: Record<string, string> = {
  causes:    'var(--color-status-late)',
  blocks:    'var(--color-status-warn)',
  continues: 'var(--color-status-future)',
  recurs_as: 'var(--color-lilac-500)',
  related:   'var(--color-ink-300)',
}
const ST_COLOR: Record<string, string> = {
  active: 'var(--color-status-late)',
  warn:   'var(--color-status-warn)',
  closed: 'var(--color-ink-300)',
}
const DASHED = new Set(['related', 'recurs_as'])
const LANES = ['decision', 'project', 'issue'] as const
const LANE_LABEL: Record<string, string> = { decision: '결정', project: '프로젝트', issue: '이슈' }

const NW = 158, NH = 44       // 노드 박스
const GAP_X = 28              // 노드 사이 최소 가로 간격
const LANE_H = 104            // 레인 높이
const PAD_L = 70, PAD_R = 30, PAD_T = 28

interface Props {
  issues: TrackerIssueRow[]
  relations: Relation[]
  selectedId: string | null
  onSelect: (id: string) => void
}

// 부모 노드 + 관계를 SVG로. 타입 레인(Y) × 레인별 시간순 균등 배치(X, d3-scale) → 겹침 방지.
export function RelationMap({ issues, relations, selectedId, onSelect }: Props) {
  const { nodes, pos, W, H, linkPath } = useMemo(() => {
    const parents = issues.filter(r => !r.parent_issue_id)
    const relIds = new Set(relations.flatMap(r => [r.from_issue_id, r.to_issue_id]))
    const nodes = parents
      .filter(n => relIds.has(n.id))
      .sort((a, b) => (a.first_seen ?? '').localeCompare(b.first_seen ?? ''))

    // 레인별 그룹 (각 레인 안에서 시간순)
    const byLane: Record<string, TrackerIssueRow[]> = { decision: [], project: [], issue: [] }
    for (const n of nodes) (byLane[n.type] ?? byLane.issue).push(n)

    // 가장 노드 많은 레인 기준으로 캔버스 폭 결정 (겹침 없도록 노드폭+간격 보장)
    const maxCount = Math.max(1, ...LANES.map(l => byLane[l].length))
    const W = Math.max(720, PAD_L + PAD_R + maxCount * NW + (maxCount - 1) * GAP_X)
    const H = PAD_T + LANES.length * LANE_H

    const pos = new Map<string, { x: number; y: number }>()
    LANES.forEach((lane, li) => {
      const items = byLane[lane]
      const cy = PAD_T + li * LANE_H + LANE_H / 2
      // 레인별 균등 분포 (d3 scalePoint)
      const sx = scalePoint<string>()
        .domain(items.map(n => n.id))
        .range([PAD_L + NW / 2, Math.max(PAD_L + NW / 2, W - PAD_R - NW / 2)])
        .align(items.length === 1 ? 0 : 0.5)
      items.forEach(n => pos.set(n.id, { x: sx(n.id) ?? PAD_L + NW / 2, y: cy }))
    })

    // 관계선 path 생성 — 같은 레인이면 위로 아치(bumpY), 레인 다르면 bumpX
    const horiz = line().curve(curveBumpX)
    const vert = line().curve(curveBumpY)
    const linkPath = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      if (Math.abs(a.y - b.y) < 1) {
        // 같은 레인: 살짝 위로 띄운 아치
        const lift = 34
        return vert([[a.x, a.y], [(a.x + b.x) / 2, a.y - lift], [b.x, b.y]] as [number, number][]) ?? ''
      }
      return horiz([[a.x, a.y], [b.x, b.y]] as [number, number][]) ?? ''
    }

    return { nodes, pos, W, H, linkPath }
  }, [issues, relations])

  // 선택 노드 + 직접 연결된 노드 집합 (강조용). 미선택이면 null = 전체 표시.
  const connectedSet = useMemo(() => {
    if (selectedId == null) return null
    const set = new Set<string>([selectedId])
    for (const r of relations) {
      if (r.from_issue_id === selectedId) set.add(r.to_issue_id)
      if (r.to_issue_id === selectedId) set.add(r.from_issue_id)
    }
    return set
  }, [selectedId, relations])

  if (nodes.length === 0) {
    return (
      <div className="shrink-0 border-b border-ink-100 bg-ink-50/40 px-4 py-6 text-center text-2xs text-ink-300">
        표시할 관계가 없습니다. (관계가 연결된 이슈가 없음)
      </div>
    )
  }

  return (
    <div className="shrink-0 border-b border-ink-100 bg-ink-50/40">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: Math.min(W, 900), height: H }}>
          <defs>
            <marker id="rm-arrow" markerWidth="9" markerHeight="9" refX="8" refY="3"
              orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L8,3 L0,6 Z" fill="var(--color-ink-400)" />
            </marker>
          </defs>

          {/* 레인 라벨 + 구분선 */}
          {LANES.map((t, li) => {
            const cy = PAD_T + li * LANE_H + LANE_H / 2
            return (
              <g key={t}>
                <line x1={PAD_L - 12} y1={PAD_T + li * LANE_H} x2={W} y2={PAD_T + li * LANE_H}
                  stroke="var(--color-ink-100)" strokeWidth={1} />
                <text x={8} y={cy + 3} fontSize={10} fill="var(--color-ink-300)">{LANE_LABEL[t]}</text>
              </g>
            )
          })}

          {/* 관계선 — 미선택 시 약하게(구조선만 보임), 선택 시 연결선만 강조 */}
          {relations.map(r => {
            const a = pos.get(r.from_issue_id)
            const b = pos.get(r.to_issue_id)
            if (!a || !b) return null
            const color = REL_COLOR[r.relation_type] ?? REL_COLOR.related
            const weak = r.relation_type === 'related' || r.relation_type === 'recurs_as'
            const connected = selectedId === r.from_issue_id || selectedId === r.to_issue_id
            const opacity = selectedId != null
              ? (connected ? 0.9 : 0.05)         // 선택: 연결선만 강조, 나머지 거의 숨김
              : (weak ? 0.18 : 0.5)              // 미선택: 연관/재발은 아주 옅게, 구조선만 보임
            return (
              <path key={r.id} d={linkPath(a, b)}
                fill="none" stroke={color}
                strokeWidth={r.relation_type === 'continues' ? 2.5 : 1.5}
                strokeDasharray={DASHED.has(r.relation_type) ? '5 4' : undefined}
                markerEnd="url(#rm-arrow)"
                opacity={opacity}
              />
            )
          })}

          {/* 노드 */}
          {nodes.map(n => {
            const p = pos.get(n.id)!
            const st = nodeStatus(n)
            const sel = selectedId === n.id
            const dim = connectedSet != null && !connectedSet.has(n.id)
            const title = n.title.length > 16 ? n.title.slice(0, 15) + '…' : n.title
            return (
              <g key={n.id} transform={`translate(${p.x - NW / 2},${p.y - NH / 2})`}
                onClick={() => onSelect(n.id)} style={{ cursor: 'pointer' }} opacity={dim ? 0.4 : 1}>
                <rect width={NW} height={NH} rx={6} fill="white"
                  stroke={sel ? 'var(--color-status-future)' : 'var(--color-ink-200)'}
                  strokeWidth={sel ? 2 : 1} />
                <rect width={4} height={NH} rx={2} fill={ST_COLOR[st]} />
                <text x={14} y={NH / 2 + 4} fontSize={12} fill="var(--color-ink-700)">{title}</text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-1.5 text-3xs text-ink-400">
        <span style={{ color: 'var(--color-status-future)' }}>━ 연속</span>
        <span style={{ color: 'var(--color-status-late)' }}>━ 유발</span>
        <span style={{ color: 'var(--color-status-warn)' }}>━ 차단</span>
        <span style={{ color: 'var(--color-lilac-500)' }}>┄ 재발</span>
        <span style={{ color: 'var(--color-ink-400)' }}>┄ 연관</span>
      </div>
    </div>
  )
}
