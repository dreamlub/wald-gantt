'use client'

import { useEffect, useState } from 'react'
import { Filter, GitBranch, Layers, Loader2 } from 'lucide-react'
import type { OverviewStatsResponse } from '../_lib/stats-types'
import { EMPTY_OVERVIEW_STATS } from '../_lib/stats-types'
import { Section, StatCard, DistroBar, type Segment } from './stats-primitives'

const SOURCE_COLOR: Record<string, string> = {
  daily_report: 'var(--color-tag-issue-dot)',
  weekly: 'var(--color-status-warn)',
  note: 'var(--color-status-future)',
  history: 'var(--color-ink-300)',
}

const STAGE_COLOR = ['var(--color-lilac-500)', 'var(--color-status-future)', 'var(--color-status-warn)', 'var(--color-mint-500)']

export function OverviewStats() {
  const [data, setData] = useState<OverviewStatsResponse>(EMPTY_OVERVIEW_STATS)
  const [loading, setLoading] = useState(true)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true)
    fetch('/api/stats/overview')
      .then(r => r.json())
      .then((res: OverviewStatsResponse) => { setData(res); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-ink-300" /></div>
  }

  const max = Math.max(1, ...data.funnel.map(f => f.value))
  const sourceSegs: Segment[] = data.reviewBySource.map(s => ({
    key: s.source, label: s.label, value: s.count, color: SOURCE_COLOR[s.source] ?? 'var(--color-ink-300)',
  }))

  return (
    <div data-scrolltop className="flex-1 overflow-y-auto">
      <div className="px-6 py-5">
        <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <StatCard label="검토 후보 전환율" value={data.conversion.candidateToTask} unit="%" accent="var(--color-mint-500)" sub="후보 → Task" />
          <StatCard label="검토 처리율" value={data.conversion.reviewedRatio} unit="%" accent="var(--color-lilac-500)" sub="pending 제외 비율" />
        </div>

        <Section icon={<Filter size={13} className="text-ink-400" />} label="Signal → Review → Task → Done"
          hint="단계별 누적량 (신호 포착부터 완료까지)">
          <div className="space-y-2.5">
            {data.funnel.map((stage, i) => (
              <div key={stage.key} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-sm text-ink-500">{stage.label}</span>
                <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
                  <div className="h-full rounded flex items-center justify-end px-2"
                    style={{ width: `${Math.max(4, stage.value / max * 100)}%`, backgroundColor: STAGE_COLOR[i] }}>
                    <span className="text-xs font-semibold text-white tabular-nums">{stage.value.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
            {data.funnel.length === 0 && <div className="text-sm text-ink-400 py-4 text-center">데이터가 없습니다</div>}
          </div>
        </Section>

        <Section icon={<Layers size={13} className="text-ink-400" />} label="검토 후보 입력원별 분포" badge={`${sourceSegs.reduce((s, x) => s + x.value, 0)}개`}>
          {sourceSegs.length > 0 ? <DistroBar segments={sourceSegs} /> : <div className="text-sm text-ink-400 py-2">데이터 없음</div>}
        </Section>

        <Section icon={<GitBranch size={13} className="text-ink-400" />} label="해석"
          hint="퍼널이 좁아지는 단계가 병목">
          <p className="text-sm text-muted-foreground leading-relaxed">
            신호 대비 검토 후보화, 후보 대비 Task 전환율을 보면 어느 단계에서 일감이 누락되는지 진단할 수 있습니다.
            전환율이 낮으면 후보 추출 기준이나 검토 처리 속도를 점검하세요.
          </p>
        </Section>
      </div>
    </div>
  )
}
