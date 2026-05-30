'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { brandColor } from '@/lib/history-service'

import type { Tag, Priority } from '../_lib/types'
import { TAG_META } from '../_lib/constants'
import { PriorityBars } from './badges'

type PriorityKey = 'all' | Priority

interface WeeklyBrandSummary {
  id: string
  week_start: string
  brand_name: string
  topic: string
  summary: string
  item_count: number
  key_tags: string[]
  max_priority: string | null
}

// ── 인라인 마크다운 렌더 ──────────────────────────────────────
function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : <span key={j}>{part.replace(/\*/g, '')}</span>
  )
}

function MarkdownBody({ text, className }: { text: string; className?: string }) {
  const sentences = text
    .split('\n')
    .map(l => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .flatMap(line => line.split(/(?<=[.!?])\s+/).filter(Boolean))
  return (
    <ul className={`flex flex-col gap-1 ${className ?? ''}`}>
      {sentences.map((s, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="mt-[5px] w-1 h-1 rounded-full bg-ink-300 shrink-0" />
          <span>{renderInline(s)}</span>
        </li>
      ))}
    </ul>
  )
}

// ── 날짜 헬퍼 ─────────────────────────────────────────────────
function getWeekLabel(mondayStr: string): string {
  const d = new Date(mondayStr + 'T00:00:00')
  const month = d.getMonth()
  const dow = new Date(d.getFullYear(), month, 1).getDay()
  const firstMondayDate = 1 + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow)
  const weekNum = Math.floor((d.getDate() - firstMondayDate) / 7) + 1
  return `${month + 1}월 ${weekNum}주`
}

function getWeekRange(mondayStr: string): string {
  const mon = new Date(mondayStr + 'T00:00:00')
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(mon)} ~ ${fmt(sun)}`
}

function groupByWeek(rows: WeeklyBrandSummary[]) {
  const map = new Map<string, WeeklyBrandSummary[]>()
  for (const r of rows) {
    const g = map.get(r.week_start)
    if (g) g.push(r)
    else map.set(r.week_start, [r])
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([week_start, items]) => ({ week_start, items }))
}

// ── 행 컴포넌트 ───────────────────────────────────────────────
function WeekSummaryRow({ row, expanded, onToggle }: {
  row:      WeeklyBrandSummary
  expanded: boolean
  onToggle: () => void
}) {
  const color    = brandColor(row.brand_name)
  const firstTag = (row.key_tags?.[0] ?? null) as Tag | null
  const tagMeta  = firstTag ? TAG_META[firstTag] : null

  return (
    <div
      onClick={onToggle}
      className={`group border border-border bg-card cursor-pointer transition-colors hover:border-ink-300 hover:bg-muted/30 ${
        expanded ? 'rounded-md shadow-sm' : 'rounded-sm'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 min-h-9">
        <span className="w-3.5 flex justify-center shrink-0">
          {row.max_priority
            ? <PriorityBars priority={row.max_priority as Priority} />
            : <span className="w-1 h-1 rounded-full bg-ink-300" />
          }
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-sm font-semibold text-foreground">{row.brand_name}</span>
        </span>
        <p className="flex-1 min-w-0 text-sm text-ink-600 truncate">{row.topic}</p>
        {tagMeta && (
          <span
            className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: tagMeta.bg, color: tagMeta.color }}
          >
            {tagMeta.label}
          </span>
        )}
        <span className="shrink-0 text-sm text-ink-400">{row.item_count}건</span>
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-3">
          <MarkdownBody text={row.summary} className="text-sm text-ink-500 leading-relaxed" />
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
interface Props {
  dateFrom?:        string
  dateTo?:          string
  brandFilter?:     string
  onSelectBrand:    (id: string) => void
  onCountChange?:   (total: number, filtered: number) => void
  onBrandsLoaded?:  (counts: Record<string, number>) => void
  selectedTags?:    Set<Tag>
  priorityKey?:     PriorityKey
}

export function WeeklyBrandView({ dateFrom, dateTo, brandFilter, onCountChange, onBrandsLoaded, selectedTags, priorityKey }: Props) {
  const [rows, setRows]             = useState<WeeklyBrandSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchSummaries = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return

    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!member) return

    const { data, error } = await sb
      .from('weekly_brand_summaries')
      .select('*')
      .eq('workspace_id', member.workspace_id)
      .order('week_start', { ascending: false })
      .limit(10000)

    if (error) return
    const loaded = (data ?? []) as WeeklyBrandSummary[]
    setRows(loaded)
    setLoading(false)
  }, [])

  useEffect(() => { fetchSummaries() }, [fetchSummaries])

  const filtered = useMemo(() => {
    let result = rows
    if (dateFrom || dateTo) {
      result = result.filter(r => {
        const sun = new Date(r.week_start + 'T00:00:00')
        sun.setDate(sun.getDate() + 6)
        const weekEnd = sun.toISOString().split('T')[0]
        if (dateFrom && weekEnd < dateFrom) return false
        if (dateTo && r.week_start > dateTo) return false
        return true
      })
    }
    if (brandFilter) result = result.filter(r => r.brand_name === brandFilter)
    if (selectedTags && selectedTags.size > 0)
      result = result.filter(r => r.key_tags?.some(t => selectedTags.has(t as Tag)))
    if (priorityKey && priorityKey !== 'all')
      result = result.filter(r => r.max_priority === priorityKey)
    return result
  }, [rows, brandFilter, dateFrom, dateTo, selectedTags, priorityKey])

  useEffect(() => {
    onCountChange?.(rows.length, filtered.length)
  }, [rows.length, filtered.length, onCountChange])

  useEffect(() => {
    if (!onBrandsLoaded) return
    const counts: Record<string, number> = {}
    for (const r of filtered) counts[r.brand_name] = (counts[r.brand_name] ?? 0) + 1
    onBrandsLoaded(counts)
  }, [filtered, onBrandsLoaded])

  const weekGroups = useMemo(() => groupByWeek(filtered), [filtered])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-ink-400">주간 요약을 불러오는 중...</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-ink-400">주간 브랜드 요약이 없습니다. MCP classify 스킬로 생성해주세요.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {weekGroups.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">해당 기간에 데이터가 없습니다</p>
        </div>
      ) : weekGroups.map(group => (
        <section key={group.week_start} className="space-y-2">
          <div className="flex items-center gap-2 pb-1 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">{getWeekLabel(group.week_start)}</h3>
            <span className="text-sm text-ink-400">{getWeekRange(group.week_start)}</span>
            <span className="text-sm text-ink-400">{group.items.length}건</span>
          </div>
          <div className="space-y-1.5">
            {group.items.map(row => (
              <WeekSummaryRow
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
