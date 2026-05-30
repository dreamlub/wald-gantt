'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────
interface IssueRow {
  id: string
  brand_name: string
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

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  type: IssueRow['type']
  priority: string
  status: IssueRow['status']
  body: string
  action: string
  first_seen: string
  last_seen: string
  isCluster: boolean  // 자식이 있는 부모 노드
  r: number
  fill: string
  stroke: string
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

// ── Helpers ───────────────────────────────────────────────
function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

function nodeStyle(row: IssueRow, isCluster: boolean): { fill: string; stroke: string; r: number } {
  if (row.status === 'closed') return { fill: '#6ee7b7', stroke: '#34d399', r: row.type === 'decision' ? 9 : 14 }
  if (row.type === 'decision') return { fill: '#c4b5fd', stroke: '#a78bfa', r: 9 }
  if (row.type === 'project') return { fill: '#93c5fd', stroke: '#60a5fa', r: isCluster ? 20 : 15 }
  const days = daysSince(row.last_seen)
  const base  = isCluster ? 22 : 14
  if (days <= 7)  return { fill: '#fca5a5', stroke: '#ef4444', r: base }
  if (days <= 30) return { fill: '#fdba74', stroke: '#f97316', r: base }
  return { fill: '#d1d5db', stroke: '#9ca3af', r: base }
}

function ageTxt(d: string) {
  const days = daysSince(d)
  if (days === 0) return '오늘'
  if (days < 7)   return `${days}일`
  if (days < 30)  return `${Math.round(days / 7)}주`
  if (days < 90)  return `${Math.round(days / 30)}개월`
  return '3개월+'
}

// ── Detail Panel ──────────────────────────────────────────
function DetailPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const typeLabel = node.type === 'issue' ? '이슈' : node.type === 'project' ? '프로젝트' : '결정'
  const statusLabel = node.status === 'open'
    ? (daysSince(node.last_seen) <= 7 ? '🔴 활성' : daysSince(node.last_seen) <= 30 ? '🟡 조용함' : '⚫ 소멸')
    : '✅ 완료'

