'use client'

import { useState, useEffect, useMemo } from 'react'
import { Check, LayoutList, ChevronLeft, ChevronRight, CalendarIcon, Search } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

import type { Tag, HistoryItem, Priority } from '../_lib/types'
import { TAG_META, TAG_KEYS, PRIORITY_META, PRIORITY_KEYS } from '../_lib/mock-data'
import { PriorityBars } from './badges'
import { brandColor } from '@/lib/history-service'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

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
  view: 'dailylist' | 'weeklylist' | 'dailyreport' | 'summary' | 'timeline' | 'calendar'
  history: HistoryItem[]
  // table/summary용
  dateFrom: string
  dateTo: string
  onDateFromChange: (s: string) => void
  onDateToChange: (s: string) => void
  // 공통
  selectedTags: Set<Tag>
  priorityKey: PriorityKey
  onToggleTag: (t: Tag) => void
  onPriorityChange: (p: PriorityKey) => void
  // 브랜드 (타임라인 등)
  brandId: string | 'all'
  onBrandChange: (b: string | 'all') => void
  // 데일리 리포트 필터
  dailyBrands: Set<string>
  dailyTags: Set<Tag>
  dailyPriorities: Set<Priority>
  onToggleDailyBrand: (b: string) => void
  onToggleDailyTag: (t: Tag) => void
  onToggleDailyPriority: (p: Priority) => void
  // 리포트가 존재하는 날짜 집합 (캘린더 dot 구분용)
  reportDates?: Set<string>
  // dailylist 브랜드 목록 (pg.brandCounts에서 전달)
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

  if (view === 'timeline' ) {
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

  if (view === 'dailyreport') {
    // 브랜드 목록: 날짜 기준 raw data에서 추출 (필터 UI 표시용, 카운트는 표시 안 함)
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

        {/* 중요도 필터 — 항상 3개 표시, raw 카운트 없음 */}
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

        {/* 태그 필터 — 항상 전체 표시, raw 카운트 없음 */}
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

        {/* 브랜드 필터 — raw 카운트 없이 목록만 */}
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

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

      {/* ── 기간 ─────────────────────────── */}
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

      {/* ── 태그·중요도 ─────────────────── */}
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

// ── 일별 캘린더 (테이블/요약 전용) ──────────────────────────
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

  const [calYear, setCalYear]   = useState(() => dateFrom ? parseInt(dateFrom.slice(0, 4)) : todayY)
  const [calMonth, setCalMonth] = useState(() => dateFrom ? parseInt(dateFrom.slice(5, 7)) - 1 : todayM)

  // dateFrom 외부 변경(자동 이동 등) 시 캘린더 월 동기화
  useEffect(() => {
    if (!dateFrom) return
    const y = parseInt(dateFrom.slice(0, 4))
    const m = parseInt(dateFrom.slice(5, 7)) - 1
    /* eslint-disable react-hooks/set-state-in-effect */
    setCalYear(y)
    setCalMonth(m)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [dateFrom])

  // 일별 카운트 (점 표시) — KST 기준
  const dayCounts = (() => {
    const m: Record<string, number> = {}
    for (const h of history) {
      const ymd = new Date(h.occurred_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
      m[ymd] = (m[ymd] ?? 0) + 1
    }
    return m
  })()

  // 6주 × 7일 = 42 셀
  const cells = (() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay()
    const start = new Date(calYear, calMonth, 1 - firstDow)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return d
    })
  })()

  function selectDay(d: Date) {
    const ymd = dateStr(d)
    if (ymd === dateFrom) {
      onDateFromChange('')
      onDateToChange('')
    } else {
      onDateFromChange(ymd)
      onDateToChange(ymd)
    }
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

        {/* 월 네비게이터 */}
        <div className="flex items-center mb-1">
          <button onClick={prevMonth}
            className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors">
            <ChevronLeft size={12} />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5">
            <span className="text-2xs font-semibold text-foreground">{calYear}년 {calMonth + 1}월</span>
            {atCurrentMonth && (
              <span className="text-4xs font-bold tracking-[0.04em] px-1 rounded-2xs bg-lilac-100 text-lilac-600">NOW</span>
            )}
          </div>
          <button onClick={nextMonth} disabled={atCurrentMonth}
            className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed">
            <ChevronRight size={12} />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-0.5">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={`text-4xs text-center py-0.5 ${
                i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-ink-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          const dow      = d.getDay()
          const inMonth  = d.getMonth() === calMonth
          const ymd      = dateStr(d)
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
                'relative h-6 flex items-center justify-center rounded text-2xs transition-colors',
                isSelected
                  ? 'bg-lilac-500 text-white font-semibold hover:bg-lilac-500'
                  : isFuture
                    ? 'cursor-not-allowed'
                    : 'hover:bg-muted',
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
                  isSelected
                    ? 'bg-white/70'
                    : hasReport
                      ? 'bg-lilac-500'          // 리포트 있는 날: 진한 lilac
                      : 'bg-current opacity-40', // raw data만 있는 날: 연한 dot
                ].join(' ')} />
              )}
            </button>
          )
        })}
        </div>
    </div>
  )
}

// ── 날짜 범위 (테이블 전용) ─────────────────────────────────
function SidebarDatePicker({ value, onChange, placeholder }: {
  value: string; onChange: (s: string) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const dateValue = value ? new Date(value + 'T00:00:00') : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-border bg-card px-2 text-xs h-7 font-normal transition-colors hover:bg-muted">
        <CalendarIcon size={12} className="text-muted-foreground shrink-0" />
        {dateValue
          ? <span className="text-foreground text-2xs">{format(dateValue, 'yy.MM.dd', { locale: ko })}</span>
          : <span className="text-ink-300 text-2xs">{placeholder}</span>
        }
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="right">
        <Calendar
          mode="single"
          selected={dateValue}
          defaultMonth={dateValue}
          onSelect={d => { onChange(d ? dateStr(d) : ''); setOpen(false) }}
          locale={ko}
        />
      </PopoverContent>
    </Popover>
  )
}

