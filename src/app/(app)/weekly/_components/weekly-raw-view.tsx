'use client'

import { FileText } from 'lucide-react'
import type { WeeklyReport, WeeklyReportSource } from '@/types/index'
import { fmtDatetime } from './weekly-dashboard-parts'

// ── WeeklyRawView — 원문 탭. 수집된 raw_content를 팀별 문서 카드로 인라인 표시 ──

const SOURCE_LABEL: Record<WeeklyReportSource, string> = {
  outline:  'Outline',
  team_doc: '팀 문서',
  biz_lead: 'Biz Lead',
}

/** raw_content 마크다운을 가벼운 블록으로 렌더 (## 헤딩 / **볼드** / 불릿 / 본문) */
function renderLine(line: string, key: number) {
  const t = line.trimEnd()
  if (!t.trim()) return <div key={key} className="h-2" />

  // ## 헤딩
  const h = t.match(/^#{1,3}\s+(.*)$/)
  if (h) {
    return (
      <div key={key} className="text-sm font-bold text-foreground mt-4 mb-1 first:mt-0">
        {inline(h[1])}
      </div>
    )
  }
  // 불릿
  const b = t.match(/^\s*[-*•]\s+(.*)$/)
  if (b) {
    return (
      <div key={key} className="flex gap-2 pl-1 py-0.5">
        <span className="text-ink-300 shrink-0 mt-1.5 w-1 h-1 rounded-full bg-ink-300" />
        <span className="text-sm text-foreground leading-relaxed flex-1">{inline(b[1])}</span>
      </div>
    )
  }
  // 표 구분선 스킵
  if (/^\s*\|?[\s|:-]+\|?\s*$/.test(t) && t.includes('-')) return null

  return <div key={key} className="text-sm text-foreground leading-relaxed py-0.5">{inline(t)}</div>
}

/** **볼드** 인라인 처리 */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/)
    if (m) return <strong key={i} className="font-semibold text-foreground">{m[1]}</strong>
    return <span key={i}>{p}</span>
  })
}

export function WeeklyRawView({ reports }: { reports: WeeklyReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
        <FileText size={36} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">이 주차에 수집된 원본이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {reports.map(r => (
        <article key={r.id} className="rounded-xl border border-border bg-card overflow-hidden">
          {/* 카드 헤더 — Outline · 작성자 · 일시 */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border text-2xs text-ink-400">
            <FileText size={12} className="text-ink-400" />
            <span className="font-medium text-ink-500">{SOURCE_LABEL[r.source] ?? r.source}</span>
            {r.author && <><span>·</span><span>{r.author}</span></>}
            <span>·</span>
            <span className="font-mono">{fmtDatetime(r.updated_at)}</span>
          </div>
          {/* 본문 */}
          <div className="px-5 py-4 border-l-2 border-lilac-300">
            <div className="text-base font-bold text-foreground mb-3">
              {r.team} / 주간업무보고
            </div>
            {r.raw_content
              ? r.raw_content.split('\n').map((ln, i) => renderLine(ln, i))
              : <p className="text-sm text-ink-400">원본 내용이 비어 있습니다.</p>}
          </div>
        </article>
      ))}
    </div>
  )
}
