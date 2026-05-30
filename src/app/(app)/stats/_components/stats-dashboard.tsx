'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Activity, Hash, Users, CheckSquare, CalendarClock, Tag as TagIcon, Loader2,
} from 'lucide-react'
import { brandColor } from '@/lib/history-service'
import { addDaysYMD, kstToday } from '@/lib/kst'
import type { StatsResponse } from '../_lib/stats-types'
import { EMPTY_STATS } from '../_lib/stats-types'
import { PRIORITY_META } from '@/app/(app)/slack/_lib/constants'
import {
  Section, StatCard, VolumeBars, CompletedBars, DistroBar, BrandStack, MiniBars, TopList,
  type Segment,
} from './stats-primitives'

const PRESETS = [
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
  { days: 180, label: '180일' },
]

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? `${h}시` : null))

const STATUS_META: { key: 'to-do' | 'in-progress' | 'done' | 'backlog'; label: string; color: string }[] = [
  { key: 'done', label: '완료', color: 'var(--task-status-done)' },
  { key: 'in-progress', label: '진행중', color: 'var(--task-status-in-progress)' },
  { key: 'to-do', label: '할 일', color: 'var(--task-status-todo)' },
  { key: 'backlog', label: '백로그', color: 'var(--task-status-backlog)' },
]

export function StatsDashboard() {
  const [days, setDays] = useState(90)
  const [data, setData] = useState<StatsResponse>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)

  const load = useCallback((d: number) => {
    setLoading(true)
    const to = kstToday()
    const from = addDaysYMD(to, -(d - 1))
    fetch(`/api/stats?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((res: StatsResponse) => { setData(res); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { load(days) }, [days, load])
  /* eslint-enable react-hooks/set-state-in-effect */

  const { totals, todo } = data
  const priSegs: Segment[] = (['high', 'medium', 'low'] as const).map(p => ({
    key: p, label: PRIORITY_META[p].label, value: data.priorityTotals[p], color: PRIORITY_META[p].color,
  }))
  const statusSegs: Segment[] = STATUS_META.map(s => ({ key: s.key, label: s.label, value: todo.statusNow[s.key], color: s.color }))
  const topBrands = data.brandBreakdown.slice(0, 12)

  return (
    <div data-scrolltop className="flex-1 overflow-y-auto">
      <div className="px-6 py-5">
        {/* 헤더 + 기간 선택 */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">메시지 분석</h2>
            <p className="text-sm text-ink-400 mt-0.5">
              {data.range.from && `${data.range.from} ~ ${data.range.to}`} · 분류 메시지 기준 (KST)
            </p>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {PRESETS.map(p => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  days === p.days ? 'bg-card text-foreground shadow-sm' : 'text-ink-400 hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-ink-300" /></div>
        ) : totals.messages === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-ink-400">이 기간에 수집된 데이터가 없습니다</div>
        ) : (
          <>
            {/* 요약 카드 */}
            <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <StatCard label="총 메시지" value={totals.messages} unit="건" accent="var(--color-lilac-500)" sub={`활성 ${totals.activeDays}일`} />
              <StatCard label="일평균" value={totals.avgPerDay} unit="건/일" sub="활성일 기준" />
              <StatCard label="이슈" value={totals.issues} unit="건" accent="var(--color-tag-issue-dot)" sub={`전체의 ${totals.messages ? Math.round(totals.issues / totals.messages * 100) : 0}%`} />
              <StatCard label="활성 브랜드" value={totals.brands} unit="개" />
              <StatCard label="투두 완료" value={totals.todosCompleted} unit="건" accent="var(--task-status-done)" sub={`신규 ${todo.createdInRange}건`} />
              <StatCard label="조회 기간" value={data.range.days} unit="일" />
            </div>

            {/* 일별 메시지 볼륨 */}
            <Section icon={<Activity size={13} className="text-ink-400" />} label="일별 메시지 볼륨" hint="진한 막대 = 이슈 분류">
              <VolumeBars data={data.dailyVolume} />
            </Section>

            {/* 브랜드별 이슈·분류 */}
            <Section icon={<Hash size={13} className="text-ink-400" />} label="브랜드별 이슈·분류" badge={`${data.brandBreakdown.length}개`}
              hint="이슈·의사결정·일정·멘션 순">
              <BrandStack rows={topBrands} brandColor={brandColor} />
            </Section>

            {/* 투두 처리량 */}
            <Section icon={<CheckSquare size={13} className="text-ink-400" />} label="투두 처리량" badge={`완료 ${todo.completedInRange} · 신규 ${todo.createdInRange}`}>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
                <CompletedBars data={todo.daily} />
                <div>
                  <div className="text-3xs font-medium uppercase tracking-wider text-ink-400 mb-2">현재 상태 분포</div>
                  <DistroBar segments={statusSegs} />
                </div>
              </div>
            </Section>

            {/* 요일·시간대 패턴 */}
            <Section icon={<CalendarClock size={13} className="text-ink-400" />} label="요일·시간대 패턴" hint="메시지가 몰리는 시점">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-3xs font-medium uppercase tracking-wider text-ink-400 mb-2">요일별</div>
                  <MiniBars values={data.weekday} labels={WEEKDAY_LABELS} color="var(--color-lilac-500)" />
                </div>
                <div>
                  <div className="text-3xs font-medium uppercase tracking-wider text-ink-400 mb-2">시간대별 (KST)</div>
                  <MiniBars values={data.hourly} labels={HOUR_LABELS} color="var(--color-status-future)" />
                </div>
              </div>
            </Section>

            {/* 우선순위 분포 */}
            <Section icon={<TagIcon size={13} className="text-ink-400" />} label="우선순위 분포">
              <DistroBar segments={priSegs} />
            </Section>

            {/* Top 채널 / 작성자 */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Hash size={13} className="text-ink-400" />} label="활발한 채널" badge={`${data.topChannels.length}개`}>
                <TopList items={data.topChannels} empty="채널 정보 없음" />
              </Section>
              <Section icon={<Users size={13} className="text-ink-400" />} label="작성자 Top" badge={`${data.topAuthors.length}명`}>
                <TopList items={data.topAuthors} empty="작성자 정보 없음" />
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
