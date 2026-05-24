'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { brandColor } from '@/lib/history-service'

import type { Client } from '../_lib/types'
import type { Tag } from '../_lib/types'
import { TAG_META } from '../_lib/mock-data'

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

interface WeekGroup {
  weekStart: string
  weekLabel: string
  weekRange: string
  brands: WeeklyBrandSummary[]
}

function MarkdownBody({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>
        )
        return <div key={i}>{parts}</div>
      })}
    </div>
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

interface Props {
  clients: Client[]
  dateFrom?: string
  dateTo?: string
  onSelectBrand: (id: string) => void
}

export function TimelineView({ clients, dateFrom, dateTo, onSelectBrand }: Props) {
  const [weeks, setWeeks] = useState<WeekGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [activeBrand, setActiveBrand] = useState<string | null>(null)

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

    if (error) { console.error(error); return }

    const grouped = new Map<string, WeeklyBrandSummary[]>()
    for (const row of (data ?? []) as WeeklyBrandSummary[]) {
      const key = row.week_start
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(row)
    }

    const result: WeekGroup[] = [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, brands]) => ({
        weekStart,
        weekLabel: getWeekLabel(weekStart),
        weekRange: getWeekRange(weekStart),
        brands: brands.sort((a, b) => b.item_count - a.item_count),
      }))

    setWeeks(result)
    if (result.length > 0) {
      setExpandedWeeks(new Set([result[result.length - 1].weekStart]))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSummaries() }, [fetchSummaries])

  const allBrandCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const w of weeks) for (const b of w.brands) {
      counts.set(b.brand_name, (counts.get(b.brand_name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [weeks])

  const filteredWeeks = useMemo(() => {
    let result = weeks
    if (dateFrom || dateTo) {
      result = result.filter(w => {
        const sun = new Date(w.weekStart + 'T00:00:00')
        sun.setDate(sun.getDate() + 6)
        const weekEnd = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
        if (dateFrom && weekEnd < dateFrom) return false
        if (dateTo && w.weekStart > dateTo) return false
        return true
      })
    }
    if (activeBrand) {
      result = result
        .map(w => ({ ...w, brands: w.brands.filter(b => b.brand_name === activeBrand) }))
        .filter(w => w.brands.length > 0)
    }
    return result
  }, [weeks, activeBrand, dateFrom, dateTo])

  function selectBrand(name: string) {
    setActiveBrand(prev => prev === name ? null : name)
  }

  useEffect(() => {
    if (activeBrand) {
      setExpandedWeeks(new Set(filteredWeeks.map(w => w.weekStart)))
    }
  }, [activeBrand, filteredWeeks])

  const toggleWeek = (weekStart: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(weekStart)) next.delete(weekStart)
      else next.add(weekStart)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-ink-400">주간 요약을 불러오는 중...</p>
      </div>
    )
  }

  if (weeks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-ink-400">주간 브랜드 요약이 없습니다. MCP classify 스킬로 생성해주세요.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 브랜드 필터 */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-border bg-card">
        <button
          onClick={() => setActiveBrand(null)}
          className={`text-2xs px-2.5 py-px3 rounded-full border transition-colors ${
            !activeBrand
              ? 'bg-foreground text-white border-foreground'
              : 'bg-card text-muted-foreground border-border hover:border-ink-400'
          }`}
        >
          전체
        </button>
        {allBrandCounts.map(b => {
          const active = activeBrand === b.name
          const color = brandColor(b.name)
          return (
            <button
              key={b.name}
              onClick={() => selectBrand(b.name)}
              className={`inline-flex items-center gap-1.5 text-2xs px-2.5 py-px3 rounded-full border transition-colors ${
                active
                  ? 'text-white border-transparent'
                  : 'bg-card text-muted-foreground border-border hover:border-ink-400'
              }`}
              style={active ? { backgroundColor: color, borderColor: color } : undefined}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'var(--color-white)' : color }} />
              {b.name}
              <span className={`text-3xs ${active ? 'text-white/70' : 'text-ink-400'}`}>{b.count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto">
      <div className="relative max-w-[800px] mx-auto py-8 pl-24 pr-6">
        {/* 세로 라인 */}
        <div className="absolute left-[72px] top-0 bottom-0 w-px bg-border" />

        {filteredWeeks.map((week, wi) => {
          const isExpanded = expandedWeeks.has(week.weekStart)
          const totalItems = week.brands.reduce((s, b) => s + b.item_count, 0)

          return (
            <div key={week.weekStart} className="relative mb-8">
              {/* 주 노드 */}
              <button
                onClick={() => toggleWeek(week.weekStart)}
                className="absolute left-0 w-[144px] flex items-center gap-0 group"
              >
                {/* 원형 노드 */}
                <div className="relative z-10 flex items-center justify-center w-14 h-14 rounded-full bg-foreground text-background shadow-md group-hover:shadow-lg transition-shadow shrink-0"
                  style={{ marginLeft: '44px' }}
                >
                  <div className="text-center leading-tight">
                    <div className="text-2xs font-bold">{week.weekLabel}</div>
                    <div className="text-4xs opacity-60">{week.weekRange}</div>
                  </div>
                </div>
              </button>

              {/* 주 헤더 라인 */}
              <div className="ml-[160px] pt-3">
                <button
                  onClick={() => toggleWeek(week.weekStart)}
                  className="flex items-center gap-2 text-xs text-ink-500 hover:text-foreground transition-colors mb-3"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="font-semibold">{week.brands.length}개 브랜드</span>
                  <span className="text-ink-400">· {totalItems}건</span>
                </button>

                {/* 브랜드 카드 */}
                {isExpanded && (
                  <div className="space-y-2.5">
                    {week.brands.map(brand => {
                      const color = brandColor(brand.brand_name)
                      return (
                        <div
                          key={brand.id}
                          className="bg-card border border-border rounded-lg p-4 hover:border-lilac-300 hover:shadow-sm transition-all"
                        >
                          {/* 브랜드 헤더 */}
                          <div className="flex items-center gap-2 mb-2">
                            <button
                              onClick={() => onSelectBrand(brand.brand_name)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-lilac-600 transition-colors"
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              {brand.brand_name}
                            </button>
                            {brand.topic && (
                              <span className="text-2xs text-ink-400">· {brand.topic}</span>
                            )}
                            <span className="text-3xs text-ink-400">{brand.item_count}건</span>
                            {brand.max_priority === 'high' && (
                              <span className="text-3xs px-1.5 py-0.5 rounded bg-red-50 text-status-late font-medium">긴급</span>
                            )}
                            {/* 태그 */}
                            <div className="ml-auto flex gap-1">
                              {brand.key_tags.map(t => {
                                const meta = TAG_META[t as Tag]
                                if (!meta) return null
                                return (
                                  <span
                                    key={t}
                                    className="text-3xs px-1.5 py-px rounded font-medium"
                                    style={{ background: meta.bg, color: meta.color }}
                                  >
                                    {meta.label}
                                  </span>
                                )
                              })}
                            </div>
                          </div>

                          {/* AI 요약 본문 */}
                          <MarkdownBody
                            text={brand.summary}
                            className="text-xs text-ink-500 leading-[1.7]"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
