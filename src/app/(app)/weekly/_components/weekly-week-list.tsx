'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { brandColor } from '../_lib/brand-colors'

export interface TeamStatus {
  id: string
  label: string
  collection_id: string
  hasData: boolean
  itemCount: number
}

export interface WeekData {
  weekStart: string
  weekEnd: string
  isCurrent: boolean
  teams: TeamStatus[]
}

export interface BrandItem {
  name: string
  count: number
  hasBlocked: boolean
}

interface Props {
  weeks:         WeekData[]
  selectedWeek:  string
  onSelect:      (weekStart: string) => void
  brandList:     BrandItem[]
  selectedBrand: string | null
  onSelectBrand: (brand: string | null) => void
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토']

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function WeeklyWeekList({ weeks, selectedWeek, onSelect, brandList, selectedBrand, onSelectBrand }: Props) {
  const today    = new Date()
  const todayFmt = fmt(today)

  const initDate = selectedWeek ? new Date(selectedWeek + 'T00:00:00') : today
  const [calYear,  setCalYear]  = useState(initDate.getFullYear())
  const [calMonth, setCalMonth] = useState(initDate.getMonth())
  const [brandSearch, setBrandSearch] = useState('')

  const weeksMap = useMemo(() => {
    const m = new Map<string, WeekData>()
    for (const w of weeks) m.set(w.weekStart, w)
    return m
  }, [weeks])

  const rows = useMemo(() => {
    const firstDay  = new Date(calYear, calMonth, 1)
    const dow       = firstDay.getDay()
    const startDate = new Date(calYear, calMonth, 1 - dow)

    return Array.from({ length: 6 }, (_, r) => {
      const sunday = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + r * 7)
      const days   = Array.from({ length: 7 }, (_, c) =>
        new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + c)
      )
      const weekStart = fmt(days[1])
      const inMonth   = days.some(d => d.getMonth() === calMonth)
      return { weekStart, days, inMonth }
    }).filter(row => row.inMonth)
  }, [calYear, calMonth])

  const atCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth()

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  const filteredBrands = brandSearch
    ? brandList.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()))
    : brandList
  const totalItems = brandList.reduce((s, b) => s + b.count, 0)

  return (
    <div className="flex flex-col flex-1 min-h-0">

    {/* ── 고정 영역: 캘린더 + 브랜드 헤더 + 검색창 ── */}
    <div className="shrink-0 p-2 pb-0 flex flex-col gap-0.5">

      {/* 월 네비게이션 */}
      <div className="flex items-center mb-1 px-2">
        <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors">
          <ChevronLeft size={12} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">{calYear}년 {calMonth + 1}월</span>
          {atCurrentMonth && (
            <span className="text-4xs font-bold tracking-[0.04em] px-1 rounded-2xs bg-lilac-100 text-lilac-600">NOW</span>
          )}
        </div>
        <button
          onClick={nextMonth}
          className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors"
        >
          <ChevronRight size={12} />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-0.5 px-2">
        {DAY_HEADERS.map((d, i) => (
          <div key={d} className={`text-2xs text-center py-0.5 ${i === 0 ? 'text-day-sun-muted' : i === 6 ? 'text-day-sat-muted' : 'text-ink-400'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 주차 행 */}
      <div className="flex flex-col gap-0.5 px-2">
        {rows.map(({ weekStart, days }) => {
          const weekData   = weeksMap.get(weekStart)
          const hasData    = weekData?.teams.some(t => t.hasData) ?? false
          const isSelected = weekStart === selectedWeek

          return (
            <button
              key={weekStart}
              onClick={() => hasData ? onSelect(weekStart) : undefined}
              disabled={!hasData}
              className={[
                'grid grid-cols-7 w-full rounded transition-colors',
                hasData ? 'cursor-pointer' : 'cursor-default opacity-30',
                !isSelected && hasData ? 'hover:bg-muted' : '',
              ].join(' ')}
            >
              {days.map((d, i) => {
                const inM    = d.getMonth() === calMonth
                const isToday = fmt(d) === todayFmt
                const isWd   = i >= 1 && i <= 5

                let colorClass = ''
                if (isSelected && isWd) colorClass = 'text-background'
                else if (!inM) colorClass = i === 0 ? 'text-day-sun-muted/60' : i === 6 ? 'text-day-sat-muted/60' : 'text-ink-200'
                else colorClass = i === 0 ? 'text-day-sun' : i === 6 ? 'text-day-sat' : 'text-foreground'

                const cellBg = isSelected && isWd
                  ? i === 1 ? 'bg-lilac-500 rounded-l' : i === 5 ? 'bg-lilac-500 rounded-r' : 'bg-lilac-500'
                  : ''

                return (
                  <div key={i} className={`relative h-6 flex items-center justify-center text-2xs ${colorClass} ${cellBg}`}>
                    <span>{d.getDate()}</span>
                    {isToday && !(isSelected && isWd) && (
                      <span className="absolute -top-0.5 right-1 text-5xs font-bold text-lilac-500 leading-none">·</span>
                    )}
                  </div>
                )
              })}
            </button>
          )
        })}
      </div>

      {/* 브랜드 헤더 + 검색창 (고정) */}
      {brandList.length > 0 && (
        <div className="mt-1 pt-2 border-t border-border">
          <div className="flex items-center px-2 pb-1">
            <span className="text-2xs font-semibold text-ink-400 uppercase tracking-wider">
              브랜드 {brandList.length}
            </span>
          </div>
          <div className="px-2 pb-1.5">
            <input
              type="text"
              value={brandSearch}
              onChange={e => setBrandSearch(e.target.value)}
              placeholder="브랜드 검색"
              className="w-full px-2 py-1 text-xs rounded-md border border-border bg-background placeholder:text-ink-300 focus:outline-none focus:ring-1 focus:ring-lilac-300"
            />
          </div>
        </div>
      )}
    </div>

    {/* ── 스크롤 영역: 브랜드 목록 ── */}
    {brandList.length > 0 && (
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 flex flex-col [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => onSelectBrand(null)}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md mx-0.5 text-left transition-colors ${
            selectedBrand === null ? 'bg-muted text-foreground' : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-ink-300 shrink-0" />
          <span className="flex-1 text-sm font-medium">전체</span>
          <span className="text-sm tabular-nums text-ink-400">{totalItems}</span>
        </button>
        {filteredBrands.map(b => (
          <button
            key={b.name}
            onClick={() => onSelectBrand(selectedBrand === b.name ? null : b.name)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md mx-0.5 text-left transition-colors ${
              selectedBrand === b.name ? 'bg-muted text-foreground' : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: b.hasBlocked ? 'var(--color-status-late)' : brandColor(b.name) }}
            />
            <span className="flex-1 text-sm font-medium truncate">{b.name}</span>
            <span className="text-sm tabular-nums text-ink-400">{b.count}</span>
          </button>
        ))}
      </div>
    )}
    </div>
  )
}
