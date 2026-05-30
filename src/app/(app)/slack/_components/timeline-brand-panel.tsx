'use client'

import { AlertCircle, Clock, TrendingUp, Inbox, MousePointerClick } from 'lucide-react'
import { TimelineViewSwitch } from './timeline-view-switch'
import type { BrandTimelineStat } from '@/app/api/brands/timeline/route'
interface Props {
  brandId: string | 'all'
  stats: BrandTimelineStat | null
}

export function TimelineBrandPanel({ brandId, stats }: Props) {
  // 전체 보기 — 브랜드 미선택 안내
  if (brandId === 'all') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-ink-50 flex items-center justify-center">
          <MousePointerClick size={22} className="text-ink-300" />
        </div>
        <p className="text-sm font-semibold text-foreground">브랜드를 선택해 주세요</p>
        <p className="text-xs text-ink-400">타임라인은 브랜드별로 확인할 수 있습니다.</p>
      </div>
    )
  }

  // 아직 stats 로딩 중
  if (!stats) {
    return <TimelineViewSwitch brandFilter={brandId} />
  }

  // 이슈 있으면 바로 트래커
  if (stats.issue_count > 0) {
    return <TimelineViewSwitch brandFilter={brandId} />
  }

  // 조건 미충족
  if (!stats.eligible) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-ink-50 flex items-center justify-center">
          <AlertCircle size={22} className="text-ink-300" />
        </div>
        <div>
          <p className="text-base font-semibold text-ink mb-1">{brandId}</p>
          <p className="text-sm text-ink-400">타임라인 생성 조건 미충족</p>
        </div>
        <div className="bg-muted rounded-xl px-6 py-4 text-left space-y-3 w-full max-w-sm">
          <Stat
            icon={<TrendingUp size={13} />}
            label="위클리 리포트"
            value={`${stats.weekly_count}주`}
            ok={stats.weekly_count >= 4}
            need="최소 4주"
          />
          <Stat
            icon={<Clock size={13} />}
            label="데일리 메시지"
            value={`${stats.daily_count}건`}
            ok={stats.daily_count >= 30}
            need="최소 30건"
          />
        </div>
        <p className="text-2xs text-ink-300 max-w-xs leading-relaxed">
          {stats.weekly_count === 0
            ? 'classify 스킬로 슬랙 메시지를 분류하면 위클리 리포트가 쌓입니다.'
            : '데이터가 더 쌓이면 /brand-timeline 스킬로 타임라인을 생성할 수 있습니다.'}
        </p>
      </div>
    )
  }

  // 조건 충족 but 이슈 없음
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-ink-50 flex items-center justify-center">
        <Inbox size={22} className="text-ink-300" />
      </div>
      <div>
        <p className="text-base font-semibold text-ink mb-1">{brandId}</p>
        <p className="text-sm text-ink-400">타임라인이 아직 생성되지 않았습니다</p>
      </div>
      <div className="bg-muted rounded-xl px-6 py-4 text-left space-y-3 w-full max-w-sm">
        <Stat
          icon={<TrendingUp size={13} />}
          label="위클리 리포트"
          value={`${stats.weekly_count}주`}
          ok
          need=""
        />
        <Stat
          icon={<Clock size={13} />}
          label="데일리 메시지"
          value={`${stats.daily_count}건`}
          ok
          need=""
        />
      </div>
      <p className="text-2xs text-ink-300 max-w-xs leading-relaxed">
        데이터가 충분합니다.{' '}
        <code className="bg-ink-100 px-1 py-0.5 rounded text-ink-500">/brand-timeline {brandId}</code>
        를 실행하면 타임라인을 생성할 수 있습니다.
      </p>
    </div>
  )
}

function Stat({
  icon, label, value, ok, need,
}: {
  icon: React.ReactNode
  label: string
  value: string
  ok: boolean
  need: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={ok ? 'text-status-ok' : 'text-status-warn'}>{icon}</span>
      <span className="text-2xs text-ink-500 flex-1">{label}</span>
      <span className={`text-2xs font-semibold ${ok ? 'text-ink' : 'text-status-warn'}`}>{value}</span>
      {!ok && need && (
        <span className="text-3xs text-ink-300">({need})</span>
      )}
    </div>
  )
}
