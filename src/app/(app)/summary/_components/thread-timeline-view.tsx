'use client'

import { Fragment, useState, useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { brandColor } from '@/lib/history-service'

// ── Types ─────────────────────────────────────────────────────
type CardStatus = 'ongoing' | 'partial' | 'resolved' | 'abandoned'

interface TimelineRow {
  id: string
  week_start: string
  brand_name: string
  topic: string
  summary: string
  item_count: number
  key_tags: string[]
  max_priority: string | null
  thread_id: string
  parent_thread_ids: string[] | null
}

interface IssueRow {
  id: string
  label: string
  brand: string
  brandColor: string
  status: CardStatus
  indent: boolean
}

interface WeekDef {
  start: string
  label: string
  endLabel: string
  weekName: string
  isNow: boolean
}

interface TimelineCard {
  id: string
  issueId: string
  weekStart: string
  brand: string
  brandColor: string
  relatedCount: number
  dateLabel: string
  title: string
  body: string
  status: CardStatus
}

interface ArrowDef { from: string; to: string }
interface RenderedArrow { d: string; color: string; status: CardStatus; sameRow: boolean }

// ── Status config ─────────────────────────────────────────────
// CSS variables won't resolve in SVG presentation attributes, so use hex fallbacks
const SC: Record<CardStatus, { label: string; color: string; badgeCls: string }> = {
  ongoing:   { label: '미완',      color: '#e53e3e', badgeCls: 'bg-status-late/10 text-status-late border-status-late/30' },
  partial:   { label: '진행 중',   color: '#dd6b20', badgeCls: 'bg-status-warn/10 text-status-warn border-status-warn/30' },
  resolved:  { label: '완료',      color: '#38b2ac', badgeCls: 'bg-mint-100 text-mint-500 border-mint-300' },
  abandoned: { label: '언급 없음', color: '#a0aec0', badgeCls: 'bg-ink-100 text-ink-400 border-ink-200' },
}

// ── Layout constants ──────────────────────────────────────────
const COL_W   = 248
const ROW_H   = 180
const HDR_H   = 56
const LEFT_W  = 220
const RIGHT_W = 80

// ── Helpers ───────────────────────────────────────────────────
function toStatus(priority: string | null): CardStatus {
  if (priority === 'high')   return 'ongoing'
  if (priority === 'medium') return 'partial'
  if (priority === 'low')    return 'resolved'
  return 'abandoned'
}

function weekMeta(dateStr: string) {
  const [, m, d] = dateStr.split('-').map(Number)
  const end = new Date(dateStr + 'T00:00:00')
  end.setDate(end.getDate() + 6)
  const em = end.getMonth() + 1
  const ed = end.getDate()
  const weekNum = Math.ceil(d / 7)
  return { label: `${m}/${d}`, endLabel: `${em}/${ed}`, weekName: `${m}월 ${weekNum}주` }
}

function currentWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x2 - x1) * 0.55
  return `M ${x1},${y1} C ${x1 + cx},${y1} ${x2 - cx},${y2} ${x2},${y2}`
}

// Arch that routes ABOVE the row (for same-row continuation arrows)
function archPath(fromX: number, fromY: number, toX: number, toY: number): string {
  const dy = -Math.max(28, Math.abs(toX - fromX) * 0.1 + 22)
  return `M ${fromX},${fromY} C ${fromX},${fromY + dy} ${toX},${toY + dy} ${toX},${toY}`
}

