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
  teamColors: string[]  // indexed by sort_order
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
  let count = 0
  for (let day = 1; day <= d.getDate(); day++) {
    if (new Date(d.getFullYear(), d.getMonth(), day).getDay() === 1) count++
  }
  return { month: d.getMonth() + 1, week: count }
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`
}

// ── 컴포넌트 ─────────────────────────────────────────────────────

export function WeeklyWeekList({ weeks, selectedWeek, onSelect, teamColors }: Props) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2 flex flex-col gap-1.5">
      {weeks.map(week => {
        const isSelected = week.weekStart === selectedWeek
        const { month, week: weekNum } = weekOfMonth(week.weekStart)
        const wNum = isoWeekNum(week.weekStart)
        const collected = week.teams.filter(t => t.hasData).length
        const total     = week.teams.length
        const allDone   = collected === total && total > 0
        const noneDone  = collected === 0

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
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-ink-400 shrink-0">W{wNum}</span>
                <span className="text-xs font-medium text-foreground truncate">
                  {month}월 {weekNum}주
                </span>
                {week.isCurrent && (
                  <span className="shrink-0 text-2xs font-semibold px-1.5 py-px rounded-full bg-status-future/15 text-status-future">
                    전행 중
                  </span>
                )}
              </div>
              {isSelected && <ChevronRight size={12} className="text-lilac-500 shrink-0 ml-1" />}
            </div>

            <div className="text-2xs text-ink-400 mb-2">
              {fmtRange(week.weekStart, week.weekEnd)}
            </div>

            {/* 팀 상태 */}
            {week.isCurrent ? (
              /* 현재 주: 팀별 행 */
              <div className="flex flex-col gap-0.5">
                {week.teams.map((team, i) => (
                  <div key={team.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: teamColors[i] ?? 'var(--color-id-indigo)' }}
                      />
                      <span className="text-2xs text-ink-400 truncate">{team.label}</span>
                    </div>
                    <span className={`text-2xs font-medium shrink-0 ml-1 ${
                      team.hasData ? 'text-ink-400' : 'text-status-late'
                    }`}>
                      {team.hasData ? '제출됨' : '미제출'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              /* 과거 주: 컬러 바 + 요약 */
              <div>
                <div className="flex gap-0.5 mb-1 h-1">
                  {week.teams.map((team, i) => (
                    <div
                      key={team.id}
                      className="flex-1 rounded-full transition-opacity"
                      style={{
                        backgroundColor: teamColors[i] ?? 'var(--color-id-indigo)',
                        opacity: team.hasData ? 1 : 0.2,
                      }}
                    />
                  ))}
                </div>
                <div className="text-2xs text-ink-400">
                  {noneDone
                    ? '미수집'
                    : allDone
                      ? `✓ ${total}팀 수집`
                      : `✓ ${collected}팀 수집${total - collected > 0 ? ` ${total - collected}실패` : ''}`
                  }
                </div>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
