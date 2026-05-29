'use client'

import { FileText, RefreshCw, Sparkles, ArrowUpRight } from 'lucide-react'
import type { WeekData } from './weekly-week-list'

interface Props {
  week: WeekData
  teamColors: string[]
  collecting: boolean
  onCollect: () => void
  onOpenAnalysis: () => void
  hasAnalysis: boolean
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

export function WeeklyCollectionDetail({
  week, teamColors, collecting, onCollect, onOpenAnalysis, hasAnalysis,
}: Props) {
  const { month, week: weekNum } = weekOfMonth(week.weekStart)
  const wNum      = isoWeekNum(week.weekStart)
  const collected = week.teams.filter(t => t.hasData).length
  const total     = week.teams.length
  const allDone   = collected === total && total > 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 주차 헤더 */}
      <div className="shrink-0 px-6 pt-5 pb-4 flex items-center gap-3 border-b border-border">
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold text-ink-400">W{wNum}</span>
          <h2 className="text-base font-semibold text-foreground">
            {month}월 {weekNum}주
          </h2>
          <span className="text-sm text-ink-400">{fmtRange(week.weekStart, week.weekEnd)}</span>
          {week.isCurrent && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-status-future/15 text-status-future">
              전행 중
            </span>
          )}
          {!week.isCurrent && allDone && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-mint-100 text-mint-600">
              수집 완료
            </span>
          )}
        </div>

        {/* 분석 버튼 */}
        {hasAnalysis && (
          <button
            onClick={onOpenAnalysis}
            className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-ink-800 transition-colors"
          >
            <Sparkles size={11} />
            AI 요약
            <ArrowUpRight size={11} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* 수집 배너 */}
        {!allDone && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2 min-w-0">
                <FileText size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-0.5">
                    {collected === 0
                      ? '아직 수집되지 않은 주차입니다'
                      : `${total - collected}개 팀이 미수집입니다`
                    }
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    팀별 주간보고를 Outline에서 수집하면 요약·인사이트를 분석할 수 있습니다.
                  </p>
                </div>
              </div>
              <button
                onClick={onCollect}
                disabled={collecting}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
              >
                {collecting
                  ? <RefreshCw size={12} className="animate-spin" />
                  : <FileText size={12} />
                }
                {collecting ? '수집 중...' : '이 주차 수집'}
              </button>
            </div>
          </div>
        )}

        {/* 팀별 문서 제출 현황 */}
        {total > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3">
              팀별 문서 제출 현황
            </p>
            <div className="flex flex-col gap-1.5">
              {week.teams.map((team, i) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: teamColors[i] ?? 'var(--color-id-indigo)' }}
                    />
                    <span className="text-sm font-medium text-foreground truncate">
                      {team.label}
                    </span>
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
          </div>
        )}

        {/* 팀이 없을 때 */}
        {total === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <FileText size={36} strokeWidth={1.5} className="text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground">
              연동된 팀이 없습니다.
            </p>
            <a
              href="/settings?section=weekly"
              className="text-xs text-lilac-600 hover:underline"
            >
              설정에서 팀 추가하기
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
