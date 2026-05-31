'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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

interface Props {
  weeks: WeekData[]
  selectedWeek: string
  onSelect: (weekStart: string) => void
  teamColors: string[]
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토']

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekOfMonth(isoDate: string): { month: number; week: number } {
  const d = new Date(isoDate + 'T00:00:00')
  return { month: d.getMonth() + 1, week: Math.ceil(d.getDate() / 7) }
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`
}

export function WeeklyWeekList({ weeks, selectedWeek, onSelect, teamColors }: Props) {
  const today    = new Date()
  const todayFmt = fmt(today)

  const initDate = selectedWeek ? new Date(selectedWeek + 'T00:00:00') : today
  const [calYear,  setCalYear]  = useState(initDate.getFullYear())
  const [calMonth, setCalMonth] = useState(initDate.getMonth())

  const weeksMap = useMemo(() => {
    const m = new Map<string, WeekData>()
    for (const w of weeks) m.set(w.weekStart, w)
    return m
  }, [weeks])

  const rows = useMemo(() => {
    const firstDay  = new Date(calYear, calMonth, 1)
    const dow       = firstDay.getDay() // 0=일, 1=월 ... 6=토
    const startDate = new Date(calYear, calMonth, 1 - dow) // 해당 월 첫 일요일 이전 일요일

    return Array.from({ length: 6 }, (_, r) => {
      const sunday = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + r * 7)
      const days   = Array.from({ length: 7 }, (_, c) =>
        new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + c)
      )
      // weekStart = 해당 주의 월요일 (days[1])
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

  const selectedWeekData = weeksMap.get(selectedWeek)
  const { month, week: weekNum } = selectedWeek ? weekOfMonth(selectedWeek) : { month: 0, week: 0 }

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

      {/* 월 네비게이션 */}
      <div className="flex items-center mb-1 px-2">
        <button
          onClick={prevMonth}
          className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors"
        >
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
          disabled={atCurrentMonth}
          className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed"
        >
          <ChevronRight size={12} />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-0.5 px-2">
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

      {/* 주차 행 */}
      <div className="flex flex-col gap-0.5 px-2">
        {rows.map(({ weekStart, days }) => {
          const weekData  = weeksMap.get(weekStart)
          const hasData   = weekData?.teams.some(t => t.hasData) ?? false
          const isSelected = weekStart === selectedWeek

          return (
            <button
              key={weekStart}
              onClick={() => hasData ? onSelect(weekStart) : undefined}
              disabled={!hasData}
              className={[
                'grid grid-cols-7 w-full rounded transition-colors',
                isSelected
                  ? 'bg-lilac-500'
                  : hasData
                    ? 'hover:bg-muted cursor-pointer'
                    : 'cursor-default opacity-30',
              ].join(' ')}
            >
              {days.map((d, i) => {
                const inM    = d.getMonth() === calMonth
                const isToday = fmt(d) === todayFmt
                let colorClass = ''
                if (isSelected) colorClass = 'text-background'
                else if (!inM) colorClass = i === 0 ? 'text-day-sun-muted/60' : i === 6 ? 'text-day-sat-muted/60' : 'text-ink-200'
                else colorClass = i === 0 ? 'text-day-sun' : i === 6 ? 'text-day-sat' : 'text-foreground'

                return (
                  <div key={i} className={`relative h-6 flex items-center justify-center text-2xs ${colorClass}`}>
                    <span>{d.getDate()}</span>
                    {isToday && !isSelected && (
                      <span className="absolute -top-0.5 right-1 text-5xs font-bold text-lilac-500 leading-none">·</span>
                    )}
                  </div>
                )
              })}
            </button>
          )
        })}
      </div>

      {/* 선택된 주차 팀 제출 현황 */}
      {selectedWeekData && (
        <div className="mt-3">
          <div className="px-2 mb-1 text-2xs font-semibold text-ink-400 uppercase tracking-wider">
            {month}월 {weekNum}주 &middot; {fmtRange(selectedWeekData.weekStart, selectedWeekData.weekEnd)}
          </div>
          {selectedWeekData.teams.map((team, ti) => (
            <div key={team.id} className="flex items-center gap-2 px-2 py-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: teamColors[ti % teamColors.length] }}
              />
              <span className="flex-1 truncate text-sm text-foreground">{team.label}</span>
              {team.hasData
                ? <span className="text-sm text-ink-400">제출됨</span>
                : <span className="text-2xs font-semibold text-status-late">미제출</span>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
