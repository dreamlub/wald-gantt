'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Loader2, X } from 'lucide-react'
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

type NodeStatus = 'active' | 'quiet' | 'dormant' | 'closed'

interface TreeItem {
  id: string
  title: string
  nodeType: 'cluster' | 'child' | 'standalone' | 'project' | 'decision' | 'root'
  status: NodeStatus
  body: string
  action: string
  last_seen: string
  children?: TreeItem[]
}

// ── Helpers ───────────────────────────────────────────────
const NODE_W  = 220
const NODE_H  = 70
const GAP_X   = 120
const GAP_Y   = 20

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

function issueStatus(row: IssueRow | TreeItem): NodeStatus {
  if (row.status === 'closed') return 'closed'
  const n = daysSince(row.last_seen)
  if (n <= 7)  return 'active'
  if (n <= 30) return 'quiet'
  return 'dormant'
}

const STATUS_COLOR: Record<NodeStatus, string> = {
  active:  '#ef4444',
  quiet:   '#f97316',
  dormant: '#9ca3af',
  closed:  '#10b981',
}
const STATUS_BG: Record<NodeStatus, string> = {
  active:  '#fef2f2',
  quiet:   '#fff7ed',
  dormant: '#f9fafb',
  closed:  '#f0fdf4',
}
const STATUS_BADGE_BG: Record<NodeStatus, string> = {
  active:  '#fee2e2',
  quiet:   '#ffedd5',
  dormant: '#f3f4f6',
  closed:  '#d1fae5',
}
const STATUS_LABEL: Record<NodeStatus, string> = {
  active:  '활성',
  quiet:   '조용함',
  dormant: '소멸',
  closed:  '완료',
}
const TYPE_BG: Record<string, string> = {
  cluster:    '',   // uses status
  child:      '',
  standalone: '',
  project:    '#eff6ff',
  decision:   '#f5f3ff',
  root:       'transparent',
}
const TYPE_BORDER: Record<string, string> = {
  cluster:    '',
  child:      '',
  standalone: '',
  project:    '#bfdbfe',
  decision:   '#ddd6fe',
  root:       'transparent',
}

