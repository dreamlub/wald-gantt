'use client'

import { useEffect, useState } from 'react'
import { FolderKanban, CalendarClock, Hash, User, Loader2, History } from 'lucide-react'
import type { ProjectStatsResponse } from '../_lib/stats-types'
import { EMPTY_PROJECT_STATS } from '../_lib/stats-types'
import {
  Section, StatCard, DistroBar, RankList, DeadlineList, TopList, type Segment,
} from './stats-primitives'

export function ProjectStats() {
  const [data, setData] = useState<ProjectStatsResponse>(EMPTY_PROJECT_STATS)
  const [loading, setLoading] = useState(true)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true)
    fetch('/api/stats/projects')
      .then(r => r.json())
      .then((res: ProjectStatsResponse) => { setData(res); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const { totals } = data
  const statusSegs: Segment[] = [
    { key: 'in-progress', label: '진행중', value: totals.inProgress, color: 'var(--task-status-in-progress)' },
    { key: 'to-do', label: '대기', value: totals.todo, color: 'var(--task-status-todo)' },
    { key: 'done', label: '완료', value: totals.done, color: 'var(--task-status-done)' },
  ]

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-ink-300" /></div>
  }
  if (totals.total === 0) {
    return <div className="flex-1 flex items-center justify-center text-sm text-ink-400">프로젝트 데이터가 없습니다</div>
  }

  return (
    <div data-scrolltop className="flex-1 overflow-y-auto">
      <div className="px-6 py-5">
        <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <StatCard label="전체 프로젝트" value={totals.total} unit="개" accent="var(--color-lilac-500)" />
          <StatCard label="진행중" value={totals.inProgress} unit="개" accent="var(--task-status-in-progress)" />
          <StatCard label="완료" value={totals.done} unit="개" accent="var(--task-status-done)" />
          <StatCard label="마감 초과" value={totals.overdue} unit="개" accent="var(--color-status-late)" sub="미완료 & 마감 경과" />
          <StatCard label="리스케줄됨" value={totals.rescheduledCount} unit="개" accent="var(--color-status-warn)" sub={`평균 ${totals.avgReschedule}회 변경`} />
        </div>

        <Section icon={<FolderKanban size={13} className="text-ink-400" />} label="상태 분포">
          <DistroBar segments={statusSegs} />
        </Section>

        <Section icon={<History size={13} className="text-ink-400" />} label="일정 리스케줄 Top" badge={`${totals.rescheduledCount}개`}
          hint="마감일 변경 횟수 · 누적 슬립일">
          <RankList
            items={data.reschedule.map(r => ({ name: r.name, value: r.changes, sub: r.slipDays > 0 ? `+${r.slipDays}일` : r.slipDays < 0 ? `${r.slipDays}일` : '±0' }))}
            color="var(--color-status-warn)" unit="회"
            empty="마감일 변경 이력이 없습니다"
          />
        </Section>

        <Section icon={<CalendarClock size={13} className="text-ink-400" />} label="마감 임박·초과" badge={`${data.deadlines.length}개`}
          hint="미완료 프로젝트 · 7일 이내/초과">
          <DeadlineList items={data.deadlines} empty="임박하거나 초과된 마감이 없습니다" />
        </Section>

        <div className="grid grid-cols-2 gap-4">
          <Section icon={<Hash size={13} className="text-ink-400" />} label="카테고리별 (진행중)" badge={`${data.byCategory.length}개`}>
            <TopList items={data.byCategory} empty="카테고리 없음" />
          </Section>
          <Section icon={<User size={13} className="text-ink-400" />} label="PM별 부하 (진행중)" badge={`${data.byPm.length}명`}>
            <TopList items={data.byPm} empty="PM 정보 없음" />
          </Section>
        </div>
      </div>
    </div>
  )
}
