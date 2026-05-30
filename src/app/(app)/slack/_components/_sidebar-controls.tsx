'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

import { dateStr, getMondayOfDate } from './_sidebar-utils'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

export function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-2 mb-2 text-2xs font-semibold text-ink-400 uppercase tracking-wider">{children}</div>
}

export function SidebarDatePicker({ value, onChange, placeholder }: {
  value: string; onChange: (s: string) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const dateValue = value ? new Date(value + 'T00:00:00') : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-border bg-card px-2 text-xs h-7 font-normal transition-colors hover:bg-muted">
        <CalendarIcon size={12} className="text-muted-foreground shrink-0" />
        {dateValue
          ? <span className="text-foreground text-xs">{format(dateValue, 'yy.MM.dd', { locale: ko })}</span>
          : <span className="text-ink-300 text-xs">{placeholder}</span>
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

export const PRESETS = [
  ['today',     '오늘'],
  ['default',   '기본'],
  ['month',     '이번 달'],
  ['lastmonth', '지난 달'],
  ['all',       '전체'],
] as const

export function applyDatePreset(
  preset: 'today' | 'default' | 'month' | 'lastmonth' | 'all',
  onFrom: (s: string) => void,
  onTo: (s: string) => void,
) {
  if (preset === 'all') { onFrom(''); onTo(''); return }
  const now = new Date()
  if (preset === 'today') {
    const today = dateStr(now)
    onFrom(today)
    onTo(today)
    return
  }
  if (preset === 'default') {
    const thisMonday = getMondayOfDate(now)
    const lastMonday = new Date(thisMonday)
    lastMonday.setDate(thisMonday.getDate() - 7)
    const thisSunday = new Date(thisMonday)
    thisSunday.setDate(thisMonday.getDate() + 6)
    onFrom(dateStr(lastMonday))
    onTo(dateStr(thisSunday))
  } else if (preset === 'month') {
    onFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
    onTo(dateStr(now))
  } else if (preset === 'lastmonth') {
    onFrom(dateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
    onTo(dateStr(new Date(now.getFullYear(), now.getMonth(), 0)))
  }
}

export function getActivePreset(dateFrom: string, dateTo: string): string | null {
  if (!dateFrom && !dateTo) return 'all'
  const now = new Date()
  const today = dateStr(now)
  if (dateFrom === today && dateTo === today) return 'today'
  const thisMonday = getMondayOfDate(now)
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const thisSunday = new Date(thisMonday)
  thisSunday.setDate(thisMonday.getDate() + 6)
  if (dateFrom === dateStr(lastMonday) && dateTo === dateStr(thisSunday)) return 'default'
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  if (dateFrom === monthStart && dateTo === dateStr(now)) return 'month'
  const lmFirst = dateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const lmLast  = dateStr(new Date(now.getFullYear(), now.getMonth(), 0))
  if (dateFrom === lmFirst && dateTo === lmLast) return 'lastmonth'
  return null
}

export function DateRangePanel({ dateFrom, dateTo, onDateFromChange, onDateToChange }: {
  dateFrom: string; dateTo: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
}) {
  const active = getActivePreset(dateFrom, dateTo)
  return (
    <div className="pb-1 px-2 flex flex-col gap-2">
      <GroupTitle>기간</GroupTitle>
      <div className="flex items-center gap-1.5">
        <SidebarDatePicker value={dateFrom} onChange={onDateFromChange} placeholder="시작일" />
        <span className="text-2xs text-ink-400 shrink-0">~</span>
        <SidebarDatePicker value={dateTo}   onChange={onDateToChange}   placeholder="종료일" />
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => applyDatePreset(key, onDateFromChange, onDateToChange)}
            className={`text-2xs px-2 py-0.5 rounded border transition-colors ${
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