// ── D3 렌더링 ─────────────────────────────────────────────
function renderTree(
  svgEl: SVGSVGElement,
  root: TreeItem,
  onSelect: (item: TreeItem | null) => void,
) {
  const svg  = d3.select(svgEl)
  const { width, height } = svgEl.getBoundingClientRect()

  svg.selectAll('*').remove()

  // 줌/패닝
  const g = svg.append('g')
  svg.call(
    d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 2])
      .on('zoom', ({ transform }) => g.attr('transform', transform.toString()))
  )

  // D3 hierarchy + tree layout (좌→우)
  const hier = d3.hierarchy<TreeItem>(root)
  const treeLayout = d3.tree<TreeItem>()
    .nodeSize([NODE_H + GAP_Y, NODE_W + GAP_X])
    .separation((a, b) => {
      // 같은 부모면 1.2, 다른 부모면 2
      return a.parent === b.parent ? 1.3 : 2
    })

  treeLayout(hier)

  // 루트 노드를 숨기고 실제 노드들만 표시
  const allNodes = hier.descendants().filter(d => d.data.nodeType !== 'root')
  const allLinks = hier.links().filter(l => l.source.data.nodeType !== 'root')

  // 뷰포트 중앙 배치
  const xVals = allNodes.map(d => d.y ?? 0)
  const yVals = allNodes.map(d => d.x ?? 0)
  const minX  = Math.min(...xVals) - NODE_W / 2 - 40
  const minY  = Math.min(...yVals) - NODE_H / 2 - 40
  const maxX  = Math.max(...xVals) + NODE_W / 2 + 40
  const maxY  = Math.max(...yVals) + NODE_H / 2 + 40
  const treeW = maxX - minX
  const treeH = maxY - minY
  const tx    = Math.max(20, (width  - treeW) / 2) - minX
  const ty    = Math.max(20, (height - treeH) / 2) - minY
  g.attr('transform', `translate(${tx},${ty})`)

  // 엣지 (수평 베지어)
  g.append('g').selectAll('path')
    .data(allLinks)
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', d => {
      const st = issueStatus(d.source.data)
      return STATUS_COLOR[st] + '60'
    })
    .attr('stroke-width', 1.5)
    .attr('d', d => {
      const sx = d.source.y ?? 0, sy = d.source.x ?? 0
      const tx = d.target.y ?? 0, ty = d.target.x ?? 0
      const mx = (sx + tx) / 2
      return `M${sx + NODE_W / 2},${sy} C${mx},${sy} ${mx},${ty} ${tx - NODE_W / 2},${ty}`
    })

  // 노드 (foreignObject)
  const nodes = g.append('g').selectAll('g.node')
    .data(allNodes)
    .join('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${(d.y ?? 0) - NODE_W / 2},${(d.x ?? 0) - NODE_H / 2})`)
    .style('cursor', 'pointer')
    .on('click', (e, d) => {
      e.stopPropagation()
      onSelect(d.data)
    })

  nodes.append('foreignObject')
    .attr('width', NODE_W)
    .attr('height', NODE_H)
    .append('xhtml:div')
    .style('width', `${NODE_W}px`)
    .style('height', `${NODE_H}px`)
    .style('box-sizing', 'border-box')
    .style('border-radius', '10px')
    .style('border', d => {
      const st  = issueStatus(d.data)
      const isCluster = d.data.nodeType === 'cluster'
      const bc  = d.data.nodeType === 'project' ? '#bfdbfe'
                : d.data.nodeType === 'decision' ? '#ddd6fe'
                : STATUS_COLOR[st]
      return `1.5px solid ${bc}${isCluster ? '' : '80'}`
    })
    .style('border-left', d => {
      const st = issueStatus(d.data)
      if (d.data.nodeType === 'project') return '4px solid #60a5fa'
      if (d.data.nodeType === 'decision') return '4px solid #a78bfa'
      return `4px solid ${STATUS_COLOR[st]}`
    })
    .style('background', d => {
      const st = issueStatus(d.data)
      if (d.data.nodeType === 'project')  return '#eff6ff'
      if (d.data.nodeType === 'decision') return '#f5f3ff'
      return STATUS_BG[st]
    })
    .style('padding', '8px 10px')
    .style('display', 'flex')
    .style('flex-direction', 'column')
    .style('justify-content', 'space-between')
    .style('overflow', 'hidden')
    .style('box-shadow', '0 1px 4px rgba(0,0,0,0.06)')
    .html(d => {
      const st      = issueStatus(d.data)
      const color   = d.data.nodeType === 'project'  ? '#3b82f6'
                    : d.data.nodeType === 'decision' ? '#8b5cf6'
                    : STATUS_COLOR[st]
      const badgeBg = d.data.nodeType === 'project'  ? '#dbeafe'
                    : d.data.nodeType === 'decision' ? '#ede9fe'
                    : STATUS_BADGE_BG[st]
      const label   = d.data.nodeType === 'project'  ? '프로젝트'
                    : d.data.nodeType === 'decision' ? '결정'
                    : STATUS_LABEL[st]
      const isCluster = d.data.nodeType === 'cluster'
      const age = ageTxt(d.data.last_seen)

      return `
        <div style="display:flex;align-items:flex-start;gap:6px;flex:1;min-height:0">
          <div style="font-size:${isCluster ? 12 : 11}px;font-weight:${isCluster ? 700 : 600};
                      color:#111827;line-height:1.35;flex:1;overflow:hidden;
                      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">
            ${d.data.title}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:4px">
          <span style="font-size:10px;font-weight:600;color:${color};
                       background:${badgeBg};padding:1px 6px;border-radius:999px">
            ${label}
          </span>
          <span style="font-size:10px;color:${color};font-weight:500;margin-left:auto">
            ${age}
          </span>
        </div>
      `
    })

  // 배경 클릭으로 선택 해제
  svg.on('click', () => onSelect(null))
}

