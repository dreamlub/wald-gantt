'use client'

import { useEffect, useState } from 'react'
import { ClipboardList, Layers, Timer, AlarmClock, Loader2 } from 'lucide-react'
import type { ReviewStatsResponse } from '../_lib/stats-types'
import { EMPTY_REVIEW_STATS } from '../_lib/stats-types'
import { Section, StatCard, DistroBar, RankList, type Segment } from './stats-primitives'

const SOURCE_COLOR: Record<string, string> = {
  daily_report: 'var(--color-tag-issue-dot)',
  weekly: 'var(--color-status-warn)',
  note: 'var(--color-status-future)',
  history: 'var(--color-ink-300)',
}

export function ReviewStats() {
  const [data, setData] = useState<ReviewStatsResponse>(EMPTY_REVIEW_STATS)
  const [loading, setLoading] = useState(true)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true)
    fetch('/api/stats/review')
      .then(r => r.json())
      .then((res: ReviewStatsResponse) => { setData(res); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-ink-300" /></div>
  }

  const { statusTotals } = data
  const total = statusTotals.pending + statusTotals.created + statusTotals.snoozed + statusTotals.ignored
  if (total === 0) {
    return <div className="flex-1 flex items-center justify-center text-sm text-ink-400">검토 후보 데이터가 없습니다</div>
  }

  const statusSegs: Segment[] = [
    { key: 'pending', label: '검토 대기', value: statusTotals.pending, color: 'var(--color-lilac-500)' },
    { key: 'created', label: '생성됨', value: statusTotals.created, color: 'var(--color-mint-500)' },
    { key: 'snoozed', label: '보류', value: statusTotals.snoozed, color: 'var(--color-status-warn)' },
    { key: 'ignored', label: '무시됨', value: statusTotals.ignored, color: 'var(--color-ink-300)' },
  ]
  const sourceSegs: Segment[] = data.bySource.map(s => ({
    key: s.source, label: s.label, value: s.count, color: SOURCE_COLOR[s.source] ?? 'var(--color-ink-300)',
  }))

  return (
    <div data-scrolltop className="flex-1 overflow-y-auto">
      <div className="px-6 py-5">
        <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <StatCard label="검토 대기" value={statusTotals.pending} unit="개" accent="var(--color-lilac-500)" sub={`전체의 ${Math.round(statusTotals.pending / total * 100)}%`} />
          <StatCard label="Task 생성됨" value={statusTotals.created} unit="개" accent="var(--color-mint-500)" />
          <StatCard label="보류" value={statusTotals.snoozed} unit="개" accent="var(--color-status-warn)" />
          <StatCard label="무시됨" value={statusTotals.ignored} unit="개" accent="var(--color-ink-300)" />
          <StatCard label="평균 처리 기간" value={data.avgDwellDays} unit="일" accent="var(--color-status-future)" sub="등록 → 처리" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Section icon={<ClipboardList size={13} className="text-ink-400" />} label="상태 분포">
            <DistroBar segments={statusSegs} />
          </Section>
          <Section icon={<Layers size={13} className="text-ink-400" />} label="입력원별 분포">
            {sourceSegs.length > 0 ? <DistroBar segments={sourceSegs} /> : <div className="text-sm text-ink-400 py-2">데이터 없음</div>}
          </Section>
        </div>

        <Section icon={<Timer size={13} className="text-ink-400" />} label="평균 처리 기간" badge={`${data.avgDwellDays}일`}
          hint="검토 후보 등록부터 처리(생성/보류/무시)까지 걸린 평균 일수">
          <p className="text-sm text-muted-foreground leading-relaxed">
            처리 기간이 길어질수록 검토 대기 큐가 적체됩니다. 현재 대기 {statusTotals.pending}건.
          </p>
        </Section>

        <Section icon={<AlarmClock size={13} className="text-ink-400" />} label="오래 머문 검토 대기 Top" badge={`${statusTotals.pending}개`}
          hint="등록 이후 경과일">
          <RankList
            items={data.pendingAging.map(a => ({ name: a.title, value: a.days, sub: a.brand }))}
            color="var(--color-status-late)" unit="일"
            empty="검토 대기 항목이 없습니다"
          />
        </Section>
      </div>
    </div>
  )
}
