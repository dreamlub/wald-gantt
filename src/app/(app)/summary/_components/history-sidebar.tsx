'use client'

import { useState, useEffect } from 'react'
import { Check, LayoutList, ChevronLeft, ChevronRight } from 'lucide-react'

import type { Tag, HistoryItem, Priority } from '../_lib/types'
import { TAG_META, TAG_KEYS, PRIORITY_META, PRIORITY_KEYS } from '../_lib/mock-data'
import { PriorityBars } from './badges'
import { brandColor } from '@/lib/history-service'

// ── 유틸 re-export (history-shell 등 외부에서 사용) ──────────
export type { PriorityKey } from './_sidebar-utils'
export {
  getMondayOfDate, dateStr, getWeekLabel, getWeekDateRange,
  getCurrentWeekStart, isCurrentWeek,
} from './_sidebar-utils'

import { dateStr } from './_sidebar-utils'
import type { PriorityKey } from './_sidebar-utils'
import { GroupTitle, DateRangePanel } from './_sidebar-controls'
import { DailyListSidebarPanel } from './dailylist-sidebar-panel'

// ── Props ────────────────────────────────────────────────────
interface Props {
  view: 'dailylist' | 'weeklylist' | 'dailyreport' | 'summary' | 'timeline' | 'calendar'
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
  reportDates?: Set<string>
  brandCounts?: Record<string, number>
}

