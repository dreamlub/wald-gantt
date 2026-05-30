'use client'

import { useState } from 'react'

// ── Section 래퍼 (stats 대시보드 공용) ─────────────────────────
export function Section({
  icon, label, badge, hint, children,
}: {
  icon?: React.ReactNode
  label: string
  badge?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <span className="text-sm font-semibold text-ink-700">{label}</span>
        {badge && <span className="text-sm px-2 py-0.5 rounded-full bg-muted text-ink-400 font-medium">{badge}</span>}
        {hint && <span className="ml-auto text-3xs text-ink-300">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

// ── 요약 통계 카드 ────────────────────────────────────────────
export function StatCard({
  label, value, unit, sub, accent,
}: {
  label: string
  value: number | string
  unit?: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3.5">
      <div className="text-3xs font-medium uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-2xl font-bold leading-none" style={{ color: accent ?? 'var(--foreground)' }}>{value}</span>
        {unit && <span className="text-sm text-ink-400">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-3xs text-ink-400">{sub}</div>}
    </div>
  )
}

// ── 일별 막대 (총 볼륨 + 이슈 하위 세그먼트 + 호버 툴팁) ─────────
export interface VolumePoint {
  date: string
  total: number
  issue: number
  decision: number
  schedule: number
  mention: number
}

export function VolumeBars({ data }: { data: VolumePoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map(d => d.total))
  const active = hover !== null ? data[hover] : null
  // 빈 날이 많아도 축 라벨은 약 6개만 (월/일)
  const tickEvery = Math.max(1, Math.floor(data.length / 6))

  return (
    <div className="bg-card border border-border rounded-lg px-4 pt-3 pb-2">
      <div className="h-6 mb-2 flex items-center text-xs">
        {active ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-ink-600">
            <b className="text-foreground tabular-nums">{active.date}</b>
            <span className="tabular-nums">총 <b className="text-foreground">{active.total}</b>건</span>
            <Dot c="var(--color-tag-issue-dot)" /> 이슈 {active.issue}
            <Dot c="var(--color-tag-decision-dot)" /> 의사결정 {active.decision}
            <Dot c="var(--color-tag-schedule-dot)" /> 일정 {active.schedule}
            <Dot c="var(--color-tag-mention-dot)" /> 멘션 {active.mention}
          </span>
        ) : (
          <span className="text-ink-300">막대에 마우스를 올리면 상세가 표시됩니다 · 진한 부분 = 이슈</span>
        )}
      </div>
      <div className="flex items-end gap-px h-40" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.date}
            className="flex-1 h-full flex items-end min-w-0 cursor-default"
            onMouseEnter={() => setHover(i)}
          >
            <div className="w-full rounded-t-sm relative bg-lilac-200 transition-colors"
              style={{ height: `${(d.total / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.45 }}
            >
              {d.issue > 0 && (
                <div className="absolute bottom-0 left-0 w-full rounded-t-sm"
                  style={{ height: `${(d.issue / Math.max(1, d.total)) * 100}%`, background: 'var(--color-tag-issue-dot)' }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-px mt-1">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center text-5xs text-ink-300 tabular-nums min-w-0 overflow-hidden">
            {i % tickEvery === 0 ? d.date.slice(5) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 투두 완료 막대 (일별) ─────────────────────────────────────
export function CompletedBars({ data }: { data: { date: string; completed: number; created: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map(d => d.completed))
  const active = hover !== null ? data[hover] : null
  const tickEvery = Math.max(1, Math.floor(data.length / 6))
  const hasAny = data.some(d => d.completed > 0)

  return (
    <div className="bg-card border border-border rounded-lg px-4 pt-3 pb-2">
      <div className="h-6 mb-2 flex items-center text-xs">
        {active ? (
          <span className="flex items-center gap-x-3 text-ink-600">
            <b className="text-foreground tabular-nums">{active.date}</b>
            <span><Dot c="var(--task-status-done)" /> 완료 <b className="text-foreground">{active.completed}</b></span>
            <span className="text-ink-400">신규 {active.created}</span>
          </span>
        ) : (
          <span className="text-ink-300">{hasAny ? '막대에 마우스를 올리면 상세가 표시됩니다' : '이 기간에 완료된 투두가 없습니다'}</span>
        )}
      </div>
      <div className="flex items-end gap-px h-28" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 h-full flex items-end min-w-0 cursor-default" onMouseEnter={() => setHover(i)}>
            <div className="w-full rounded-t-sm"
              style={{ height: `${(d.completed / max) * 100}%`, background: 'var(--task-status-done)', opacity: hover === null || hover === i ? 1 : 0.45 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-px mt-1">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center text-5xs text-ink-300 tabular-nums min-w-0 overflow-hidden">
            {i % tickEvery === 0 ? d.date.slice(5) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 가로 스택 분포 바 (우선순위·상태) + 범례 ────────────────────
export interface Segment { key: string; label: string; value: number; color: string }

export function DistroBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  if (total === 0) return <div className="bg-card border border-border rounded-lg px-4 py-6 text-center text-sm text-ink-400">데이터 없음</div>
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3.5">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {segments.map(s => s.value > 0 && (
          <div key={s.key} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label} ${s.value}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-sm">
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            <span className="text-ink-600">{s.label}</span>
            <b className="text-foreground tabular-nums">{s.value}</b>
            <span className="text-ink-300 tabular-nums">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 브랜드별 가로 스택 행 ─────────────────────────────────────
export interface BrandRow { brand: string; total: number; issue: number; decision: number; schedule: number; mention: number }

const BRAND_SEGS: { key: keyof Pick<BrandRow, 'issue' | 'decision' | 'schedule' | 'mention'>; label: string; color: string }[] = [
  { key: 'issue', label: '이슈', color: 'var(--color-tag-issue-dot)' },
  { key: 'decision', label: '의사결정', color: 'var(--color-tag-decision-dot)' },
  { key: 'schedule', label: '일정', color: 'var(--color-tag-schedule-dot)' },
  { key: 'mention', label: '멘션', color: 'var(--color-tag-mention-dot)' },
]

export function BrandStack({ rows, brandColor }: { rows: BrandRow[]; brandColor: (n: string) => string }) {
  const maxTotal = Math.max(1, ...rows.map(r => r.total))
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {rows.map((r, i) => (
        <div key={r.brand} className={`px-4 py-2.5 ${i < rows.length - 1 ? 'border-b border-border' : ''}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: brandColor(r.brand) }} />
              <span className="truncate">{r.brand}</span>
            </span>
            <span className="text-sm text-ink-400 tabular-nums shrink-0">총 {r.total}건</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted" style={{ width: `${(r.total / maxTotal) * 100}%`, minWidth: 24 }}>
            {BRAND_SEGS.map(s => r[s.key] > 0 && (
              <div key={s.key} style={{ width: `${(r[s.key] / r.total) * 100}%`, background: s.color }} title={`${s.label} ${r[s.key]}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 미니 막대 (요일·시간대) ───────────────────────────────────
export function MiniBars({
  values, labels, color, unit = '건',
}: {
  values: number[]
  labels: (string | null)[]
  color: string
  unit?: string
}) {
  const max = Math.max(1, ...values)
  return (
    <div className="bg-card border border-border rounded-lg px-4 pt-3 pb-2">
      <div className="flex items-end gap-1 h-24">
        {values.map((v, i) => (
          <div key={i} className="flex-1 h-full flex items-end min-w-0 group relative" title={`${labels[i] ?? i} · ${v}${unit}`}>
            <div className="w-full rounded-t-sm transition-opacity group-hover:opacity-80"
              style={{ height: `${(v / max) * 100}%`, background: color, minHeight: v > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {labels.map((l, i) => (
          <div key={i} className="flex-1 text-center text-5xs text-ink-300 tabular-nums min-w-0 overflow-hidden">{l ?? ''}</div>
        ))}
      </div>
    </div>
  )
}

// ── Top 리스트 (채널·작성자) ──────────────────────────────────
export function TopList({ items, empty }: { items: { name: string; count: number }[]; empty: string }) {
  const max = Math.max(1, ...items.map(i => i.count))
  if (items.length === 0) return <div className="bg-card border border-border rounded-lg px-4 py-6 text-center text-sm text-ink-400">{empty}</div>
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {items.map((it, i) => (
        <div key={it.name} className={`flex items-center px-3.5 py-2 text-sm ${i < items.length - 1 ? 'border-b border-border' : ''}`}>
          <span className="text-ink-700 truncate min-w-30 max-w-30">{it.name}</span>
          <div className="flex-1 h-1.5 bg-muted rounded-xs mx-3 overflow-hidden">
            <div className="h-full bg-lilac-500 rounded-xs" style={{ width: `${(it.count / max) * 100}%` }} />
          </div>
          <span className="text-ink-400 font-medium min-w-10 text-right tabular-nums">{it.count}건</span>
        </div>
      ))}
    </div>
  )
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full align-middle mr-0.5" style={{ background: c }} />
}
