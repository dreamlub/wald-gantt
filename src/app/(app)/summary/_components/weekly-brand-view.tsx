'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { brandColor } from '@/lib/history-service'

import type { Tag, Priority } from '../_lib/types'
import { TAG_META, TAG_KEYS } from '../_lib/constants'
import { PriorityBars } from './badges'

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

// ── 태그 요약 (헤더용) ────────────────────────────────────────
function TagSummary({ rows }: { rows: WeeklyBrandSummary[] }) {
  const counts: Partial<Record<Tag, number>> = {}
  for (const r of rows) {
    for (const t of r.key_tags ?? []) counts[t as Tag] = (counts[t as Tag] ?? 0) + 1
  }
  const visible = TAG_KEYS.filter(t => (counts[t] ?? 0) > 0)
  if (!visible.length) return null
  return (
    <div className="flex items-center gap-1.5">
      {visible.map(tag => {
        const meta = TAG_META[tag]
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: meta.bg, color: meta.color }}
          >
            {meta.label} {counts[tag]}
          </span>
        )
      })}
    </div>
  )
}

// ── 주간 요약 카드 ────────────────────────────────────────────
function WeekSummaryRow({ row, expanded, onToggle, showBrand }: {
  row: WeeklyBrandSummary
  expanded: boolean
  onToggle: () => void
  showBrand: boolean
}) {
  const color = brandColor(row.brand_name)
  const firstTag = (row.key_tags?.[0] ?? null) as Tag | null
  const tagMeta = firstTag ? TAG_META[firstTag] : null

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
        {showBrand && (
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-sm font-semibold text-foreground">{row.brand_name}</span>
          </span>
        )}
        <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{row.topic}</p>
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
  dateFrom?: string
  dateTo?: string
  onSelectBrand: (id: string) => void
  onCountChange?: (total: number, filtered: number) => void
}

export function WeeklyBrandView({ dateFrom, dateTo, onCountChange }: Props) {
  const [rows, setRows]                   = useState<WeeklyBrandSummary[]>([])
  const [loading, setLoading]             = useState(true)
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [brandQuery, setBrandQuery]       = useState('')
  const [expandedId, setExpandedId]       = useState<string | null>(null)

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
    setRows((data ?? []) as WeeklyBrandSummary[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummaries()
  }, [fetchSummaries])

  const brandList = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.brand_name, (counts.get(r.brand_name) ?? 0) + 1)
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  }, [rows])

  const visibleBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase()
    return q ? brandList.filter(b => b.name.toLowerCase().includes(q)) : brandList
  }, [brandList, brandQuery])

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
    if (selectedBrand) result = result.filter(r => r.brand_name === selectedBrand)
    return result
  }, [rows, selectedBrand, dateFrom, dateTo])

  useEffect(() => {
    onCountChange?.(rows.length, filtered.length)
  }, [rows.length, filtered.length, onCountChange])

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
    <div className="flex-1 min-h-0 flex overflow-hidden bg-background">

      {/* 좌측 브랜드 사이드바 */}
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col min-h-0">
        <div className="h-16 flex items-center px-3 border-b border-border">
          <div className="relative w-full">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            <input
              value={brandQuery}
              onChange={e => setBrandQuery(e.target.value)}
              placeholder="브랜드 검색"
              className="w-full h-8 rounded-md border border-border bg-background pl-7 pr-2 text-sm outline-none focus:border-lilac-300"
            />
          </div>
        </div>
        <div className="px-3 py-2 text-sm font-semibold text-ink-400 uppercase tracking-wider">
          브랜드 {brandList.length}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setSelectedBrand(null)}
            className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
              selectedBrand === null ? 'bg-muted text-foreground' : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 bg-ink-300" />
              <span className="flex-1 truncate text-sm font-semibold">전체</span>
              <span className="text-sm tabular-nums">{rows.length}</span>
            </div>
          </button>
          {visibleBrands.map(brand => {
            const active = selectedBrand === brand.name
            const color = brandColor(brand.name)
            return (
              <button
                key={brand.name}
                onClick={() => setSelectedBrand(prev => prev === brand.name ? null : brand.name)}
                className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                  active ? 'bg-muted text-foreground' : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="flex-1 truncate text-sm font-semibold">{brand.name}</span>
                  <span className="text-sm tabular-nums">{brand.count}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* 우측 메인 */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="shrink-0 h-16 border-b border-border bg-card px-5 flex items-center gap-4">
          {selectedBrand
            ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: brandColor(selectedBrand) }} />
            : <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-ink-300" />
          }
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">{selectedBrand ?? '전체 브랜드'}</h2>
          </div>
          <div className="ml-auto">
            <TagSummary rows={filtered} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                    showBrand={!selectedBrand}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
