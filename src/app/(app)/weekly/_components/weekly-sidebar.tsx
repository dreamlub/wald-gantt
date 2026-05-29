'use client'

import { CloudDownload, RefreshCw, ChevronRight, Check } from 'lucide-react'
import type { WeeklyTeam } from '../_lib/types'
import type { WeeklyReport } from '@/types/index'
import { teamColor } from '../_lib/team-colors'

interface Props {
  teams: WeeklyTeam[]
  weeks: string[]                                  // week_start 'YYYY-MM-DD' 내림차순
  byWeek: Map<string, Map<string, WeeklyReport>>   // week → teamLabel → report
  selectedIso: string
  focusedTeam: string | null                       // 현재 선택된 팀(label) — 다크 하이라이트
  onSelect: (weekStart: string) => void            // 주차 선택 (전체 원본)
  onSelectTeam: (weekStart: string, teamLabel: string) => void  // 주차+팀 원본
  onCollectTeam: (team: WeeklyTeam) => void
  collectingTeamId: string | null
  collectDisabled: boolean
}

/** raw_content에서 항목(불릿) 수를 대략 집계 — 사이드바 'N 건' 표기용 */
function countItems(report: WeeklyReport | undefined): number {
  if (!report?.raw_content) return 0
  const bullets = report.raw_content.split('\n').filter(l => /^\s*[-*•]\s+\S/.test(l)).length
  return bullets
}

/** 'YYYY-MM-DD' → { wk: 'W22', label: '5월 4주', range: '5/25 – 5/31' } */
function weekMeta(iso: string): { wk: string; label: string; range: string } {
  const d = new Date(iso + 'T00:00:00')
  const end = new Date(d); end.setDate(d.getDate() + 6)
  const month = d.getMonth() + 1
  // 해당 월의 몇 번째 주(월요일 기준)
  const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
  const firstMon = 1 + (firstDow === 0 ? 1 : firstDow === 1 ? 0 : 8 - firstDow)
  const weekNum = Math.max(1, Math.floor((d.getDate() - firstMon) / 7) + 1)
  // ISO 주차 번호 (Wxx)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const isoWeek = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  const md = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`
  return { wk: `W${isoWeek}`, label: `${month}월 ${weekNum}주`, range: `${md(d)} – ${md(end)}` }
}

export function WeeklySidebar({
  teams, weeks, byWeek, selectedIso, focusedTeam, onSelect, onSelectTeam,
  onCollectTeam, collectingTeamId, collectDisabled,
}: Props) {
  const totalTeams = teams.length

  return (
    <div className="flex flex-col overflow-hidden flex-1 min-h-0">
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border">
        <div className="text-sm font-semibold text-foreground">수집 현황</div>
        <div className="text-2xs text-ink-400 mt-0.5">
          최근 {weeks.length}주차 · {weeks.length}주 수집됨
        </div>
      </div>

      {/* 주차 카드 목록 */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto flex-1 min-h-0">
        {weeks.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground text-center">수집된 주간보고가 없어요</p>
        )}

        {weeks.map((w, wi) => {
          const meta = weekMeta(w)
          const teamMap = byWeek.get(w) ?? new Map<string, WeeklyReport>()
          const collectedCount = teams.filter(t => teamMap.has(t.label)).length
          const isLatest = wi === 0
          const isSelected = w === selectedIso
          const expanded = isLatest || isSelected

          if (expanded) {
            // 펼침 카드 — 팀별 제출 상태
            return (
              <div
                key={w}
                className={`rounded-lg border bg-card overflow-hidden ${isSelected ? 'border-lilac-400 ring-1 ring-lilac-200' : 'border-border'}`}
              >
                <button
                  onClick={() => onSelect(w)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted transition-colors text-left"
                >
                  <span className="text-sm font-bold text-foreground">{meta.wk}</span>
                  <span className="text-xs text-ink-500">{meta.label}</span>
                  {isLatest && (
                    <span className="text-4xs font-bold tracking-[0.04em] px-1.5 py-0.5 rounded-2xs bg-lilac-100 text-lilac-600">진행 중</span>
                  )}
                  <ChevronRight size={13} className="ml-auto text-ink-300" />
                </button>
                <div className="px-3 pb-1 text-2xs text-ink-400">{meta.range}</div>
                <div className="flex flex-col py-1">
                  {teams.map((t, ti) => {
                    const report = teamMap.get(t.label)
                    const submitted = !!report
                    const active = isSelected && focusedTeam === t.label
                    const n = countItems(report)
                    return (
                      <button
                        key={t.id}
                        onClick={() => submitted ? onSelectTeam(w, t.label) : undefined}
                        disabled={!submitted}
                        className={`flex items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:cursor-default ${
                          active
                            ? 'bg-foreground text-background'
                            : 'hover:bg-muted disabled:hover:bg-transparent'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: teamColor(ti) }} />
                        <span className={`flex-1 text-sm truncate ${active ? 'text-background font-medium' : 'text-foreground'}`}>{t.label}</span>
                        {submitted ? (
                          <span className={`text-2xs ${active ? 'text-background/70' : 'text-ink-400'}`}>{n > 0 ? `${n} 건` : '제출됨'}</span>
                        ) : (
                          <span className="text-2xs font-semibold text-status-late">미제출</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          }

          // 접힘 카드 — 색 막대 + N팀 수집
          return (
            <button
              key={w}
              onClick={() => onSelect(w)}
              className="rounded-lg border border-border bg-card hover:border-lilac-300 transition-colors px-3 py-2.5 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{meta.wk}</span>
                <span className="text-xs text-ink-500">{meta.label}</span>
              </div>
              <div className="text-2xs text-ink-400 mt-0.5">{meta.range}</div>
              <div className="flex gap-1 mt-2">
                {teams.map((t, ti) => (
                  <span
                    key={t.id}
                    className="h-1.5 flex-1 rounded-full"
                    style={{ background: teamMap.has(t.label) ? teamColor(ti) : 'var(--color-ink-150)' }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1 mt-1.5 text-2xs text-ink-400">
                <Check size={11} className="text-mint-500" />
                {collectedCount}팀 수집
                {collectedCount < totalTeams && (
                  <span className="text-status-late ml-1">{totalTeams - collectedCount} 미제출</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* 팀별 수집 버튼 (하단) */}
      {teams.length > 0 && (
        <div className="shrink-0 px-2 py-2 border-t border-border">
          <div className="px-2 mb-1 text-2xs font-semibold text-ink-400 uppercase tracking-wider">팀별 수집</div>
          <div className="flex flex-wrap gap-1 px-1">
            {teams.map((t, ti) => {
              const collecting = collectingTeamId === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => onCollectTeam(t)}
                  disabled={collectDisabled}
                  title={`${t.label} 수집`}
                  className="flex items-center gap-1 px-2 py-1 rounded text-2xs text-ink-500 hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: teamColor(ti) }} />
                  <span className="truncate max-w-[72px]">{t.label}</span>
                  {collecting
                    ? <RefreshCw size={10} className="animate-spin shrink-0" />
                    : <CloudDownload size={10} className="shrink-0" />
                  }
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
