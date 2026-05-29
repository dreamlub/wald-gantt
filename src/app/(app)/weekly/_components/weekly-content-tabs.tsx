'use client'

import { useState } from 'react'
import { FileText, Sparkles, LayoutList, RefreshCw, CheckSquare } from 'lucide-react'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import type { WeekData } from './weekly-week-list'
import { WeeklyRawView } from './weekly-raw-view'
import { WeeklyDashboard } from './weekly-dashboard'
import { AISummaryPanel } from './weekly-ai-summary-panel'

type Tab = 'status' | 'raw' | 'summary' | 'insight'

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

function weekOfMonth(isoDate: string) {
  const d = new Date(isoDate + 'T00:00:00')
  return { month: d.getMonth() + 1, week: Math.ceil(d.getDate() / 7) }
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`
}

function countBullets(rawContent: string | null): number {
  if (!rawContent) return 0
  return rawContent.split('\n').filter(l => {
    const t = l.trim()
    return t.startsWith('- ') || t.startsWith('* ')
  }).length
}

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  week:            WeekData
  teamColors:      string[]
  reports:         WeeklyReport[]
  insight:         WeeklyInsight | null
  reportsLoading:  boolean
  prevWeekStart:   string
  collecting:      boolean
  onCollect:       () => void
  onAnalyze:       () => void
  analyzing:       boolean
  onInsightUpdate: (i: WeeklyInsight) => void
  onRefresh:       () => void
}

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function WeeklyContentTabs({
  week, teamColors, reports, insight, reportsLoading, prevWeekStart,
  collecting, onCollect, onAnalyze, analyzing, onInsightUpdate, onRefresh,
}: Props) {
  const [activeTab, setActiveTab]   = useState<Tab>('raw')
  const [focusedTeam, setFocusedTeam] = useState<string | null>(null)

  const { month, week: weekNum } = weekOfMonth(week.weekStart)
  const wNum      = isoWeekNum(week.weekStart)
  const collected = week.teams.filter(t => t.hasData).length
  const total     = week.teams.length
  const allDone   = collected === total && total > 0

  // 팀별 리포트 그룹
  const teamMap = new Map<string, WeeklyReport[]>()
  for (const r of reports) {
    if (!teamMap.has(r.team)) teamMap.set(r.team, [])
    teamMap.get(r.team)!.push(r)
  }
  const teamNames     = [...teamMap.keys()]
  const effectiveTeam = focusedTeam && teamNames.includes(focusedTeam) ? focusedTeam : (teamNames[0] ?? null)
  const visibleReports = effectiveTeam ? (teamMap.get(effectiveTeam) ?? []) : reports

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'status',  label: '수집 현황', icon: CheckSquare },
    { key: 'raw',     label: '원문',      icon: FileText    },
    { key: 'summary', label: '요약',      icon: LayoutList  },
    { key: 'insight', label: '인사이트',  icon: Sparkles    },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="shrink-0 px-6 pt-5 flex items-center gap-3">
        <div className="flex items-baseline gap-2 flex-1 min-w-0 flex-wrap">
          <span className="text-sm font-semibold text-ink-400">W{wNum}</span>
          <h2 className="text-base font-semibold text-foreground">{month}월 {weekNum}주</h2>
          <span className="text-sm text-ink-400">{fmtRange(week.weekStart, week.weekEnd)}</span>
          {week.isCurrent
            ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-status-future/15 text-status-future">진행 중</span>
            : allDone
              ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-mint-100 text-mint-600">{total}팀 수집</span>
              : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">{collected}/{total}팀 수집</span>
          }
        </div>
        {!allDone && (
          <button
            onClick={onCollect}
            disabled={collecting}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {collecting ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
            {collecting ? '수집 중...' : '미수집 팀 수집'}
          </button>
        )}
      </div>

      {/* 탭 바 */}
      <div className="shrink-0 flex items-center px-6 mt-4 border-b border-border gap-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-ink-400 hover:text-foreground'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto">

        {/* ── 수집 현황 ── */}
        {activeTab === 'status' && (
          <div className="px-6 py-5 space-y-2 max-w-[800px]">
            {!allDone && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 mb-4 flex items-center justify-between gap-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {total - collected}개 팀의 보고서가 아직 수집되지 않았습니다.
                </p>
                <button
                  onClick={onCollect}
                  disabled={collecting}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  {collecting ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
                  {collecting ? '수집 중...' : '미수집 팀 수집'}
                </button>
              </div>
            )}
            {week.teams.map((team, i) => (
              <div
                key={team.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: teamColors[i] ?? 'var(--color-id-indigo)' }}
                  />
                  <span className="text-sm font-medium text-foreground truncate">{team.label}</span>
                </div>
                {team.hasData ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <FileText size={12} className="text-ink-400" />
                    <span className="text-xs text-ink-400">
                      제출됨{team.itemCount > 0 ? ` · ${team.itemCount}건` : ''}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-status-late shrink-0">미제출</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── 원문 ── */}
        {activeTab === 'raw' && (
          <>
            {teamNames.length > 1 && (
              <div className="sticky top-0 z-10 flex gap-2 px-6 py-3 bg-background border-b border-border overflow-x-auto">
                {teamNames.map(name => {
                  const idx   = week.teams.findIndex(t => t.label === name)
                  const color = teamColors[idx] ?? 'var(--color-id-indigo)'
                  const count = countBullets((teamMap.get(name) ?? [])[0]?.raw_content ?? null)
                  const active = effectiveTeam === name
                  return (
                    <button
                      key={name}
                      onClick={() => setFocusedTeam(name)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-foreground text-background'
                          : 'border border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: active ? 'white' : color }}
                      />
                      {name}
                      {count > 0 && <span className={`text-xs ${active ? 'opacity-70' : 'text-ink-400'}`}>{count}건</span>}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="p-6 max-w-[900px] mx-auto w-full">
              {reportsLoading
                ? <div className="flex justify-center py-16"><RefreshCw size={16} className="animate-spin text-ink-400" /></div>
                : <WeeklyRawView reports={visibleReports} />
              }
            </div>
          </>
        )}

        {/* ── 요약 ── */}
        {activeTab === 'summary' && (
          <div className="p-6 max-w-[1100px] mx-auto w-full">
            {reportsLoading
              ? <div className="flex justify-center py-16"><RefreshCw size={16} className="animate-spin text-ink-400" /></div>
              : <WeeklyDashboard
                  weekStart={week.weekStart}
                  prevWeekStart={prevWeekStart}
                  reports={reports}
                  insight={null}
                  reportsLoading={false}
                  showInsight={false}
                  onCloseInsight={() => {}}
                  onInsightUpdate={onInsightUpdate}
                  onRefresh={onRefresh}
                  showRaw={false}
                  onCloseRaw={() => {}}
                />
            }
          </div>
        )}

        {/* ── 인사이트 ── */}
        {activeTab === 'insight' && (
          insight
            ? <AISummaryPanel
                weekStart={week.weekStart}
                insight={insight}
                reports={reports}
                onInsightUpdate={onInsightUpdate}
                onRefresh={onRefresh}
                onClose={() => setActiveTab('summary')}
              />
            : <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Sparkles size={36} strokeWidth={1.5} className="text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground text-center">
                  AI 인사이트가 아직 생성되지 않았습니다.
                </p>
                <button
                  onClick={onAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  {analyzing ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {analyzing ? 'AI 분석 중...' : 'AI 분석 시작'}
                </button>
              </div>
        )}

      </div>
    </div>
  )
}