export function HistorySidebar({
  view,
  history,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  selectedTags, priorityKey,
  onToggleTag, onPriorityChange,
  brandId, onBrandChange,
  dailyBrands, dailyTags, dailyPriorities,
  onToggleDailyBrand, onToggleDailyTag, onToggleDailyPriority,
  reportDates,
  brandCounts,
}: Props) {
  const tagCounts: Record<string, number> = {}
  for (const t of TAG_KEYS) tagCounts[t] = 0
  for (const h of history) for (const t of h.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1

  const priCounts: Record<string, number> = { all: history.length }
  for (const p of PRIORITY_KEYS) priCounts[p] = 0
  for (const h of history) if (h.priority) priCounts[h.priority] = (priCounts[h.priority] ?? 0) + 1

  // ── Daily List ─────────────────────────────────────────────
  if (view === 'dailylist') {
    return (
      <DailyListSidebarPanel
        dateFrom={dateFrom} dateTo={dateTo}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        selectedTags={selectedTags} onToggleTag={onToggleTag}
        priorityKey={priorityKey} onPriorityChange={onPriorityChange}
        brandId={brandId} onBrandChange={onBrandChange}
        brandCounts={brandCounts}
      />
    )
  }

  // ── Timeline ───────────────────────────────────────────────
  if (view === 'timeline') {
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

  // ── Daily Report ───────────────────────────────────────────
  if (view === 'dailyreport') {
    const selectedDate = dateFrom || dateStr(new Date())
    const dayItems = history.filter(h =>
      new Date(h.occurred_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) === selectedDate
    )
    const brandSet = new Map<string, true>()
    for (const h of dayItems) brandSet.set(h.brand_name ?? '미분류', true)
    const dayBrands = [...brandSet.keys()]

    return (
      <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <MonthGridSection
          dateFrom={dateFrom} history={history}
          onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
          reportDates={reportDates}
        />
        <div className="mt-3">
          <GroupTitle>중요도</GroupTitle>
          {PRIORITY_KEYS.map(p => {
            const meta = PRIORITY_META[p]
            const active = dailyPriorities.has(p)
            return (
              <button key={p} onClick={() => onToggleDailyPriority(p)} className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}>
                <PriorityBars priority={p} />
                <span className="flex-1 truncate text-left">{meta.label}</span>
                {active && <Check size={12} className="shrink-0" />}
              </button>
            )
          })}
        </div>
        <div className="mt-3">
          <GroupTitle>태그</GroupTitle>
          {TAG_KEYS.map(t => {
            const meta = TAG_META[t]
            const active = dailyTags.has(t)
            return (
              <button key={t} onClick={() => onToggleDailyTag(t)} className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
                <span className="flex-1 truncate text-left">{meta.label}</span>
                {active && <Check size={12} className="shrink-0" />}
              </button>
            )
          })}
        </div>
        {dayBrands.length > 0 && (
          <div className="mt-3">
            <GroupTitle>브랜드</GroupTitle>
            {dayBrands.map(name => {
              const active = dailyBrands.has(name)
              return (
                <button
                  key={name}
                  onClick={() => onToggleDailyBrand(name)}
                  className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: brandColor(name) }} />
                  <span className="flex-1 truncate text-left">{name}</span>
                  {active && <Check size={12} className="shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Default (summary / weeklylist) ─────────────────────────
  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {view === 'weeklylist' ? (
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
              {view !== 'weeklylist' && <span className="text-xs text-ink-400">{tagCounts[t] ?? 0}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <GroupTitle>중요도</GroupTitle>
        <button onClick={() => onPriorityChange('all')} className={`sidebar-btn ${priorityKey === 'all' ? 'sidebar-btn-active' : ''}`}>
          <LayoutList size={12} className="shrink-0" />
          <span className="flex-1 truncate text-left">전체</span>
          {view !== 'weeklylist' && <span className="text-xs text-ink-400">{priCounts.all}</span>}
        </button>
        {PRIORITY_KEYS.filter(p => (priCounts[p] ?? 0) > 0).map(p => {
          const meta = PRIORITY_META[p]
          return (
            <button key={p} onClick={() => onPriorityChange(priorityKey === p ? 'all' : p)} className={`sidebar-btn ${priorityKey === p ? 'sidebar-btn-active' : ''}`}>
              <PriorityBars priority={p} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              {view !== 'weeklylist' && <span className="text-xs text-ink-400">{priCounts[p]}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── 월별 캘린더 그리드 (dailyreport / summary용) ─────────────
const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const

function MonthGridSection({ dateFrom, history, onDateFromChange, onDateToChange, reportDates }: {
  dateFrom: string; history: HistoryItem[]
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  reportDates?: Set<string>
}) {
  const today = new Date()
  const todayYmd = dateStr(today)
  const todayY = today.getFullYear()
  const todayM = today.getMonth()
  const todayMs = new Date(todayY, todayM, today.getDate()).getTime()

  const [calYear,  setCalYear]  = useState(() => dateFrom ? parseInt(dateFrom.slice(0, 4)) : todayY)
  const [calMonth, setCalMonth] = useState(() => dateFrom ? parseInt(dateFrom.slice(5, 7)) - 1 : todayM)

  useEffect(() => {
    if (!dateFrom) return
    const y = parseInt(dateFrom.slice(0, 4))
    const m = parseInt(dateFrom.slice(5, 7)) - 1
    /* eslint-disable react-hooks/set-state-in-effect */
    setCalYear(y)
    setCalMonth(m)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [dateFrom])

  const dayCounts = (() => {
    const m: Record<string, number> = {}
    for (const h of history) {
      const ymd = new Date(h.occurred_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
      m[ymd] = (m[ymd] ?? 0) + 1
    }
    return m
  })()

  const cells = (() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay()
    const start = new Date(calYear, calMonth, 1 - firstDow)
    return Array.from({ length: 42 }, (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    )
  })()

  function selectDay(d: Date) {
    const ymd = dateStr(d)
    if (ymd === dateFrom) { onDateFromChange(''); onDateToChange('') }
    else { onDateFromChange(ymd); onDateToChange(ymd) }
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }

  const atCurrentMonth = calYear === todayY && calMonth === todayM
  function nextMonth() {
    if (atCurrentMonth) return
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  return (
    <div className="pb-1 px-2">
      <GroupTitle>캘린더</GroupTitle>
      <div className="flex items-center mb-1">
        <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors">
          <ChevronLeft size={12} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">{calYear}년 {calMonth + 1}월</span>
          {atCurrentMonth && (
            <span className="text-3xs font-bold tracking-[0.04em] px-1 rounded-2xs bg-lilac-100 text-lilac-600">NOW</span>
          )}
        </div>
        <button onClick={nextMonth} disabled={atCurrentMonth}
          className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed">
          <ChevronRight size={12} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-0.5">
        {DAY_HEADERS.map((d, i) => (
          <div key={d} className={`text-3xs text-center py-0.5 ${i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-ink-400'}`}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          const dow        = d.getDay()
          const inMonth    = d.getMonth() === calMonth
          const ymd        = dateStr(d)
          const isSelected = ymd === dateFrom
          const isToday    = ymd === todayYmd
          const isFuture   = d.getTime() > todayMs
          const hasItems   = (dayCounts[ymd] ?? 0) > 0
          const hasReport  = reportDates?.has(ymd) ?? false

          let colorClass = ''
          if (isFuture) colorClass = 'text-ink-200'
          else if (!inMonth) colorClass = dow === 0 ? 'text-rose-200' : dow === 6 ? 'text-blue-200' : 'text-ink-200'
          else colorClass = dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-blue-500' : 'text-foreground'

          return (
            <button
              key={i}
              onClick={() => !isFuture && selectDay(d)}
              disabled={isFuture}
              className={[
                'relative h-6 flex items-center justify-center rounded text-xs transition-colors',
                isSelected ? 'bg-lilac-500 text-white font-semibold hover:bg-lilac-500' : isFuture ? 'cursor-not-allowed' : 'hover:bg-muted',
                !isSelected ? colorClass : '',
              ].join(' ')}
              title={ymd}
            >
              <span>{d.getDate()}</span>
              {isToday && !isSelected && (
                <span className="absolute -top-0.5 right-1 text-5xs font-bold text-lilac-500 leading-none">·</span>
              )}
              {(hasItems || hasReport) && (
                <span className={[
                  'absolute bottom-0.5 w-1 h-1 rounded-full',
                  isSelected ? 'bg-white/70' : hasReport ? 'bg-lilac-500' : 'bg-current opacity-40',
                ].join(' ')} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
