'use client'

import { Sparkles, X } from 'lucide-react'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import { fmtDatetime, Delta } from './weekly-dashboard-parts'

// ── AISummaryPanel ────────────────────────────────────────────────

export function AISummaryPanel({
  insight, reports, onClose, inline = false,
}: {
  insight: WeeklyInsight | null
  reports: WeeklyReport[]
  onClose?: () => void
  inline?: boolean
}) {
  const content = insight?.content ?? null

  const body = (
    <div className={inline ? 'space-y-4' : 'flex-1 overflow-y-auto p-4 space-y-4'}>
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
      ) : (
        <p className="text-sm text-ink-400 py-2">
          {reports.length === 0
            ? '수집된 보고서가 없습니다.'
            : '외부 요약 분석 완료 후 표시됩니다.'}
        </p>
      )}
    </div>
  )

  if (inline) {
    return <div className="w-full">{body}</div>
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-overlay" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[23.75rem] bg-card border-l border-border z-dialog flex flex-col shadow-xl">
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
        {body}
      </div>
    </>
  )
}