// ── Detail Panel ──────────────────────────────────────────
function DetailPanel({ item, onClose }: { item: TreeItem; onClose: () => void }) {
  const st = issueStatus(item)
  return (
    <div className="w-72 shrink-0 border-l bg-card flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <span className="text-[12px] font-semibold text-ink flex-1 leading-snug">{item.title}</span>
        <button onClick={onClose}><X size={14} className="text-ink-300 hover:text-ink" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[st] }} />
          <span style={{ color: STATUS_COLOR[st], fontWeight: 600, fontSize: 11 }}>
            {STATUS_LABEL[st]}
          </span>
          <span className="text-ink-300 text-[11px] ml-auto">{ageTxt(item.last_seen)}</span>
        </div>
        {item.body && (
          <div>
            <p className="text-[11px] font-bold text-ink-400 mb-1 uppercase tracking-wide">경과</p>
            <p className="text-ink-500 leading-relaxed text-[12px]">{item.body}</p>
          </div>
        )}
        {item.action && (
          <div className="border border-red-200 bg-red-50 rounded-lg px-3 py-2">
            <p className="text-[11px] font-bold text-red-400 mb-1">필요한 조치</p>
            <p className="text-red-600 text-[12px] leading-snug">{item.action}</p>
          </div>
        )}
        <p className="text-[11px] text-ink-300">마지막: {item.last_seen.slice(0, 10)}</p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────
interface Props { brandFilter?: string }

export function IssueLogicTree({ brandFilter }: Props) {
  const svgRef    = useRef<SVGSVGElement>(null)
  const [issues,  setIssues]   = useState<IssueRow[]>([])
  const [loading, setLoading]  = useState(true)
  const [selected, setSelected] = useState<TreeItem | null>(null)

  useEffect(() => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (brandFilter) sp.set('brand', brandFilter)
    fetch(`/api/issues?${sp}`)
      .then(r => r.json())
      .then(({ issues: rows }: { issues: IssueRow[] }) => { setIssues(rows ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [brandFilter])

  useEffect(() => {
    if (loading || !issues.length || !svgRef.current) return

    // 트리 데이터 빌드
    type NS = NodeStatus
    const RANK: Record<NS, number> = { active: 0, quiet: 1, dormant: 2, closed: 3 }

    const issueRows   = issues.filter(r => r.type === 'issue')
    const projectRows = issues.filter(r => r.type === 'project')
    const decisionRows = issues.filter(r => r.type === 'decision')

    const parentIds = new Set(issueRows.filter(r => r.parent_issue_id).map(r => r.parent_issue_id!))
    const childMap  = issueRows.filter(r => r.parent_issue_id).reduce<Record<string, IssueRow[]>>((acc, r) => {
      const pid = r.parent_issue_id!
      if (!acc[pid]) acc[pid] = []
      acc[pid].push(r)
      return acc
    }, {})

    const toItem = (r: IssueRow, nt: TreeItem['nodeType']): TreeItem => ({
      id: r.id, title: r.title, nodeType: nt,
      status: issueStatus(r), body: r.body, action: r.action, last_seen: r.last_seen,
    })

    const clusters: TreeItem[] = issueRows
      .filter(r => parentIds.has(r.id))
      .map(r => ({
        ...toItem(r, 'cluster'),
        children: (childMap[r.id] ?? [])
          .sort((a, b) => RANK[issueStatus(a)] - RANK[issueStatus(b)])
          .map(c => toItem(c, 'child')),
      }))
      .sort((a, b) => RANK[a.status] - RANK[b.status])

    const standalones = issueRows
      .filter(r => !r.parent_issue_id && !parentIds.has(r.id))
      .sort((a, b) => RANK[issueStatus(a)] - RANK[issueStatus(b)])
      .map(r => toItem(r, 'standalone'))

    const projects  = projectRows.sort((a, b) =>
      (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)
    ).map(r => toItem(r, 'project'))

    const decisions = decisionRows.map(r => toItem(r, 'decision'))

    const root: TreeItem = {
      id: '__root__', title: '', nodeType: 'root',
      status: 'active', body: '', action: '', last_seen: '',
      children: [...clusters, ...standalones, ...projects, ...decisions],
    }

    renderTree(svgRef.current, root, setSelected)
  }, [issues, loading])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-ink-300" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-muted/10">
      <svg
        ref={svgRef}
        className="flex-1 h-full cursor-grab active:cursor-grabbing"
      />
      {selected && (
        <DetailPanel item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
