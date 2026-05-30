'use client'

import { useEffect, useState } from 'react'
import { CircleDot, Timer, AlarmClock, Hash, Loader2, Layers } from 'lucide-react'
import type { IssueStatsResponse } from '../_lib/stats-types'
import { EMPTY_ISSUE_STATS } from '../_lib/stats-types'
import {
  Section, StatCard, DistroBar, MiniBars, RankList, type Segment,
} from './stats-primitives'

const TYPE_COLOR: Record<string, string> = {
  issue: 'var(--color-tag-issue-dot)',
  decision: 'var(--color-tag-decision-dot)',
  project: 'var(--color-status-future)',
}

export function IssueStats() {
  const [data, setData] = useState<IssueStatsResponse>(EMPTY_ISSUE_STATS)
  const [loading, setLoading] = useState(true)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true)
    fetch('/api/stats/issues')
      .then(r => r.json())
      .then((res: IssueStatsResponse) => { setData(res); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const { totals } = data
  const statusSegs: Segment[] = [
    { key: 'open', label: '미해결', value: totals.open, color: 'var(--color-status-late)' },
    { key: 'closed', label: '해결', value: totals.closed, color: 'var(--color-ink-300)' },
  ]
  const typeSegs: Segment[] = data.byType.map(t => ({
    key: t.type, label: t.label, value: t.open + t.closed, color: TYPE_COLOR[t.type] ?? 'var(--color-ink-300)',
  }))

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-ink-300" /></div>
  }
  if (totals.total === 0) {
    return <div className="flex-1 flex items-center justify-center text-sm text-ink-400">이슈 데이터가 없습니다</div>
  }

  return (
    <div data-scrolltop className="flex-1 overflow-y-auto">
      <div className="px-6 py-5">
        <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <StatCard label="전체 이슈" value={totals.total} unit="개" accent="var(--color-lilac-500)" />
          <StatCard label="미해결" value={totals.open} unit="개" accent="var(--color-status-late)" sub={`전체의 ${totals.total ? Math.round(totals.open / totals.total * 100) : 0}%`} />
          <StatCard label="해결" value={totals.closed} unit="개" accent="var(--color-ink-300)" />
          <StatCard label="평균 해결" value={totals.avgResolveDays} unit="일" accent="var(--color-status-warn)" sub="처음~마지막 언급" />
          <StatCard label="연결 관계" value={totals.relations} unit="건" sub="인과·연관" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Section icon={<CircleDot size={13} className="text-ink-400" />} label="미해결 vs 해결">
            <DistroBar segments={statusSegs} />
          </Section>
          <Section icon={<Layers size={13} className="text-ink-400" />} label="타입 분포">
            <DistroBar segments={typeSegs} />
          </Section>
        </div>

        <Section icon={<Timer size={13} className="text-ink-400" />} label="해결 소요시간 분포" badge={`${totals.closed}건`}
          hint="해결된 이슈 기준">
          <MiniBars
            values={data.resolutionBuckets.map(b => b.count)}
            labels={data.resolutionBuckets.map(b => b.label)}
            color="var(--color-status-future)" unit="건"
          />
        </Section>

        <Section icon={<AlarmClock size={13} className="text-ink-400" />} label="오래 열린 미해결 이슈 Top" badge={`${totals.open}개`}
          hint="마지막 언급 이후 경과일">
          <RankList
            items={data.aging.map(a => ({ name: a.title, value: a.days, sub: a.brand }))}
            color="var(--color-status-late)" unit="일"
            empty="미해결 이슈가 없습니다"
          />
        </Section>

        <Section icon={<Hash size={13} className="text-ink-400" />} label="브랜드별 미해결 부하" badge={`${data.brandLoad.length}개`}
          hint="미해결 건수 순">
          <RankList
            items={data.brandLoad.map(b => ({ name: b.brand, value: b.open, sub: `해결 ${b.closed}` }))}
            color="var(--color-status-late)" unit="개"
            empty="데이터 없음"
          />
        </Section>
      </div>
    </div>
  )
}
