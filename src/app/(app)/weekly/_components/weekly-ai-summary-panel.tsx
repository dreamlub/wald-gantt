'use client'

import { useState, useCallback } from 'react'
import { Sparkles, RefreshCw, X } from 'lucide-react'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import { analyzeWeekly } from '@/lib/weekly-service'
import { fmtDatetime, ProgressBar, Delta } from './weekly-dashboard-parts'

// ── AISummaryPanel ────────────────────────────────────────────────

export function AISummaryPanel({
  weekStart, insight, reports, onInsightUpdate, onRefresh, onClose,
}: {
  weekStart: string
  insight: WeeklyInsight | null
  reports: WeeklyReport[]
  onInsightUpdate: (i: WeeklyInsight) => void
  onRefresh: () => void
  onClose: () => void
}) {
  const [analyzing, setAnalyzing]         = useState(false)
  const [progress, setProgress]           = useState(0)
  const [slowPhase, setSlowPhase]         = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError]                 = useState<string | null>(null)

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true)
    setError(null)
    setProgress(0)
    setSlowPhase(false)
    setStatusMessage(null)

    let reportsDone = 0
    const totalReports = Math.max(reports.length, 1)

    try {
      const result = await analyzeWeekly(weekStart, (msg) => {
        setStatusMessage(msg)
        if (msg.includes('조회'))         setProgress(10)
        else if (msg.includes('분석 중')) { reportsDone += 1; setProgress(10 + Math.round((reportsDone / totalReports) * 65)) }
        else if (msg.includes('종합'))    { setProgress(80); setSlowPhase(true); requestAnimationFrame(() => requestAnimationFrame(() => setProgress(93))) }
        else if (msg.includes('저장'))    { setSlowPhase(false); setProgress(97) }
      })
      setProgress(100)
      onInsightUpdate(result)
      onRefresh()
      setTimeout(() => { setProgress(0); setStatusMessage(null) }, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 실패')
      setProgress(0)
    } finally {
      setAnalyzing(false)
    }
  }, [weekStart, reports.length, onInsightUpdate, onRefresh])

  const content = insight?.content ?? null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-overlay" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[380px] bg-card border-l border-border z-dialog flex flex-col shadow-xl">
        {/* 패널 헤더 */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
          <Sparkles size={13} className="text-lilac-500" />
          <span className="flex-1 text-sm font-semibold text-foreground">AI 주간 요약</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* 패널 본문 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {analyzing && (
            <ProgressBar progress={progress} slowPhase={slowPhase} statusMessage={statusMessage} />
          )}

          {error && (
            <p className="text-sm text-status-late">{error}</p>
          )}

          {content ? (
            <>
              {content.stats && (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { label: '리포트', ...content.stats.authors },
                    { label: '이슈',   ...content.stats.issues },
                    { label: '결정',   ...content.stats.decisions },
                    { label: '계획',   ...content.stats.plans },
                  ] as { label: string; count: number; delta: number }[]).map(s => (
                    <div key={s.label} className="bg-muted rounded-lg px-3 py-2.5">
                      <p className="text-sm text-ink-500 mb-1.5">{s.label}</p>
                      <div className="flex items-end gap-1.5">
                        <span className="text-base font-bold text-foreground leading-none">{s.count}</span>
                        <Delta delta={s.delta} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <p className="text-sm text-ink-400 mb-1.5 uppercase tracking-wide font-medium">이번 주 요약</p>
                <p className="text-sm leading-relaxed text-foreground">
                  {content.headline.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
                    p.startsWith('**') && p.endsWith('**')
                      ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
                      : <span key={i}>{p}</span>
                  )}
                </p>
              </div>

              {content.changes && (
                <div>
                  <p className="text-sm text-ink-400 mb-1.5 uppercase tracking-wide font-medium">전주 대비</p>
                  <p className="text-sm text-ink-500 leading-relaxed pl-2 border-l-2 border-ink-200">
                    {content.changes}
                  </p>
                </div>
              )}

              <p className="text-sm text-ink-400">
                by Claude · {reports.length}개 보고서
                {insight!.analyzed_at ? ` · ${fmtDatetime(insight!.analyzed_at)}` : ''}
              </p>
            </>
          ) : !analyzing && (
            <p className="text-sm text-ink-400 py-2">
              {reports.length === 0
                ? '수집된 보고서가 없어 분석할 수 없습니다.'
                : '분석하기 버튼을 눌러 AI 요약을 생성하세요.'}
            </p>
          )}
        </div>

        {/* 분석 버튼 */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={handleAnalyze}
            disabled={analyzing || reports.length === 0}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-foreground text-background hover:bg-ink-800 disabled:opacity-60 transition-colors"
          >
            {analyzing ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {analyzing ? '분석 중...' : content ? '다시 분석' : '분석하기'}
          </button>
        </div>
      </div>
    </>
  )
}
