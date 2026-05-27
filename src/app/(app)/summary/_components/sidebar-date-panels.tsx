'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

import type { HistoryItem } from '../_lib/types'
import { dateStr } from './_sidebar-utils'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

// ── GroupTitle ───────────────────────────────────────────────
export function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-2 mb-1 text-sm font-semibold text-ink-400 uppercase tracking-wider">{children}</div>
}

// ── SectionDivider — 날짜·섹션 구분선 (리스트 뷰 공용) ──────
// 날짜/섹션은 콘텐츠를 조직하는 헤더 → text-sm(14px), muted color로 아이템 타이틀과 구분
// border: 하단 구분선 표시 여부 (default true)
// dotColor: 인라인 컬러 dot (브랜드/상태 색상용)
// dotClass: Tailwind 클래스 dot (고정 팔레트용)
export function SectionDivider({
  label,
  count,
  dotColor,
  dotClass,
  border = true,
}: {
  label: string
  count?: number
  dotColor?: string
  dotClass?: string
  border?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 ${border ? 'pb-1 border-b border-border' : ''}`}>
      {(dotColor || dotClass) && (
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${dotClass ?? ''}`}
          style={dotColor ? { background: dotColor } : undefined}
        />
      )}
      <span className="text-sm font-bold text-ink-400">{label}</span>
      {count !== undefined && <span className="text-xs text-ink-300">{count}건</span>}
    </div>
  )
}

// ── 일별 캘린더 (테이블/요약 전용) ──────────────────────────
const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const

export function MonthGridSection({ dateFrom, history, onDateFromChange, onDateToChange }: {
  dateFrom: string; history: HistoryItem[]
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
}) {
  const today = new Date()
  const todayYmd = dateStr(today)
  const todayY = today.getFullYear()
  const todayM = today.getMonth()
  const todayMs = new Date(todayY, todayM, today.getDate()).getTime()

  const [calYear, setCalYear]   = useState(() => dateFrom ? parseInt(dateFrom.slice(0, 4)) : todayY)
  const [calMonth, setCalMonth] = useState(() => dateFrom ? parseInt(dateFrom.slice(5, 7)) - 1 : todayM)

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

        <div className="flex items-center mb-1">
          <button onClick={prevMonth}
            className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors">
            <ChevronLeft size={12} />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">{calYear}년 {calMonth + 1}월</span>
            {atCurrentMonth && (
              <span className="text-4xs font-bold tracking-[0.04em] px-1 rounded-2xs bg-lilac-100 text-lilac-600">NOW</span>
            )}
          </div>
          <button onClick={nextMonth} disabled={atCurrentMonth}
            className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed">
            <ChevronRight size={12} />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-0.5">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={`text-2xs text-center py-0.5 ${
                i === 0 ? 'text-day-sun-muted' : i === 6 ? 'text-day-sat-muted' : 'text-ink-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          const dow      = d.getDay()
          const inMonth  = d.getMonth() === calMonth
          const ymd      = dateStr(d)
          const isSelected = ymd === dateFrom
          const isToday    = ymd === todayYmd
          const isFuture   = d.getTime() > todayMs
          const hasItems   = (dayCounts[ymd] ?? 0) > 0

          let colorClass = ''
          if (isFuture) colorClass = 'text-ink-200'
          else if (!inMonth) colorClass = dow === 0 ? 'text-day-sun-muted/60' : dow === 6 ? 'text-day-sat-muted/60' : 'text-ink-200'
          else colorClass = dow === 0 ? 'text-day-sun' : dow === 6 ? 'text-day-sat' : 'text-foreground'

          return (
            <button
              key={i}
              onClick={() => !isFuture && selectDay(d)}
              disabled={isFuture}
              className={[
                'relative h-6 flex items-center justify-center rounded text-2xs transition-colors',
                isSelected
                  ? 'bg-lilac-500 text-background font-semibold hover:bg-lilac-500'
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
              {hasItems && (
                <span className={[
                  'absolute bottom-0.5 w-1 h-1 rounded-full',
                  isSelected ? 'bg-background/70' : 'bg-current opacity-40',
                ].join(' ')} />
              )}
            </button>
          )
        })}
        </div>
    </div>
  )
}

// ── SidebarDatePicker ───────────────────────────────────────
export function SidebarDatePicker({ value, onChange, placeholder }: {
  value: string; onChange: (s: string) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const dateValue = value ? new Date(value + 'T00:00:00') : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-border bg-card px-2 text-sm h-7 font-normal transition-colors hover:bg-muted">
        <CalendarIcon size={12} className="text-muted-foreground shrink-0" />
        {dateValue
          ? <span className="text-foreground text-sm">{format(dateValue, 'yy.MM.dd', { locale: ko })}</span>
          : <span className="text-ink-300 text-sm">{placeholder}</span>
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

// ── DateRangePanel ──────────────────────────────────────────
export function DateRangePanel({ dateFrom, dateTo, onDateFromChange, onDateToChange, showToday = true }: {
  dateFrom: string; dateTo: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  showToday?: boolean
}) {
  function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const today = fmt(new Date())

  function applyPreset(preset: 'today' | 'week' | 'month' | 'lastmonth' | 'all') {
    if (preset === 'all') { onDateFromChange(''); onDateToChange(''); return }
    const now = new Date()
    if (preset === 'today') {
      onDateFromChange(today)
      onDateToChange(today)
      return
    }
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

  const presets = (showToday
    ? [['today', '오늘'], ['week', '최근 1주'], ['month', '이번 달'], ['lastmonth', '지난 달'], ['all', '전체']]
    : [['week', '최근 1주'], ['month', '이번 달'], ['lastmonth', '지난 달'], ['all', '전체']]
  ) as readonly (readonly [string, string])[]

  function activePreset(): string | null {
    if (!dateFrom && !dateTo) return 'all'
    if (dateFrom === today && dateTo === today) return 'today'
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
          <span className="text-sm text-ink-400 shrink-0">~</span>
          <SidebarDatePicker value={dateTo} onChange={onDateToChange} placeholder="종료일" />
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyPreset(key as 'today' | 'week' | 'month' | 'lastmonth' | 'all')}
              className={`text-sm px-2 py-0.5 rounded border transition-colors ${
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
