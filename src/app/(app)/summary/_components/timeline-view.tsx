'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
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

type SortKey = 'week' | 'brand' | 'count' | 'priority'
type SortDir = 'asc' | 'desc'

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown size={9} className="text-ink-300" />
  return dir === 'desc' ? <ChevronDown size={9} /> : <ChevronUp size={9} />
}

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
  const [sortKey, setSortKey]         = useState<SortKey>('week')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')

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

  const allBrandCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.brand_name, (counts.get(r.brand_name) ?? 0) + 1)
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [rows])

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

    if (activeBrand) result = result.filter(r => r.brand_name === activeBrand)

    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'week')          cmp = a.week_start.localeCompare(b.week_start)
      else if (sortKey === 'brand')    cmp = a.brand_name.localeCompare(b.brand_name)
      else if (sortKey === 'count')    cmp = a.item_count - b.item_count
      else if (sortKey === 'priority') cmp = (PRIORITY_ORDER[a.max_priority ?? ''] ?? 3) - (PRIORITY_ORDER[b.max_priority ?? ''] ?? 3)
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [rows, activeBrand, dateFrom, dateTo, sortKey, sortDir])

  useEffect(() => {
    onCountChange?.(rows.length, filtered.length)
  }, [rows.length, filtered.length, onCountChange])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 브랜드 필터 칩 */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-border bg-card">
        <button
          onClick={() => setActiveBrand(null)}
          className={`text-2xs px-2.5 py-[3px] rounded-full border transition-colors ${
            !activeBrand
              ? 'bg-foreground text-white border-foreground'
              : 'bg-card text-muted-foreground border-border hover:border-ink-400'
          }`}
        >
          전체 {rows.length}
        </button>
        {allBrandCounts.map(b => {
          const active = activeBrand === b.name
          const color = brandColor(b.name)
          return (
            <button
              key={b.name}
              onClick={() => setActiveBrand(prev => prev === b.name ? null : b.name)}
              className={`inline-flex items-center gap-1.5 text-2xs px-2.5 py-[3px] rounded-full border transition-colors ${
                active
                  ? 'text-white border-transparent'
                  : 'bg-card text-muted-foreground border-border hover:border-ink-400'
              }`}
              style={active ? { backgroundColor: color, borderColor: color } : undefined}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'white' : color }} />
              {b.name}
              <span className={`text-3xs ${active ? 'text-white/70' : 'text-ink-400'}`}>{b.count}</span>
            </button>
          )
        })}
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted border-b border-ink-150">
            <tr>
              <th
                className="text-left px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                onClick={() => toggleSort('week')}
              >
                <span className="flex items-center gap-1">주차 <SortIcon active={sortKey === 'week'} dir={sortDir} /></span>
              </th>
              <th
                className="text-left px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                onClick={() => toggleSort('brand')}
              >
                <span className="flex items-center gap-1">브랜드 <SortIcon active={sortKey === 'brand'} dir={sortDir} /></span>
              </th>
              <th className="text-left px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-[180px]">주제</th>
              <th className="text-left px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider min-w-[240px]">요약</th>
              <th className="text-left px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider">태그</th>
              <th
                className="text-center px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                onClick={() => toggleSort('priority')}
              >
                <span className="flex items-center justify-center gap-1">중요도 <SortIcon active={sortKey === 'priority'} dir={sortDir} /></span>
              </th>
              <th
                className="text-right px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                onClick={() => toggleSort('count')}
              >
                <span className="flex items-center justify-end gap-1">건수 <SortIcon active={sortKey === 'count'} dir={sortDir} /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => {
              const color = brandColor(row.brand_name)
              return (
                <tr key={row.id} className="border-t border-border hover:bg-muted/40 transition-colors align-top">
                  {/* 주차 */}
                  <td className="px-5 py-2 whitespace-nowrap tabular-nums">
                    <div className="text-xs font-medium text-foreground">{getWeekLabel(row.week_start)}</div>
                    <div className="text-3xs text-ink-400 mt-0.5">{getWeekRange(row.week_start)}</div>
                  </td>

                  {/* 브랜드 */}
                  <td className="px-5 py-2 whitespace-nowrap">
                    <button
                      onClick={() => onSelectBrand(row.brand_name)}
                      className="inline-flex items-center gap-1.5 text-xs text-ink-700 hover:text-foreground transition-colors"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="truncate max-w-[100px]">{row.brand_name}</span>
                    </button>
                  </td>

                  {/* 주제 */}
                  <td className="px-5 py-2">
                    <p className="text-xs font-medium text-foreground leading-snug">{row.topic}</p>
                  </td>

                  {/* 요약 */}
                  <td className="px-5 py-2">
                    <MarkdownBody
                      text={row.summary}
                      className="text-xs text-ink-400 leading-[1.6]"
                    />
                  </td>

                  {/* 태그 */}
                  <td className="px-5 py-2">
                    <TagList tags={row.key_tags as Tag[]} />
                  </td>

                  {/* 중요도 */}
                  <td className="px-5 py-2 text-center">
                    <PriorityBars priority={row.max_priority as Priority | null} />
                  </td>

                  {/* 건수 */}
                  <td className="px-5 py-2 text-right text-xs font-medium text-ink-500 whitespace-nowrap tabular-nums">
                    {row.item_count}건
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted border-t border-ink-150">
            <tr>
              <td colSpan={7} className="px-5 py-2 text-right text-3xs text-ink-400 tabular-nums">
                {filtered.length === 0
                  ? <span className="text-ink-300">해당 조건의 위클리 요약이 없습니다.</span>
                  : <>
                      전체 <b className="text-foreground font-semibold">{rows.length}</b>건 중{' '}
                      <b className="text-foreground font-semibold">{filtered.length}</b>건
                    </>
                }
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