function DateRangePanel({ dateFrom, dateTo, onDateFromChange, onDateToChange }: {
  dateFrom: string; dateTo: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
}) {
  function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const today = fmt(new Date())

  function applyPreset(preset: 'week' | 'month' | 'lastmonth' | 'all') {
    if (preset === 'all') { onDateFromChange(''); onDateToChange(''); return }
    const now = new Date()
    if (preset === 'week') {
      const d = new Date(now.getTime() - 6 * 86400000)
      onDateFromChange(fmt(d))
      onDateToChange(today)
    } else if (preset === 'month') {
      onDateFromChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
      onDateToChange(today)
    } else if (preset === 'lastmonth') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      onDateFromChange(fmt(d))
      onDateToChange(fmt(last))
    }
  }

  const presets = [
    ['week', '최근 1주'],
    ['month', '이번 달'],
    ['lastmonth', '지난 달'],
    ['all', '전체'],
  ] as const

  function activePreset(): string | null {
    if (!dateFrom && !dateTo) return 'all'
    const now = new Date()
    const weekAgo = fmt(new Date(now.getTime() - 6 * 86400000))
    if (dateFrom === weekAgo && dateTo === today) return 'week'
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    if (dateFrom === monthStart && dateTo === today) return 'month'
    const lmFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lmLast = new Date(now.getFullYear(), now.getMonth(), 0)
    if (dateFrom === fmt(lmFirst) && dateTo === fmt(lmLast)) return 'lastmonth'
    return null
  }

  const active = activePreset()

  return (
    <div className="pb-1 px-2 flex flex-col gap-2">
        <GroupTitle>기간</GroupTitle>
        <div className="flex items-center gap-1.5">
          <SidebarDatePicker value={dateFrom} onChange={onDateFromChange} placeholder="시작일" />
          <span className="text-3xs text-ink-400 shrink-0">~</span>
          <SidebarDatePicker value={dateTo} onChange={onDateToChange} placeholder="종료일" />
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`text-3xs px-2 py-0.5 rounded border transition-colors ${
                active === key
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border text-ink-500 hover:text-foreground hover:border-ink-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
    </div>
  )
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-2 mb-1 text-3xs font-semibold text-ink-400 uppercase tracking-wider">{children}</div>
}

// ── Daily List 전용 사이드바 패널 ─────────────────────────────
function DailyListSidebarPanel({
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  selectedTags, onToggleTag,
  priorityKey, onPriorityChange,
  brandId, onBrandChange,
  brandCounts,
}: {
  dateFrom: string; dateTo: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  selectedTags: Set<Tag>; onToggleTag: (t: Tag) => void
  priorityKey: PriorityKey; onPriorityChange: (p: PriorityKey) => void
  brandId: string | 'all'; onBrandChange: (b: string | 'all') => void
  brandCounts?: Record<string, number>
}) {
  const [brandQuery, setBrandQuery] = useState('')

  const brandList = useMemo(() => {
    if (!brandCounts || Object.keys(brandCounts).length === 0) return []
    return Object.entries(brandCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  }, [brandCounts])

  const visibleBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase()
    if (!q) return brandList
    return brandList.filter(b => b.name.toLowerCase().includes(q))
  }, [brandList, brandQuery])

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* 기간 + 태그 + 중요도 */}
      <div className="shrink-0 p-2 space-y-3">
        <DateRangePanel
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        />

        <div>
          <GroupTitle>태그</GroupTitle>
          <div className="px-2 flex flex-wrap gap-1.5">
            {TAG_KEYS.map(t => {
              const meta = TAG_META[t]
              const active = selectedTags.has(t)
              return (
                <button
                  key={t}
                  onClick={() => onToggleTag(t)}
                  style={{ background: meta.bg, color: meta.color }}
                  className={`text-3xs font-semibold px-2 py-0.5 rounded transition-opacity ${
                    selectedTags.size > 0 && !active ? 'opacity-30 hover:opacity-65' : ''
                  }`}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <GroupTitle>중요도</GroupTitle>
          <div className="px-2 flex flex-wrap gap-1.5">
            {PRIORITY_KEYS.map(p => {
              const meta = PRIORITY_META[p]
              const active = priorityKey === p
              return (
                <button
                  key={p}
                  onClick={() => onPriorityChange(priorityKey === p ? 'all' : p)}
                  style={{ background: meta.bg, color: meta.color }}
                  className={`flex items-center gap-1 text-3xs font-semibold px-2 py-0.5 rounded transition-opacity ${
                    priorityKey !== 'all' && !active ? 'opacity-30 hover:opacity-65' : ''
                  }`}
                >
                  <PriorityBars priority={p} />
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 브랜드 목록 */}
      {brandList.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 pt-3 pb-1.5">
            <GroupTitle>브랜드 {brandList.length}</GroupTitle>
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
              <input
                value={brandQuery}
                onChange={e => setBrandQuery(e.target.value)}
                placeholder="브랜드 검색"
                className="w-full h-7 rounded border border-border bg-background pl-6 pr-2 text-2xs outline-none focus:border-lilac-300"
              />
            </div>
          </div>
          <div className="px-2 pb-3">
            {visibleBrands.map(brand => {
              const active = brandId === brand.name
              return (
                <button
                  key={brand.name}
                  onClick={() => onBrandChange(active ? 'all' : brand.name)}
                  className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(brand.name) }} />
                  <span className="flex-1 truncate text-left">{brand.name}</span>
                  <span className="text-xs text-ink-400">{brand.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

