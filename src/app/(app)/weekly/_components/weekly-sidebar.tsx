'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { WeekSection, WeeklyTeam } from '../_lib/types'

interface Props {
  teams: WeeklyTeam[]
  selectedTeam: string
  onSelectTeam: (id: string) => void
  weeks: WeekSection[]
  selectedIso: string
  onSelect: (isoDate: string) => void
}

function getWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  const month = d.getMonth() + 1
  const day = d.getDate()
  const dow = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
  const firstMon = 1 + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow)
  const weekNum = Math.floor((d.getDate() - firstMon) / 7) + 1
  return `${month}월 ${weekNum}주 (${month}/${day}~)`
}

export function WeeklySidebar({
  teams, selectedTeam, onSelectTeam,
  weeks, selectedIso, onSelect,
}: Props) {
  const idx = weeks.findIndex(w => w.isoDate === selectedIso)

  function movePrev() {
    if (idx < weeks.length - 1) onSelect(weeks[idx + 1].isoDate)
  }
  function moveNext() {
    if (idx > 0) onSelect(weeks[idx - 1].isoDate)
  }

  const selected = weeks[idx]

  return (
    <div className="flex flex-col overflow-hidden flex-1 min-h-0">
      {/* 팀 선택 탭 */}
      {teams.length > 1 && (
        <div className="shrink-0 px-2 pt-2 pb-1 border-b border-border">
          <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider px-2 mb-1">팀</div>
          <div className="flex flex-col gap-0.5">
            {teams.map(team => (
              <button
                key={team.id}
                onClick={() => onSelectTeam(team.id)}
                className={`sidebar-btn ${selectedTeam === team.id ? 'sidebar-btn-active' : ''}`}
              >
                <span className="truncate">{team.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 주차 목록 */}
      <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">
        <div className="px-2 mb-1.5 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">주차 선택</div>

        {/* 네비게이터 */}
        {selected && (
          <div className="mx-2 flex items-stretch bg-card border border-border rounded overflow-hidden mb-2">
            <button
              onClick={movePrev}
              disabled={idx >= weeks.length - 1}
              className="w-7 flex items-center justify-center text-ink-400 border-r border-border hover:bg-muted hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={13} />
            </button>
            <div className="flex-1 flex flex-col items-center justify-center py-2 px-1">
              <div className="text-[12px] font-semibold text-foreground">{selected.date}</div>
            </div>
            <button
              onClick={moveNext}
              disabled={idx <= 0}
              className="w-7 flex items-center justify-center text-ink-400 border-l border-border hover:bg-muted hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {weeks.map((w, i) => {
          const isSelected = w.isoDate === selectedIso
          const isLatest = i === 0
          return (
            <button
              key={w.isoDate}
              onClick={() => onSelect(w.isoDate)}
              className={`sidebar-btn ${isSelected ? 'sidebar-btn-active' : ''}`}
            >
              <span className="flex-1 flex items-center gap-1.5 truncate text-left">
                {getWeekLabel(w.isoDate)}
                {isLatest && (
                  <span className="text-[9px] font-bold tracking-[0.04em] px-1 rounded-[2px] bg-lilac-100 text-lilac-600">NEW</span>
                )}
              </span>
            </button>
          )
        })}

        {weeks.length === 0 && (
          <p className="px-2 text-[11px] text-muted-foreground">주간보고가 없어요</p>
        )}
      </div>
    </div>
  )
}
