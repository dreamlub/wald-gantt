'use client'

import { Check } from 'lucide-react'

import type { Tag, HistoryItem, Priority } from '../_lib/types'
import { TAG_META, TAG_KEYS, PRIORITY_META, PRIORITY_KEYS } from '../_lib/constants'
import { PriorityBars } from './badges'
import { brandColor } from '@/lib/history-service'
import { GroupTitle, MonthGridSection, DateRangePanel } from './sidebar-date-panels'
import { RawDataSidebarPanel } from './raw-data-sidebar'

import type { PriorityKey } from './_sidebar-utils'
import { dateStr } from './_sidebar-utils'

// ── Props ────────────────────────────────────────────────────
interface Props {
  view: 'dailylist' | 'weeklylist' | 'dailyreport' | 'summary' | 'rawdata' | 'timeline' | 'calendar'
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
  const tagCounts: Record<string, number> = {}
  for (const t of TAG_KEYS) tagCounts[t] = 0
  for (const h of history) for (const t of h.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1

  const priCounts: Record<string, number> = { all: history.length }
  for (const p of PRIORITY_KEYS) priCounts[p] = 0
  for (const h of history) if (h.priority) priCounts[h.priority] = (priCounts[h.priority] ?? 0) + 1

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
              {view !== 'dailylist' && view !== 'weeklylist' && <span className="text-sm text-ink-400">{tagCounts[t] ?? 0}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <GroupTitle>중요도</GroupTitle>
        <button onClick={() => onPriorityChange('all')} className={`sidebar-btn ${priorityKey === 'all' ? 'sidebar-btn-active' : ''}`}>
          <span className="inline-flex items-end gap-[1px] shrink-0">
            {[5, 7, 9].map((h, i) => (
              <span key={i} className="w-0.5 rounded-sm bg-ink-300" style={{ height: `${h}px` }} />
            ))}
          </span>
          <span className="flex-1 truncate text-left">전체</span>
          {view !== 'dailylist' && view !== 'weeklylist' && <span className="text-sm text-ink-400">{priCounts.all}</span>}
        </button>
        {(view === 'dailylist' ? PRIORITY_KEYS : PRIORITY_KEYS.filter(p => (priCounts[p] ?? 0) > 0)).map(p => {
          const meta = PRIORITY_META[p]
          return (
            <button key={p} onClick={() => onPriorityChange(priorityKey === p ? 'all' : p)} className={`sidebar-btn ${priorityKey === p ? 'sidebar-btn-active' : ''}`}>
              <PriorityBars priority={p} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              {view !== 'dailylist' && view !== 'weeklylist' && <span className="text-sm text-ink-400">{priCounts[p]}</span>}
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
  const timelineBrandCounts: Record<string, number> = {}
  for (const h of history) {
    const ymd = new Date(h.occurred_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
    if (dateFrom && ymd < dateFrom) continue
    if (dateTo && ymd > dateTo) continue
    const b = h.brand_name ?? '미분류'
    timelineBrandCounts[b] = (timelineBrandCounts[b] ?? 0) + 1
  }
  const timelineTotal = Object.values(timelineBrandCounts).reduce((a, b) => a + b, 0)

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
          <span className="w-2 h-2 rounded-full shrink-0 bg-ink-300" />
          <span className="flex-1 truncate text-left">전체</span>
          {brandId === 'all' && <Check size={12} className="shrink-0" />}
          <span className="text-sm text-ink-400">{timelineTotal}</span>
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
                <span className="text-sm text-ink-400">{cnt}</span>
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
  const dayItems = history.filter(h =>
    new Date(h.occurred_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) === selectedDate
  )
  const dayTagCounts: Record<string, number> = {}
  for (const t of TAG_KEYS) dayTagCounts[t] = 0
  for (const h of dayItems) for (const t of h.tags ?? []) dayTagCounts[t] = (dayTagCounts[t] ?? 0) + 1

  const brandCounts: Record<string, number> = {}
  for (const h of dayItems) {
    const b = h.brand_name ?? '미분류'
    brandCounts[b] = (brandCounts[b] ?? 0) + 1
  }
  const topBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)

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
              <span className="text-sm text-ink-400">{dayPriCount}</span>
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
              <span className="text-sm text-ink-400">{count}</span>
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
                <span className="text-sm text-ink-400">{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
