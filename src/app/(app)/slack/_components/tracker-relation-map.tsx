'use client'

import { useMemo, useCallback } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeProps, Handle, Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { type TrackerIssueRow, type Relation, nodeStatus } from './_tracker-shared'

// 관계 타입별 색 (CSS 변수)
const REL_COLOR: Record<string, string> = {
  causes:    'var(--color-status-late)',
  blocks:    'var(--color-status-warn)',
  continues: 'var(--color-status-future)',
  recurs_as: 'var(--color-lilac-500)',
  related:   'var(--color-ink-300)',
}
const REL_LABEL: Record<string, string> = {
  causes: '유발', blocks: '차단', continues: '연속', recurs_as: '재발', related: '연관',
}
const ST_COLOR: Record<string, string> = {
  active: 'var(--color-status-late)',
  warn:   'var(--color-status-warn)',
  closed: 'var(--color-ink-300)',
}
const TYPE_LABEL: Record<string, string> = { decision: '결정', project: '프로젝트', issue: '이슈' }

const NODE_W = 180, NODE_H = 48

// ── 커스텀 노드 (기존 카드 스타일) ─────────────────────────
type IssueNodeData = { row: TrackerIssueRow; selected: boolean; dim: boolean }

function IssueNode({ data }: NodeProps) {
  const { row, selected, dim } = data as unknown as IssueNodeData
  const st = nodeStatus(row)
  const title = row.title.length > 18 ? row.title.slice(0, 17) + '…' : row.title
  return (
    <div
      className="rounded-md border bg-white flex items-stretch overflow-hidden transition-opacity"
      style={{
        width: NODE_W, height: NODE_H,
        borderColor: selected ? 'var(--color-status-future)' : 'var(--color-ink-200)',
        borderWidth: selected ? 2 : 1,
        opacity: dim ? 0.35 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ width: 4, background: ST_COLOR[st] }} />
      <div className="flex flex-col justify-center px-2.5 min-w-0">
        <span className="text-3xs text-ink-300">{TYPE_LABEL[row.type] ?? row.type}</span>
        <span className="text-xs font-medium text-ink-700 truncate">{title}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { issue: IssueNode }

// ── dagre 자동 레이아웃 ────────────────────────────────────
function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 80, marginx: 16, marginy: 16 })
  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const { x, y } = g.node(n.id)
    return { ...n, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } }
  })
}

interface Props {
  issues: TrackerIssueRow[]
  relations: Relation[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function RelationMap({ issues, relations, selectedId, onSelect }: Props) {
  // 선택 노드 + 직접 연결 노드 집합
  const connectedSet = useMemo(() => {
    if (selectedId == null) return null
    const set = new Set<string>([selectedId])
    for (const r of relations) {
      if (r.from_issue_id === selectedId) set.add(r.to_issue_id)
      if (r.to_issue_id === selectedId) set.add(r.from_issue_id)
    }
    return set
  }, [selectedId, relations])

  const { rfNodes, rfEdges, isEmpty } = useMemo(() => {
    const parents = issues.filter(r => !r.parent_issue_id)
    const relIds = new Set(relations.flatMap(r => [r.from_issue_id, r.to_issue_id]))
    const shown = parents.filter(n => relIds.has(n.id))
    if (shown.length === 0) return { rfNodes: [], rfEdges: [], isEmpty: true }

    const idset = new Set(shown.map(n => n.id))

    const baseNodes: Node[] = shown.map(row => ({
      id: row.id,
      type: 'issue',
      position: { x: 0, y: 0 },
      data: {
        row,
        selected: selectedId === row.id,
        dim: connectedSet != null && !connectedSet.has(row.id),
      },
      draggable: true,
    }))

    const edges: Edge[] = relations
      .filter(r => idset.has(r.from_issue_id) && idset.has(r.to_issue_id))
      .map(r => {
        const color = REL_COLOR[r.relation_type] ?? REL_COLOR.related
        const weak = r.relation_type === 'related' || r.relation_type === 'recurs_as'
        const connected = selectedId === r.from_issue_id || selectedId === r.to_issue_id
        const opacity = selectedId != null ? (connected ? 1 : 0.08) : (weak ? 0.3 : 0.85)
        return {
          id: r.id,
          source: r.from_issue_id,
          target: r.to_issue_id,
          label: REL_LABEL[r.relation_type] ?? r.relation_type,
          type: 'default',
          animated: r.relation_type === 'continues' && connected,
          style: {
            stroke: color,
            strokeWidth: r.relation_type === 'continues' ? 2.5 : 1.5,
            strokeDasharray: weak ? '5 4' : undefined,
            opacity,
          },
          labelStyle: { fontSize: 10, fill: 'var(--color-ink-400)', opacity },
          labelBgStyle: { fill: 'white', opacity: opacity > 0.5 ? 0.85 : 0 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        } as Edge
      })

    return { rfNodes: layout(baseNodes, edges), rfEdges: edges, isEmpty: false }
  }, [issues, relations, selectedId, connectedSet])

  const onNodeClick = useCallback((_: unknown, n: Node) => onSelect(n.id), [onSelect])

  if (isEmpty) {
    return (
      <div className="shrink-0 border-b border-ink-100 bg-ink-50/40 px-4 py-6 text-center text-2xs text-ink-300">
        표시할 관계가 없습니다. (관계가 연결된 이슈가 없음)
      </div>
    )
  }

  return (
    <div className="shrink-0 border-b border-ink-100 bg-ink-50/40" style={{ height: 340 }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="var(--color-ink-100)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="var(--color-ink-200)" />
      </ReactFlow>
    </div>
  )
}
