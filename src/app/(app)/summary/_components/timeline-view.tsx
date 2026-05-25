'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { brandColor } from '@/lib/history-service'

import type { Tag, Priority } from '../_lib/types'
import { PriorityBars, TagList } from './badges'

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
      {sentences.map((sentence, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="mt-[5px] w-1 h-1 rounded-full bg-ink-300 shrink-0" />
          <span>{renderInline(sentence)}</span>
        </li>
      ))}
    </ul>
  )
}

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
  return `${format(mon, 'M/d')} ~ ${format(sun, 'M/d')}`
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

interface Props {
  dateFrom?: string
  dateTo?: string
  onSelectBrand: (id: string) => void
  onCountChange?: (total: number, filtered: number) => void
}

export function TimelineView({ dateFrom, dateTo, onSelectBrand, onCountChange }: Props) {
  const [rows, setRows]               = useState<WeeklyBrandSummary[]>([])
  const [loading, setLoading]         = useState(true)
  const [activeBrand, setActiveBrand] = useState<string | null>(null)
  const [brandQuery, setBrandQuery]   = useState('')
  const [expandedId, setExpandedId]   = useState<string | null | undefined>(undefined)

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

  const dateFiltered = useMemo(() => {
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

    return result
  }, [rows, dateFrom, dateTo])

  const allBrandCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of dateFiltered) counts.set(r.brand_name, (counts.get(r.brand_name) ?? 0) + r.item_count)
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  }, [dateFiltered])

  const visibleBrands = useMemo(() => {
    const query = brandQuery.trim().toLowerCase()
    if (!query) return allBrandCounts
    return allBrandCounts.filter(brand => brand.name.toLowerCase().includes(query))
  }, [allBrandCounts, brandQuery])

  const selectedBrand = activeBrand ?? allBrandCounts[0]?.name ?? null

  const filtered = useMemo(() => {
    const result = selectedBrand
      ? dateFiltered.filter(r => r.brand_name === selectedBrand)
      : dateFiltered

    return [...result].sort((a, b) => {
      const weekCmp = b.week_start.localeCompare(a.week_start)
      if (weekCmp !== 0) return weekCmp
      return (PRIORITY_ORDER[a.max_priority ?? ''] ?? 3) - (PRIORITY_ORDER[b.max_priority ?? ''] ?? 3)
    })
  }, [dateFiltered, selectedBrand])

  const weekGroups = useMemo(() => {
    const map = new Map<string, WeeklyBrandSummary[]>()
    for (const row of filtered) {
      const group = map.get(row.week_start)
      if (group) group.push(row)
      else map.set(row.week_start, [row])
    }
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekStart, groupRows]) => ({ weekStart, rows: groupRows }))
  }, [filtered])

  const firstRowId = filtered[0]?.id ?? null
  const expandedRowId = expandedId === undefined
    ? firstRowId
    : expandedId && filtered.some(row => row.id === expandedId)
      ? expandedId
      : expandedId

  useEffect(() => {
    onCountChange?.(rows.length, filtered.length)
  }, [rows.length, filtered.length, onCountChange])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-ink-400">주간 요약을 불러오는 중...</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-ink-400">주간 브랜드 요약이 없습니다. MCP classify 스킬로 생성해주세요.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden bg-background">
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col min-h-0">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            <input
              value={brandQuery}
              onChange={event => setBrandQuery(event.target.value)}
              placeholder="브랜드 검색"
              className="w-full h-8 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-lilac-300"
            />
          </div>
        </div>
        <div className="px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider">브랜드 {allBrandCounts.length}</div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleBrands.map(brand => {
            const active = selectedBrand === brand.name
            const color = brandColor(brand.name)
            return (
              <button
                key={brand.name}
                onClick={() => { setActiveBrand(brand.name); onSelectBrand(brand.name) }}
                className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                  active ? 'bg-muted text-foreground' : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="flex-1 truncate text-xs font-semibold">{brand.name}</span>
                  <span className="text-2xs tabular-nums">{brand.count}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="shrink-0 h-11 border-b border-border bg-card px-5 flex items-center gap-3">
          {selectedBrand && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(selectedBrand) }} />}
          <h2 className="text-sm font-bold text-foreground truncate">{selectedBrand ?? '전체 브랜드'}</h2>
          <span className="text-xs text-ink-400 shrink-0">
            {filtered.reduce((sum, row) => sum + row.item_count, 0)}건
          </span>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {weekGroups.map(group => (
            <section key={group.weekStart} className="space-y-2">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">{getWeekLabel(group.weekStart)}</h3>
                <span className="text-xs text-ink-400">{getWeekRange(group.weekStart)}</span>
                <span className="text-xs text-ink-400">{group.rows.reduce((sum, row) => sum + row.item_count, 0)}건</span>
              </div>
              <div className="space-y-1.5">
                {group.rows.map(row => {
                  const expanded = expandedRowId === row.id
                  return (
                    <div
                      key={row.id}
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      className={`group border border-border bg-card cursor-pointer transition-colors hover:border-ink-300 hover:bg-muted/30 ${
                        expanded ? 'rounded-md shadow-sm' : 'rounded-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 min-h-9">
                        <span className="w-3.5 flex justify-center shrink-0">
                          <PriorityBars priority={row.max_priority as Priority | null} />
                        </span>
                        <p className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">{row.topic}</p>
                        <div className="shrink-0 flex items-center gap-1">
                          <TagList tags={row.key_tags as Tag[]} />
                          <span className="text-3xs px-1.5 py-0.5 rounded bg-muted text-ink-500 font-semibold">
                            {row.item_count}건
                          </span>
                        </div>
                      </div>
                      {expanded && (
                        <div className="border-t border-border px-5 py-3">
                          <MarkdownBody text={row.summary} className="text-2xs text-ink-500 leading-relaxed" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <p className="py-16 text-center text-xs text-ink-300">해당 조건의 위클리 요약이 없습니다.</p>
          )}
        </div>
      </main>
    </div>
  )
}
