'use client'

import { useState, useMemo, useEffect } from 'react'
import { Check, Search } from 'lucide-react'

import type { Tag, HistoryItem, Priority } from '../_lib/types'
import { TAG_META, TAG_KEYS, PRIORITY_META, PRIORITY_KEYS } from '../_lib/constants'
import { PriorityBars } from './badges'
import { brandColor } from '@/lib/history-service'
import { kstDate } from '@/lib/kst'
import { GroupTitle, MonthGridSection, DateRangePanel } from './sidebar-date-panels'
import { RawDataSidebarPanel } from './raw-data-sidebar'
import { DailyListSidebarPanel } from './dailylist-sidebar-panel'

import type { PriorityKey } from './_sidebar-utils'
import { dateStr } from './_sidebar-utils'

// ── CalendarBrandSidebar ─────────────────────────────────────
function CalendarBrandSidebar({
  brands, brandCounts, activeBrands, totalCount, onToggle, onClear,
}: {
  brands: string[]
  brandCounts: Map<string, number>
  activeBrands: Set<string>
  totalCount: number
  onToggle: (b: string) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? brands.filter(b => b.toLowerCase().includes(q)) : brands
  }, [brands, query])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="pt-2 px-2 pb-2 shrink-0">
        <div className="px-2 mb-1 text-2xs font-semibold text-ink-400 uppercase tracking-wider">
          브랜드 {brands.length}
        </div>
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="브랜드 검색"
            className="w-full text-sm pl-5 pr-2 py-1 border border-border rounded bg-card text-muted-foreground placeholder:text-ink-300 focus:outline-none focus:border-lilac-300"
          />
        </div>
      </div>
      <div className="px-2 pb-3 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <button
          onClick={onClear}
          className={`sidebar-btn ${activeBrands.size === 0 ? 'sidebar-btn-active' : ''}`}
        >
          <span className="w-2 h-2 rounded-full shrink-0 bg-ink-300" />
          <span className="flex-1 truncate text-left">전체</span>
          <span className="text-sm text-ink-400">{totalCount}</span>
        </button>
        {visible.map(brand => {
          const active = activeBrands.has(brand)
          return (
            <button
              key={brand}
              onClick={() => onToggle(brand)}
              className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(brand) }} />
              <span className="flex-1 truncate text-left">{brand}</span>
              <span className="text-sm text-ink-400">{brandCounts.get(brand) ?? 0}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

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
  brandCounts?: Record<string, number>
  weeklyBrandCounts?: Record<string, number>
  weeklyBrands: Set<string>
  onToggleWeeklyBrand: (b: string) => void
  dailyBrands: Set<string>
  dailyTags: Set<Tag>
  dailyPriorities: Set<Priority>
  onToggleDailyBrand: (b: string) => void
  onToggleDailyTag: (t: Tag) => void
  onToggleDailyPriority: (p: Priority) => void
  calendarBrands: Set<string>
  calendarBrandList: string[]
  calendarBrandCounts: Map<string, number>
  calendarTotalCount: number
  onToggleCalendarBrand: (b: string) => void
  onClearCalendarBrands: () => void
  onTimelineStatsLoaded?: (stats: BrandTimelineStat[]) => void
}

export function SummarySidebar({
  view,
  history,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  selectedTags, priorityKey,
  onToggleTag, onPriorityChange,
  brandId, onBrandChange, brandCounts, weeklyBrandCounts, weeklyBrands, onToggleWeeklyBrand,
  dailyBrands, dailyTags, dailyPriorities,
  onToggleDailyBrand, onToggleDailyTag, onToggleDailyPriority,
  calendarBrands, calendarBrandList, calendarBrandCounts, calendarTotalCount,
  onToggleCalendarBrand, onClearCalendarBrands,
  onTimelineStatsLoaded,
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

  if (view === 'calendar') {
    return (
      <CalendarBrandSidebar
        brands={calendarBrandList}
        brandCounts={calendarBrandCounts}
        activeBrands={calendarBrands}
        totalCount={calendarTotalCount}
        onToggle={onToggleCalendarBrand}
        onClear={onClearCalendarBrands}
      />
    )
  }

  if (view === 'dailylist') {
    return (
      <DailyListSidebarPanel
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        brandId={brandId} onBrandChange={onBrandChange}
        brandCounts={brandCounts}
      />
    )
  }

  if (view === 'weeklylist') {
    return (
      <WeeklyListSidebar
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        activeBrands={weeklyBrands} onToggleBrand={onToggleWeeklyBrand}
        brandCounts={weeklyBrandCounts}
      />
    )
  }

  if (view === 'timeline') {
    return (
      <TimelineSidebar
        brandId={brandId}
        onBrandChange={onBrandChange}
        onStatsLoaded={onTimelineStatsLoaded ?? (() => {})}
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
      <MonthGridSection
        dateFrom={dateFrom} history={history}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
      />

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
              <span className="text-sm text-ink-400">{tagCounts[t] ?? 0}</span>
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
          <span className="text-sm text-ink-400">{priCounts.all}</span>
        </button>
        {PRIORITY_KEYS.filter(p => (priCounts[p] ?? 0) > 0).map(p => {
          const meta = PRIORITY_META[p]
          return (
            <button key={p} onClick={() => onPriorityChange(priorityKey === p ? 'all' : p)} className={`sidebar-btn ${priorityKey === p ? 'sidebar-btn-active' : ''}`}>
              <PriorityBars priority={p} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              <span className="text-sm text-ink-400">{priCounts[p]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── WeeklyList 사이드바 ─────────────────────────────────────
function WeeklyListSidebar({ dateFrom, dateTo, onDateFromChange, onDateToChange, activeBrands, onToggleBrand, brandCounts }: {
  dateFrom: string; dateTo: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  activeBrands: Set<string>; onToggleBrand: (b: string) => void
  brandCounts?: Record<string, number>
}) {
  const [query, setQuery] = useState('')

  const brandList = useMemo(() => {
    if (!brandCounts) return []
    return Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
  }, [brandCounts])

  const total = useMemo(() => brandList.reduce((s, [, c]) => s + c, 0), [brandList])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? brandList.filter(([n]) => n.toLowerCase().includes(q)) : brandList
  }, [brandList, query])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 pt-2 px-2">
        <DateRangePanel
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
          showToday={false}
        />
      </div>
      {brandList.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="pt-2 px-2 pb-2 shrink-0">
            <GroupTitle>브랜드 {brandList.length}</GroupTitle>
            <div className="relative">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="브랜드 검색"
                className="w-full text-sm pl-5 pr-2 py-1 border border-border rounded bg-card text-muted-foreground placeholder:text-ink-300 focus:outline-none focus:border-lilac-300"
              />
            </div>
          </div>
          <div className="px-2 pb-3 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              onClick={() => { for (const [n] of brandList) if (activeBrands.has(n)) onToggleBrand(n) }}
              className={`sidebar-btn ${activeBrands.size === 0 ? 'sidebar-btn-active' : ''}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-ink-300" />
              <span className="flex-1 truncate text-left">전체</span>
              <span className="text-sm text-ink-400">{total}</span>
            </button>
            {visible.map(([name, count]) => {
              const active = activeBrands.has(name)
              return (
                <button
                  key={name}
                  onClick={() => onToggleBrand(name)}
                  className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(name) }} />
                  <span className="flex-1 truncate text-left">{name}</span>
                  {active && <Check size={12} className="shrink-0" />}
                  <span className="text-sm text-ink-400">{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Timeline 사이드바 ───────────────────────────────────────
import type { BrandTimelineStat } from '@/app/api/brands/timeline/route'

interface TimelineSidebarProps {
  brandId: string | 'all'
  onBrandChange: (b: string | 'all') => void
  onStatsLoaded: (stats: BrandTimelineStat[]) => void
}

function TimelineSidebar({ brandId, onBrandChange, onStatsLoaded }: TimelineSidebarProps) {
  const [brands, setBrands] = useState<BrandTimelineStat[]>([])

  useEffect(() => {
    fetch('/api/brands/timeline')
      .then(r => r.json())
      .then(({ brands: rows }: { brands: BrandTimelineStat[] }) => {
        setBrands(rows ?? [])
        onStatsLoaded(rows ?? [])
      })
      .catch(() => {})
  }, [onStatsLoaded])

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="mt-1">
        <GroupTitle>브랜드 {brands.length}</GroupTitle>

        {/* 전체 버튼 */}
        <button
          onClick={() => onBrandChange('all')}
          className={`sidebar-btn ${brandId === 'all' ? 'sidebar-btn-active' : ''}`}
        >
          <span className="w-2 h-2 rounded-full shrink-0 bg-ink-300" />
          <span className="flex-1 truncate text-left">전체</span>
          {brandId === 'all' && <Check size={12} className="shrink-0" />}
        </button>

        {/* 이슈 있는 브랜드 */}
        {brands.filter(b => b.issue_count > 0).map(b => (
          <BrandBtn key={b.brand_name} stat={b} active={brandId === b.brand_name}
            onClick={() => onBrandChange(brandId === b.brand_name ? 'all' : b.brand_name)} />
        ))}

        {/* 조건 충족 but 이슈 없음 */}
        {brands.filter(b => b.eligible && b.issue_count === 0).length > 0 && (
          <div className="px-2 pt-3 pb-1">
            <span className="text-2xs font-semibold text-ink-300 uppercase tracking-wider">생성 가능</span>
          </div>
        )}
        {brands.filter(b => b.eligible && b.issue_count === 0).map(b => (
          <BrandBtn key={b.brand_name} stat={b} active={brandId === b.brand_name}
            onClick={() => onBrandChange(brandId === b.brand_name ? 'all' : b.brand_name)} />
        ))}

        {/* 조건 미충족 */}
        {brands.filter(b => !b.eligible).length > 0 && (
          <div className="px-2 pt-3 pb-1">
            <span className="text-2xs font-semibold text-ink-300 uppercase tracking-wider">데이터 부족</span>
          </div>
        )}
        {brands.filter(b => !b.eligible).map(b => (
          <BrandBtn key={b.brand_name} stat={b} active={brandId === b.brand_name}
            onClick={() => onBrandChange(brandId === b.brand_name ? 'all' : b.brand_name)} />
        ))}
      </div>
    </div>
  )
}

function BrandBtn({ stat, active, onClick }: {
  stat: BrandTimelineStat; active: boolean; onClick: () => void
}) {
  const hasIssues = stat.issue_count > 0
  const eligible  = stat.eligible

  return (
    <button
      onClick={onClick}
      className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''} ${!eligible ? 'opacity-50' : ''}`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: hasIssues ? brandColor(stat.brand_name) : eligible ? brandColor(stat.brand_name) : '#d1d5db' }}
      />
      <span className="flex-1 truncate text-left">{stat.brand_name}</span>
      {active && <Check size={12} className="shrink-0" />}
      {hasIssues && (
        <span className="text-sm text-ink-400">{stat.issue_count}</span>
      )}
    </button>
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
    kstDate(h.occurred_at) === selectedDate
  )

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