  return (
    <div className="w-72 shrink-0 border-l bg-card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <span className="text-[11px] font-medium text-ink-400 uppercase">{typeLabel}</span>
        <span className="text-[11px] text-ink-400 ml-auto">{statusLabel}</span>
        <button onClick={onClose} className="text-ink-300 hover:text-ink ml-1">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-[13px]">
        <p className="font-semibold text-ink leading-snug">{node.title}</p>
        {node.body && (
          <div>
            <p className="text-[11px] font-semibold text-ink-400 mb-1 uppercase tracking-wide">경과</p>
            <p className="text-ink-600 leading-relaxed">{node.body}</p>
          </div>
        )}
        {node.action && (
          <div className="bg-status-late/5 border border-status-late/20 rounded-md px-3 py-2">
            <p className="text-[11px] font-semibold text-status-late mb-1">필요한 조치</p>
            <p className="text-ink-600 leading-relaxed">{node.action}</p>
          </div>
        )}
        <div className="text-[11px] text-ink-300 space-y-0.5">
          <p>첫 발생: {node.first_seen.slice(0, 10)}</p>
          <p>마지막: {node.last_seen.slice(0, 10)} ({ageTxt(node.last_seen)} 전)</p>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────
interface Props { brandFilter?: string }

export function IssueGraphView({ brandFilter }: Props) {
  const svgRef     = useRef<SVGSVGElement>(null)
  const simRef     = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)
  const nodesRef   = useRef<GraphNode[]>([])
  const linksRef   = useRef<GraphLink[]>([])
  const [tick,     setTick]     = useState(0)
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [loading,  setLoading]  = useState(true)

  // 데이터 로드
  useEffect(() => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (brandFilter) sp.set('brand', brandFilter)
    fetch(`/api/issues?${sp}`)
      .then(r => r.json())
      .then(({ issues }: { issues: IssueRow[] }) => {
        const clusterIds = new Set(
          issues.filter(i => i.parent_issue_id).map(i => i.parent_issue_id!)
        )
        nodesRef.current = issues.map(row => {
          const isCluster = clusterIds.has(row.id)
          const style     = nodeStyle(row, isCluster)
          return {
            id: row.id, title: row.title, type: row.type,
            priority: row.priority, status: row.status,
            body: row.body, action: row.action,
            first_seen: row.first_seen, last_seen: row.last_seen,
            isCluster, ...style,
          }
        })
        linksRef.current = issues
          .filter(i => i.parent_issue_id)
          .map(i => ({ source: i.parent_issue_id!, target: i.id }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [brandFilter])

  // D3 시뮬레이션
  useEffect(() => {
    if (loading || !nodesRef.current.length || !svgRef.current) return

    const { width, height } = svgRef.current.getBoundingClientRect()
    if (simRef.current) simRef.current.stop()

    const sim = d3.forceSimulation<GraphNode>(nodesRef.current)
      .force('link', d3.forceLink<GraphNode, GraphLink>(linksRef.current)
        .id(d => d.id).distance(90).strength(0.7))
      .force('charge', d3.forceManyBody<GraphNode>()
        .strength(d => d.isCluster ? -500 : -180))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collide', d3.forceCollide<GraphNode>().radius(d => d.r + 14))
      .alphaDecay(0.03)

    sim.on('tick', () => setTick(t => t + 1))
    simRef.current = sim

    // 줌/패닝 (SVG 내부 g 요소 대상)
    const svg  = d3.select(svgRef.current)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', ({ transform }) => {
        svg.select('g.zoom-group').attr('transform', transform.toString())
      })
    svg.call(zoom)

    return () => { sim.stop() }
  }, [loading])

  // 드래그
  const handleMouseDown = useCallback((e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation()
    const sim = simRef.current
    if (!sim) return
    sim.alphaTarget(0.3).restart()
    node.fx = node.x; node.fy = node.y

    const onMove = (ev: MouseEvent) => {
      const svg  = svgRef.current!.getBoundingClientRect()
      const zoom = d3.zoomTransform(svgRef.current!)
      node.fx = (ev.clientX - svg.left - zoom.x) / zoom.k
      node.fy = (ev.clientY - svg.top  - zoom.y) / zoom.k
    }
    const onUp = () => {
      sim.alphaTarget(0)
      node.fx = null; node.fy = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-ink-300" />
      </div>
    )
  }

  const nodes = nodesRef.current
  const links = linksRef.current as Array<{ source: GraphNode; target: GraphNode }>

  // 레전드
  const legend = [
    { color: '#fca5a5', stroke: '#ef4444', label: '활성 이슈 (7일 내)' },
    { color: '#fdba74', stroke: '#f97316', label: '조용한 이슈 (7-30일)' },
    { color: '#d1d5db', stroke: '#9ca3af', label: '소멸 이슈 (30일+)' },
    { color: '#93c5fd', stroke: '#60a5fa', label: '프로젝트' },
    { color: '#c4b5fd', stroke: '#a78bfa', label: '결정' },
    { color: '#6ee7b7', stroke: '#34d399', label: '완료/확정' },
  ]

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 그래프 */}
      <div className="flex-1 relative overflow-hidden bg-muted/20">
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onClick={() => setSelected(null)}
        >
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6"
              refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#d1d5db" />
            </marker>
          </defs>
          <g className="zoom-group">
            {/* 엣지 */}
            {links.map((l, i) => {
              if (!l.source?.x || !l.target?.x) return null
              return (
                <line key={i}
                  x1={l.source.x} y1={l.source.y}
                  x2={l.target.x} y2={l.target.y}
                  stroke="#d1d5db" strokeWidth={1.5}
                  strokeDasharray={l.target.status === 'closed' ? '4,3' : undefined}
                  markerEnd="url(#arrow)"
                />
              )
            })}
            {/* 노드 */}
            {nodes.map(n => (
              <g key={n.id}
                transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                className="cursor-pointer select-none"
                onClick={e => { e.stopPropagation(); setSelected(n) }}
                onMouseDown={e => handleMouseDown(e, n)}
              >
                <circle
                  r={n.r}
                  fill={n.fill}
                  stroke={selected?.id === n.id ? '#6366f1' : n.stroke}
                  strokeWidth={selected?.id === n.id ? 2.5 : 1.5}
                  className="transition-[stroke-width]"
                />
                {/* 클러스터 노드만 텍스트 */}
                {(n.isCluster || n.type !== 'issue') && (
                  <text
                    textAnchor="middle"
                    dy={n.r + 13}
                    fontSize={10}
                    fill="#6b7280"
                    className="pointer-events-none"
                    style={{ maxWidth: 80 }}
                  >
                    {n.title.length > 12 ? n.title.slice(0, 12) + '…' : n.title}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>

        {/* 레전드 */}
        <div className="absolute bottom-4 left-4 bg-card/90 border border-line rounded-lg px-3 py-2 flex flex-col gap-1">
          {legend.map(l => (
            <div key={l.label} className="flex items-center gap-2 text-[11px] text-ink-400">
              <svg width={12} height={12}>
                <circle cx={6} cy={6} r={5} fill={l.color} stroke={l.stroke} strokeWidth={1.5} />
              </svg>
              {l.label}
            </div>
          ))}
          <div className="mt-1 pt-1 border-t border-line text-[10px] text-ink-300">
            드래그: 노드 이동 · 스크롤: 줌 · 클릭: 상세
          </div>
        </div>

        {/* 노드 수 */}
        <div className="absolute top-3 left-4 text-[11px] text-ink-300">
          {nodes.length}개 노드 · {links.length}개 연결
        </div>
      </div>

      {/* 상세 패널 */}
      {selected && (
        <DetailPanel node={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
