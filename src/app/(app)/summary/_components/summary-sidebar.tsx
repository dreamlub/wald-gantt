'use client'

import { useMemo } from 'react'
import { Check, LayoutList } from 'lucide-react'

import type { Tag, HistoryItem, Priority } from '../_lib/types'
import type { ViewKey } from './summary-shell-state'
import { TAG_META, TAG_KEYS, PRIORITY_META, PRIORITY_KEYS } from '../_lib/constants'
import { PriorityBars } from './badges'
import { brandColor } from '@/lib/history-service'
import { GroupTitle, MonthGridSection, DateRangePanel } from './sidebar-date-panels'
import { RawDataSidebarPanel } from './raw-data-sidebar'

export type PriorityKey = 'all' | Priority

// ── 주 유틸 (export — shell에서도 사용) ─────────────────────
export function getMondayOfDate(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getWeekLabel(monday: Date): string {
  const month = monday.getMonth()
  const dow = new Date(monday.getFullYear(), month, 1).getDay()
  const firstMondayDate = 1 + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow)
  const weekNum = Math.floor((monday.getDate() - firstMondayDate) / 7) + 1
  return `${month + 1}월 ${weekNum}주`
}

export function getWeekDateRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${monday.getMonth() + 1}/${monday.getDate()} ~ ${sunday.getMonth() + 1}/${sunday.getDate()}`
}

export function getCurrentWeekStart(): string {
  return dateStr(getMondayOfDate(new Date()))
}

export function isCurrentWeek(weekStart: string): boolean {
  return weekStart === getCurrentWeekStart()
}

// ── Props ────────────────────────────────────────────────────
interface Props {
  view: ViewKey
  history: HistoryItem[]
  dateFrom: string
  dateTo: string
  onDateFromChange: (s: string) => void
  onDateToChange: (s: string) => void
  selectedTags: Set<Tag>
  priorityKey: PriorityKey
  onToggleTag: (t: Tag) => void
  onPriorityChange: (p: PriorityKey) => void
  brandId: string | 'all'
  onBrandChange: (b: string | 'all') => void
  dailyBrands: Set<string>
  dailyTags: Set<Tag>
  dailyPriorities: Set<Priority>
  onToggleDailyBrand: (b: string) => void
  onToggleDailyTag: (t: Tag) => void
  onToggleDailyPriority: (p: Priority) => void
}

export function SummarySidebar({
  view,
  history,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  selectedTags, priorityKey,
  onToggleTag, onPriorityChange,
  brandId, onBrandChange,
  dailyBrands, dailyTags, dailyPriorities,
  onToggleDailyBrand, onToggleDailyTag, onToggleDailyPriority,
}: Props) {
  // hooks는 조건부 return 전에 선언해야 함
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of TAG_KEYS) counts[t] = 0
    for (const h of history) for (const t of h.tags ?? []) counts[t] = (counts[t] ?? 0) + 1
    return counts
  }, [history])

  const priCounts = useMemo(() => {
    const counts: Record<string, number> = { all: history.length }
    for (const p of PRIORITY_KEYS) counts[p] = 0
    for (const h of history) if (h.priority) counts[h.priority] = (counts[h.priority] ?? 0) + 1
    return counts
  }, [history])

  if (view === 'rawdata') {
    return <RawDataSidebarPanel />
  }

  if (view === 'timeline') {
    return (
      <TimelineSidebar
        history={history}
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        brandId={brandId} onBrandChange={onBrandChange}
      />
    )
  }

  if (view === 'dailyreport') {
    return (
      <DailyReportSidebar
        history={history}
        dateFrom={dateFrom}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        dailyBrands={dailyBrands} dailyTags={dailyTags} dailyPriorities={dailyPriorities}
        onToggleDailyBrand={onToggleDailyBrand} onToggleDailyTag={onToggleDailyTag} onToggleDailyPriority={onToggleDailyPriority}
      />
    )
  }

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {view === 'dailylist' || view === 'weeklylist' ? (
        <DateRangePanel
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        />
      ) : (
        <MonthGridSection
          dateFrom={dateFrom} history={history}
          onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        />
      )}

      <div className="mt-3">
        <GroupTitle>태그</GroupTitle>
        {TAG_KEYS.map(t => {
          const meta = TAG_META[t]
          const active = selectedTags.has(t)
          return (
            <button key={t} onClick={() => onToggleTag(t)} className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              {active && <Check size={12} className="shrink-0" />}
              {view !== 'dailylist' && view !== 'weeklylist' && <span className="text-xs text-ink-400">{tagCounts[t] ?? 0}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <GroupTitle>중요도</GroupTitle>
        <button onClick={() => onPriorityChange('all')} className={`sidebar-btn ${priorityKey === 'all' ? 'sidebar-btn-active' : ''}`}>
          <LayoutList size={12} className="shrink-0" />
          <span className="flex-1 truncate text-left">전체</span>
          {view !== 'dailylist' && view !== 'weeklylist' && <span className="text-xs text-ink-400">{priCounts.all}</span>}
        </button>
        {(view === 'dailylist' ? PRIORITY_KEYS : PRIORITY_KEYS.filter(p => (priCounts[p] ?? 0) > 0)).map(p => {
          const meta = PRIORITY_META[p]
          return (
            <button key={p} onClick={() => onPriorityChange(priorityKey === p ? 'all' : p)} className={`sidebar-btn ${priorityKey === p ? 'sidebar-btn-active' : ''}`}>
              <PriorityBars priority={p} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              {view !== 'dailylist' && view !== 'weeklylist' && <span className="text-xs text-ink-400">{priCounts[p]}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Timeline 사이드바 ───────────────────────────────────────
function TimelineSidebar({ history, dateFrom, dateTo, onDateFromChange, onDateToChange, brandId, onBrandChange }: {
  history: HistoryItem[]
  dateFrom: string; dateTo: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  brandId: string | 'all'; onBrandChange: (b: string | 'all') => void
}) {
  const { timelineBrandCounts, timelineTotal } = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const h of history) {
      const ymd = new Date(h.occurred_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
      if (dateFrom && ymd < dateFrom) continue
      if (dateTo && ymd > dateTo) continue
      const b = h.brand_name ?? '미분류'
      counts[b] = (counts[b] ?? 0) + 1
    }
    return {
      timelineBrandCounts: counts,
      timelineTotal: Object.values(counts).reduce((a, b) => a + b, 0),
    }
  }, [history, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <DateRangePanel
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
      />
      <div className="mt-3">
        <GroupTitle>브랜드</GroupTitle>
        <button
          onClick={() => onBrandChange('all')}
          className={`sidebar-btn ${brandId === 'all' ? 'sidebar-btn-active' : ''}`}
        >
          <LayoutList size={12} className="shrink-0" />
          <span className="flex-1 truncate text-left">전체</span>
          {brandId === 'all' && <Check size={12} className="shrink-0" />}
          <span className="text-xs text-ink-400">{timelineTotal}</span>
        </button>
        {Object.entries(timelineBrandCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([name, cnt]) => {
            const active = brandId === name
            return (
              <button
                key={name}
                onClick={() => onBrandChange(active ? 'all' : name)}
                className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: brandColor(name) }} />
                <span className="flex-1 truncate text-left">{name}</span>
                {active && <Check size={12} className="shrink-0" />}
                <span className="text-xs text-ink-400">{cnt}</span>
              </button>
            )
          })}
      </div>
    </div>
  )
}

// ── DailyReport 사이드바 ────────────────────────────────────
function DailyReportSidebar({ history, dateFrom, onDateFromChange, onDateToChange, dailyBrands, dailyTags, dailyPriorities, onToggleDailyBrand, onToggleDailyTag, onToggleDailyPriority }: {
  history: HistoryItem[]
  dateFrom: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  dailyBrands: Set<string>; dailyTags: Set<Tag>; dailyPriorities: Set<Priority>
  onToggleDailyBrand: (b: string) => void; onToggleDailyTag: (t: Tag) => void; onToggleDailyPriority: (p: Priority) => void
}) {
  const selectedDate = dateFrom || dateStr(new Date())

  const dayItems = useMemo(() =>
    history.filter(h =>
      new Date(h.occurred_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) === selectedDate
    ),
    [history, selectedDate]
  )

  const dayTagCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of TAG_KEYS) counts[t] = 0
    for (const h of dayItems) for (const t of h.tags ?? []) counts[t] = (counts[t] ?? 0) + 1
    return counts
  }, [dayItems])

  const topBrands = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const h of dayItems) {
      const b = h.brand_name ?? '미분류'
      counts[b] = (counts[b] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [dayItems])

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <MonthGridSection
        dateFrom={dateFrom} history={history}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
      />

      <div className="mt-3">
        <GroupTitle>전체 {dayItems.length}건</GroupTitle>
        {PRIORITY_KEYS.map(p => {
          const dayPriCount = dayItems.filter(h => h.priority === p).length
          if (dayPriCount === 0) return null
          const meta = PRIORITY_META[p]
          const active = dailyPriorities.has(p)
          return (
            <button key={p} onClick={() => onToggleDailyPriority(p)} className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}>
              <PriorityBars priority={p} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              {active && <Check size={12} className="shrink-0" />}
              <span className="text-xs text-ink-400">{dayPriCount}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <GroupTitle>태그</GroupTitle>
        {TAG_KEYS.map(t => {
          const count = dayTagCounts[t] ?? 0
          if (count === 0) return null
          const meta = TAG_META[t]
          const active = dailyTags.has(t)
          return (
            <button key={t} onClick={() => onToggleDailyTag(t)} className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              {active && <Check size={12} className="shrink-0" />}
              <span className="text-xs text-ink-400">{count}</span>
            </button>
          )
        })}
      </div>

      {topBrands.length > 0 && (
        <div className="mt-3">
          <GroupTitle>브랜드</GroupTitle>
          {topBrands.map(([name, count]) => {
            const active = dailyBrands.has(name)
            const color = brandColor(name)
            return (
              <button
                key={name}
                onClick={() => onToggleDailyBrand(name)}
                className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="flex-1 truncate text-left">{name}</span>
                {active && <Check size={12} className="shrink-0" />}
                <span className="text-xs text-ink-400">{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
