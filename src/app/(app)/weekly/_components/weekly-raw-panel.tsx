'use client'

import { FileText, X } from 'lucide-react'
import type { WeeklyReport, WeeklyReportSource } from '@/types/index'

// ── WeeklyRawPanel — 선택 주차에 수집된 원본(raw_content)을 팀별로 그대로 보여준다 ──

const SOURCE_LABEL: Record<WeeklyReportSource, string> = {
  outline:  'Outline',
  team_doc: '팀 문서',
  biz_lead: 'Biz Lead',
}

export function WeeklyRawPanel({
  weekStart, reports, onClose,
}: {
  weekStart: string
  reports: WeeklyReport[]
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-overlay" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-[92vw] bg-card border-l border-border z-dialog flex flex-col shadow-xl">
        {/* 패널 헤더 */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
          <FileText size={13} className="text-lilac-500" />
          <span className="flex-1 text-sm font-semibold text-foreground">
            원본 보기 · {weekStart.replace(/-/g, '.')}
          </span>
          <span className="text-sm text-ink-400">{reports.length}건</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* 패널 본문 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {reports.length === 0 ? (
            <p className="text-sm text-ink-400 py-2">이 주차에 수집된 원본이 없습니다.</p>
          ) : (
            reports.map(r => (
              <div key={r.id} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
                  <span className="text-sm font-semibold text-foreground flex-1 truncate">{r.team}</span>
                  <span className="text-4xs font-bold tracking-[0.04em] px-1.5 py-0.5 rounded-2xs bg-card text-ink-500 border border-border">
                    {SOURCE_LABEL[r.source] ?? r.source}
                  </span>
                </div>
                {r.raw_content ? (
                  <pre className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words p-3 font-sans">
                    {r.raw_content}
                  </pre>
                ) : (
                  <p className="text-sm text-ink-400 p-3">원본 내용이 비어 있습니다.</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