function deriveData(rows: TimelineRow[]) {
  if (rows.length === 0) return { weeks: [], issues: [], cards: [], arrows: [] }

  const nowWeek   = currentWeekStart()
  const weekStarts = [...new Set(rows.map(r => r.week_start))].sort()

  const weeks: WeekDef[] = weekStarts.map(ws => {
    const { label, endLabel, weekName } = weekMeta(ws)
    return { start: ws, label, endLabel, weekName, isNow: false }
  })
  const nowIdx = weeks.findIndex(w => w.start === nowWeek)
  if (nowIdx >= 0) weeks[nowIdx].isNow = true
  else if (weeks.length > 0) weeks[weeks.length - 1].isNow = true

  // Group by thread_id
  const threadMap = new Map<string, TimelineRow[]>()
  for (const row of rows) {
    if (!threadMap.has(row.thread_id)) threadMap.set(row.thread_id, [])
    threadMap.get(row.thread_id)!.push(row)
  }

  // Issues sorted by first week, then brand
  const issues: IssueRow[] = []
  for (const [threadId, threadRows] of threadMap) {
    const sorted = [...threadRows].sort((a, b) => a.week_start.localeCompare(b.week_start))
    const first = sorted[0]
    const last  = sorted[sorted.length - 1]
    issues.push({
      id: threadId,
      label: `${first.brand_name} — ${first.topic}`,
      brand: first.brand_name,
      brandColor: brandColor(first.brand_name),
      status: toStatus(last.max_priority),
      indent: !!(first.parent_thread_ids?.length),
    })
  }
  issues.sort((a, b) => {
    const af = threadMap.get(a.id)![0]
    const bf = threadMap.get(b.id)![0]
    const wc = af.week_start.localeCompare(bf.week_start)
    return wc !== 0 ? wc : a.brand.localeCompare(b.brand)
  })

  // Cards
  const cards: TimelineCard[] = rows.map(row => ({
    id: `${row.thread_id}-${row.week_start}`,
    issueId: row.thread_id,
    weekStart: row.week_start,
    brand: row.brand_name,
    brandColor: brandColor(row.brand_name),
    relatedCount: row.item_count,
    dateLabel: weekMeta(row.week_start).label,
    title: row.topic,
    body: row.summary,
    status: toStatus(row.max_priority),
  }))

  // Arrows: same thread consecutive weeks
  const arrows: ArrowDef[] = []
  for (const [, threadRows] of threadMap) {
    const sorted = [...threadRows].sort((a, b) => a.week_start.localeCompare(b.week_start))
    for (let i = 0; i < sorted.length - 1; i++) {
      arrows.push({
        from: `${sorted[i].thread_id}-${sorted[i].week_start}`,
        to:   `${sorted[i + 1].thread_id}-${sorted[i + 1].week_start}`,
      })
    }
  }
  // Arrows: parent_thread_ids branch
  for (const row of rows) {
    if (!row.parent_thread_ids?.length) continue
    for (const parentId of row.parent_thread_ids) {
      const parentRows = threadMap.get(parentId)
      if (!parentRows) continue
      const parent = [...parentRows]
        .sort((a, b) => b.week_start.localeCompare(a.week_start))
        .find(p => p.week_start <= row.week_start)
      if (parent) {
        arrows.push({
          from: `${parent.thread_id}-${parent.week_start}`,
          to:   `${row.thread_id}-${row.week_start}`,
        })
      }
    }
  }

  return { weeks, issues, cards, arrows }
}

// ── Sub-components ─────────────────────────────────────────────
function StatusDot({ status, size = 'sm' }: { status: CardStatus; size?: 'sm' | 'md' }) {
  const sz = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2'
  if (status === 'abandoned')
    return <span className={`${sz} rounded-full shrink-0 border border-ink-400`} />
  return <span className={`${sz} rounded-full shrink-0`} style={{ background: SC[status].color }} />
}

