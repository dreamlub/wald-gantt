'use client'

import { useState } from 'react'
import { FileText, Sparkles, LayoutList, RefreshCw, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import type { WeekData } from './weekly-week-list'
import { WeeklyRawView } from './weekly-raw-view'
import { WeeklySummaryList } from './weekly-summary-list'
import { AISummaryPanel } from './weekly-ai-summary-panel'
import { weekRangeLabel } from '@/lib/week-format'

type Tab = 'raw' | 'summary' | 'insight'

// ── 날짜 유틸 ────────────────────────────────────────────────────
// ISO 주차·주 범위 라벨은 공용 유틸(@/lib/week-format) 사용

function weekOfMonth(isoDate: string) {
  const d = new Date(isoDate + 'T00:00:00')
  return { month: d.getMonth() + 1, week: Math.ceil(d.getDate() / 7) }
}

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  week:            WeekData
  teamColors:      string[]
  reports:         WeeklyReport[]
  insight:         WeeklyInsight | null
  reportsLoading:  boolean
  collecting:      boolean
  onCollect:       () => void
  onPrevWeek?:     () => void
  onNextWeek?:     () => void
  hasPrev?:        boolean
  hasNext?:        boolean
  selectedBrand:   string | null
}

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'raw',     label: '원문',      icon: FileText    },
  { key: 'summary', label: '요약',      icon: LayoutList  },
  { key: 'insight', label: '인사이트',  icon: Sparkles    },
]

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function WeeklyContentTabs({
  week, teamColors, reports, insight, reportsLoading, collecting, onCollect,
  onPrevWeek, onNextWeek, hasPrev, hasNext, selectedBrand,
}: Props) {
  const [activeTab, setActiveTab]     = useState<Tab>('raw')
  const [focusedTeam, setFocusedTeam] = useState<string | null>(null)

  const { month, week: weekNum } = weekOfMonth(week.weekStart)
  const collected = week.teams.filter(t => t.hasData).length
  const total     = week.teams.length
  const allDone   = collected === total && total > 0

  const teamMap = new Map<string, WeeklyReport[]>()
  for (const r of reports) {
    if (!teamMap.has(r.team)) teamMap.set(r.team, [])
    teamMap.get(r.team)!.push(r)
  }

  const visibleReports = focusedTeam && teamMap.has(focusedTeam)
    ? (teamMap.get(focusedTeam) ?? [])
    : reports

  const teamColorMap = new Map(
    week.teams.map((t, i) => [t.label, teamColors[i] ?? 'var(--color-id-indigo)'])
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── 탭 바 + 재수집 버튼 ── */}
      <div className="h-12 flex items-stretch border-b bg-card shrink-0">
        <nav className="flex items-stretch pl-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'border-lilac-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-ink-200'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center pr-3">
          <button
            onClick={onCollect}
            disabled={collecting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
          >
            <RotateCcw size={12} className={collecting ? 'animate-spin' : ''} />
            {collecting ? '수집 중...' : '재수집'}
          </button>
        </div>
      </div>

      {/* ── 컨텍스트 바 ── */}
      <div className="shrink-0 px-4 bg-card border-b border-ink-150">
        {/* 주차 정보 */}
        <div className="h-10 flex items-center gap-2 text-sm text-ink-400">
          <button
            onClick={onPrevWeek}
            disabled={!hasPrev}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-25 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-semibold text-foreground shrink-0">{month}월 {weekNum}주</span>
          <span className="shrink-0">{weekRangeLabel(week.weekStart, week.weekEnd)}</span>
          {week.isCurrent
            ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-status-future/15 text-status-future shrink-0">진행 중</span>
            : allDone
              ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-mint-100 text-mint-600 shrink-0">{total}팀</span>
              : <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 shrink-0">{collected}/{total}팀</span>
          }
          <button
            onClick={onNextWeek}
            disabled={!hasNext}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-25 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* 팀 배지 */}
        <div className="flex items-center gap-1 flex-wrap pb-2 mt-2">
          {week.teams.map((team, i) => {
            const color  = teamColors[i] ?? 'var(--color-id-indigo)'
            const active = focusedTeam === team.label
            return (
              <button
                key={team.id}
                onClick={() => setFocusedTeam(p => p === team.label ? null : team.label)}
                className={`flex items-center gap-1 px-2 py-[3px] rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-foreground text-background'
                    : team.hasData
                      ? 'border border-border text-ink-500 hover:text-foreground hover:bg-muted'
                      : 'border border-dashed border-border text-ink-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? 'white' : color }} />
                {team.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 콘텐츠 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

        {/* 원문 */}
        {activeTab === 'raw' && (
          <div className="p-6">
            {reportsLoading
              ? <div className="flex justify-center py-16"><RefreshCw size={16} className="animate-spin text-ink-400" /></div>
              : <WeeklyRawView reports={visibleReports} teamColorMap={teamColorMap} />
            }
          </div>
        )}

        {/* 요약 */}
        {activeTab === 'summary' && (
          reportsLoading
            ? <div className="flex justify-center py-16"><RefreshCw size={16} className="animate-spin text-ink-400" /></div>
            : <WeeklySummaryList reports={visibleReports} selectedBrand={selectedBrand} />
        )}

        {/* 인사이트 */}
        {activeTab === 'insight' && (
          insight
            ? <AISummaryPanel
                insight={insight}
                reports={reports}
                onClose={() => setActiveTab('summary')}
              />
            : <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Sparkles size={36} strokeWidth={1.5} className="text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground text-center">인사이트가 아직 생성되지 않았습니다.</p>
                <p className="text-xs text-ink-400 text-center">MCP 스킬로 주간보고 요약을 실행해 주세요.</p>
              </div>
        )}

      </div>
    </div>
  )
}
