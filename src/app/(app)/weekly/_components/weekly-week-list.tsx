'use client'

import { ChevronRight } from 'lucide-react'

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

// ── 날짜 유틸 ────────────────────────────────────────────────────

function isoWeekNum(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00')
  const tmp = new Date(d.getTime())
  tmp.setDate(tmp.getDate() + 3 - (tmp.getDay() + 6) % 7)
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return 1 + Math.round(
    ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
  )
}

function weekOfMonth(isoDate: string): { month: number; week: number } {
  const d = new Date(isoDate + 'T00:00:00')
  // Math.ceil(date/7) — 1~7일=1주, 8~14일=2주, ...
  // 첫날이 월요일이 아닌 경우에도 "0주" 가 나오지 않음
  return { month: d.getMonth() + 1, week: Math.ceil(d.getDate() / 7) }
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`
}

// ── 컴포넌트 ─────────────────────────────────────────────────────

export function WeeklyWeekList({ weeks, selectedWeek, onSelect }: Props) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2 flex flex-col gap-1.5">
      {weeks.map(week => {
        const isSelected = week.weekStart === selectedWeek
        const { month, week: weekNum } = weekOfMonth(week.weekStart)
        const wNum = isoWeekNum(week.weekStart)

        return (
          <button
            key={week.weekStart}
            onClick={() => onSelect(week.weekStart)}
            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
              isSelected
                ? 'border-lilac-400 bg-lilac-50 dark:bg-lilac-950'
                : 'border-border bg-card hover:bg-muted'
            }`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-ink-400 shrink-0">W{wNum}</span>
                <span className="text-xs font-medium text-foreground truncate">
                  {month}월 {weekNum}주
                </span>
                {week.isCurrent && (
                  <span className="shrink-0 text-2xs font-semibold px-1.5 py-px rounded-full bg-status-future/15 text-status-future">
                    진행 중
                  </span>
                )}
              </div>
              {isSelected && <ChevronRight size={12} className="text-lilac-500 shrink-0 ml-1" />}
            </div>
            <div className="text-2xs text-ink-400">
              {fmtRange(week.weekStart, week.weekEnd)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