function StatusBadge({ status }: { status: CardStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 text-2xs font-medium px-2 py-px rounded-full border ${SC[status].badgeCls}`}>
      <StatusDot status={status} />
      {SC[status].label}
    </span>
  )
}

function CardCell({ card }: { card: TimelineCard }) {
  return (
    <div
      className="flex flex-col rounded-lg bg-card border border-ink-200 overflow-hidden h-full"
      style={{ borderLeftColor: SC[card.status].color, borderLeftWidth: '3px' }}
    >
      <div className="flex items-center justify-between px-3 pt-2.5 mb-1">
        <div className="flex items-center gap-1 text-2xs text-ink-500">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: card.brandColor }} />
          <span className="font-medium">{card.brand}</span>
          <span className="text-ink-300">·</span>
          <span>{card.relatedCount}건</span>
        </div>
        <span className="text-2xs text-ink-400 tabular-nums">{card.dateLabel}</span>
      </div>
      <p className="text-xs font-bold text-foreground leading-snug line-clamp-2 px-3 mb-1">
        {card.title}
      </p>
      <p className="text-2xs text-ink-500 leading-relaxed line-clamp-3 px-3 pb-2.5 flex-1">
        {card.body}
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
interface Props {
  dateFrom?: string
  dateTo?: string
  brandFilter?: string
}

export function ThreadTimelineView({ dateFrom, dateTo, brandFilter }: Props) {
  const [rows,    setRows]    = useState<TimelineRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (dateFrom)    sp.set('from', dateFrom)
    if (dateTo)      sp.set('to', dateTo)
    if (brandFilter) sp.set('brand', brandFilter)
    fetch(`/api/timeline?${sp}`)
      .then(r => r.json())
      .then(({ rows: r }: { rows: TimelineRow[] }) => { setRows(r ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dateFrom, dateTo, brandFilter])

  const { weeks, issues, cards, arrows } = useMemo(() => deriveData(rows), [rows])

  const svgArrows = useMemo<RenderedArrow[]>(() => {
    if (!weeks.length || !issues.length) return []
    const wIdx    = new Map(weeks.map((w, i) => [w.start, i]))
    const rIdx    = new Map(issues.map((iss, i) => [iss.id, i]))
    const cardMap = new Map(cards.map(c => [c.id, c]))

    return arrows.flatMap(arrow => {
      const fromCard = cardMap.get(arrow.from)
      const toCard   = cardMap.get(arrow.to)
      if (!fromCard || !toCard) return []
      const fc = wIdx.get(fromCard.weekStart)
      const tc = wIdx.get(toCard.weekStart)
      const fr = rIdx.get(fromCard.issueId)
      const tr = rIdx.get(toCard.issueId)
      if (fc === undefined || tc === undefined || fr === undefined || tr === undefined) return []
      const sameRow = fr === tr
      // Use column centers for wide, visible arches
      const fromX = LEFT_W + fc * COL_W + COL_W / 2
      const fromY = HDR_H  + fr * ROW_H + (sameRow ? ROW_H * 0.22 : ROW_H / 2)
      const toX   = LEFT_W + tc * COL_W + COL_W / 2
      const toY   = HDR_H  + tr * ROW_H + (sameRow ? ROW_H * 0.22 : ROW_H / 2)
      const d = sameRow ? archPath(fromX, fromY, toX, toY) : bezierPath(fromX, fromY, toX, toY)
      return [{ d, color: SC[fromCard.status].color, status: fromCard.status, sameRow }]
    })
  }, [weeks, issues, cards, arrows])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-ink-400" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-ink-400">이 기간에 타임라인 데이터가 없습니다</p>
      </div>
    )
  }

  const totalW = LEFT_W + weeks.length * COL_W + RIGHT_W
  const totalH = HDR_H + issues.length * ROW_H

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${LEFT_W}px repeat(${weeks.length}, ${COL_W}px) ${RIGHT_W}px`,
    gridTemplateRows:    `${HDR_H}px repeat(${issues.length}, ${ROW_H}px)`,
    minWidth: totalW,
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
    <div style={{ position: 'relative', minWidth: totalW }}>
      <div style={gridStyle}>

        {/* ── Header row ─────────────────────────────────── */}
        <div className="sticky top-0 left-0 z-30 bg-card border-b border-r border-ink-200 flex flex-col justify-end px-3 pb-2.5 gap-1.5">
          <span className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">브랜드 / 이슈</span>
          <div className="flex items-center gap-2.5 flex-wrap">
            {(Object.entries(SC) as [CardStatus, typeof SC[CardStatus]][]).map(([s, cfg]) => (
              <div key={s} className="flex items-center gap-0.5">
                <StatusDot status={s} />
                <span className="text-3xs text-ink-400">{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>

        {weeks.map(week => (
          <div
            key={`hdr-${week.start}`}
            className={`sticky top-0 z-20 border-b border-r border-ink-200 flex flex-col items-start justify-end px-4 pb-2.5 gap-0.5 ${week.isNow ? 'bg-lilac-50' : 'bg-card'}`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold ${week.isNow ? 'text-lilac-600' : 'text-foreground'}`}>
                {week.label}
              </span>
              {week.isNow && (
                <span className="text-3xs bg-lilac-500 text-white px-1.5 py-px rounded-full font-semibold leading-none">
                  NOW
                </span>
              )}
            </div>
            <span className={`text-2xs ${week.isNow ? 'text-lilac-400' : 'text-ink-400'}`}>
              {week.weekName}&nbsp;·&nbsp;~{week.endLabel}
            </span>
          </div>
        ))}

        <div className="sticky top-0 right-0 z-30 bg-card border-b border-l border-ink-200 flex items-end justify-center pb-2.5">
          <span className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">상태</span>
        </div>

        {/* ── Issue rows ─────────────────────────────────── */}
        {issues.map(issue => (
          <Fragment key={issue.id}>
            <div
              className="sticky left-0 z-10 bg-card border-b border-r border-ink-200 flex items-center gap-2"
              style={{ paddingLeft: issue.indent ? 28 : 12, paddingRight: 8 }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: issue.brandColor }} />
              <span className="text-2xs text-foreground font-medium leading-tight line-clamp-3">
                {issue.label}
              </span>
            </div>

            {weeks.map(week => {
              const card = cards.find(c => c.issueId === issue.id && c.weekStart === week.start)
              return (
                <div
                  key={`${issue.id}-${week.start}`}
                  className={`border-b border-r border-ink-200 p-2 ${week.isNow ? 'bg-lilac-50/20' : ''}`}
                >
                  {card && <CardCell card={card} />}
                </div>
              )
            })}

            <div className="sticky right-0 z-10 bg-card border-b border-l border-ink-200 flex items-center justify-center px-2">
              <StatusBadge status={issue.status} />
            </div>
          </Fragment>
        ))}
      </div>

      {/* ── SVG arrow overlay ────────────────────────────── */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: totalW, height: totalH, zIndex: 5, pointerEvents: 'none' }}
      >
        <defs>
          {(Object.keys(SC) as CardStatus[]).map(s => (
            <marker key={s} id={`ah-${s}`} markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
              <path d="M 0,1 L 5,3.5 L 0,6" fill="none" stroke={SC[s].color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          ))}
        </defs>
        {svgArrows.map((a, i) => (
          <path
            key={i}
            d={a.d}
            fill="none"
            style={{ stroke: a.color, strokeWidth: a.sameRow ? 2 : 1.5, strokeOpacity: 0.8 }}
            markerEnd={a.sameRow ? undefined : `url(#ah-${a.status})`}
          />
        ))}
      </svg>
    </div>
    </div>
  )
}
