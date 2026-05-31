'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import type { WeeklyReport, WeeklyReportSummary, WeeklyReportItem } from '@/types/index'
import { ASSIGNEE_COLORS } from '@/app/(app)/tasks/_constants'
import { SectionDivider } from '@/app/(app)/slack/_components/sidebar-date-panels'

// ── 유틸 ─────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff
  return Math.abs(h)
}

function colorFor(s: string): string {
  return ASSIGNEE_COLORS[hashStr(s) % ASSIGNEE_COLORS.length]
}

export function fmtDatetime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── 타입 & 상수 ───────────────────────────────────────────────────

export type ChangeKey = 'new' | 'continued' | 'completed' | 'blocked' | 'dropped'
export type FilterKey = 'all' | ChangeKey
export type TypeKey   = 'all' | 'issue' | 'decision' | 'plan'

const TYPE_TABS: { key: TypeKey; label: string }[] = [
  { key: 'all',      label: '전체' },
  { key: 'issue',    label: '이슈' },
  { key: 'decision', label: '결정' },
  { key: 'plan',     label: '계획' },
]

const CHANGE_META: Record<ChangeKey, {
  label: string
  sectionLabel: string
  dotCls: string
  badgeCls: string
}> = {
  new:       { label: '신규',   sectionLabel: '신규',               dotCls: 'bg-lilac-500',      badgeCls: 'bg-lilac-100 text-lilac-600' },
  continued: { label: '진행중', sectionLabel: '진행중',             dotCls: 'bg-status-future',  badgeCls: 'bg-status-future/10 text-status-future' },
  completed: { label: '완료',   sectionLabel: '완료',               dotCls: 'bg-mint-500',       badgeCls: 'bg-mint-100 text-mint-500' },
  blocked:   { label: '블로킹', sectionLabel: '블로킹',             dotCls: 'bg-status-late',    badgeCls: 'bg-status-late/10 text-status-late' },
  dropped:   { label: '미언급', sectionLabel: '미언급 (전주 대비)', dotCls: 'bg-status-warn',    badgeCls: 'bg-status-warn/10 text-status-warn' },
}

export const SECTION_ORDER: ChangeKey[] = ['new', 'continued', 'completed', 'blocked', 'dropped']

// ── 아이템 조립 ───────────────────────────────────────────────────

export type EnrichedItem = WeeklyReportItem & {
  _team: string
  _author: string | null
  change: ChangeKey
}

export function assembleItems(reports: WeeklyReport[]): EnrichedItem[] {
  const result: EnrichedItem[] = []
  for (const r of reports) {
    const summary = r.summary as unknown as WeeklyReportSummary | null
    for (const item of summary?.items ?? []) {
      result.push({
        ...item,
        change: (item.change as ChangeKey | null | undefined) ?? 'new',
        _team: r.team,
        _author: r.author,
      })
    }
    for (const dropped of summary?.diff_summary?.dropped_items ?? []) {
      result.push({
        ...dropped,
        change: 'dropped' as const,
        type: (dropped.type ?? 'plan') as 'issue' | 'decision' | 'plan',
        detail: dropped.detail ?? '',
        date: dropped.date ?? null,
        _team: r.team,
        _author: r.author,
      })
    }
  }
  return result
}

// ── StatusChip ────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  in_progress: '진행중',
  completed:   '완료',
  blocked:     '블로킹',
  pending:     '대기',
}

function StatusChip({ status, dim }: { status: string | null; dim?: boolean }) {
  if (!status) return null
  const label = STATUS_LABEL[status] ?? status
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-xs ${
      dim
        ? 'bg-ink-100 text-ink-400 line-through'
        : status === 'completed' ? 'bg-mint-100 text-mint-500'
        : status === 'blocked'   ? 'bg-status-late/10 text-status-late'
        : status === 'in_progress' ? 'bg-status-future/10 text-status-future'
        : 'bg-muted text-ink-500'
    }`}>
      {label}
    </span>
  )
}

// ── ItemCard ──────────────────────────────────────────────────────

function ItemCard({ item, compareMode }: { item: EnrichedItem; compareMode: boolean }) {
  const meta = CHANGE_META[item.change]
  const displayName = item.assignee ?? item._author
  const hasCompareDiff = compareMode && item.change !== 'new' && item.change !== 'dropped'
  const statusChanged = hasCompareDiff && item.prev_status && item.status && item.prev_status !== item.status
  const titleChanged  = hasCompareDiff && item.prev_title && item.prev_title !== item.title

  return (
    <div className={`bg-card border rounded-lg p-3.5 flex flex-col gap-2 hover:border-ink-300 transition-colors ${
      compareMode && item.change === 'new'     ? 'border-lilac-300 ring-1 ring-lilac-100' :
      compareMode && item.change === 'dropped' ? 'border-status-warn/30 bg-status-warn/5' :
      compareMode && item.change === 'blocked' ? 'border-status-late/30' :
      'border-border'
    }`}>
      {/* 헤더: 브랜드 + 담당자 */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-foreground leading-snug">
          {item.brand ?? item.title}
        </span>
        {displayName && (
          <span className="text-sm text-ink-400 shrink-0 flex items-center gap-1 mt-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: colorFor(displayName) }}
            />
            {displayName}
          </span>
        )}
      </div>

      {/* 제목 (brand와 다를 때) */}
      {item.brand && item.title !== item.brand && (
        <p className="text-sm font-medium text-ink-600 -mt-1">{item.title}</p>
      )}

      {/* 상세 */}
      {item.detail && (
        <p className="text-sm text-ink-500 leading-relaxed">{item.detail}</p>
      )}

      {/* 블로킹 사유 */}
      {item.change === 'blocked' && item.block_reason && (
        <div className="text-sm text-status-late bg-status-late/10 border border-status-late/20 rounded px-2 py-1 leading-snug">
          블로킹 사유 {item.block_reason}
        </div>
      )}

      {/* 전주 비교 모드: 상태 전환 표시 */}
      {compareMode && item.change === 'new' && (
        <div className="flex items-center gap-1.5 text-sm text-ink-400">
          <span className="italic">없음</span>
          <span>→</span>
          <span className="font-medium text-lilac-600">신규 등록</span>
        </div>
      )}

      {compareMode && item.change === 'dropped' && (
        <div className="flex items-center gap-1.5 text-sm text-status-warn">
          <StatusChip status={item.prev_status ?? null} dim />
          <span>→</span>
          <span className="font-medium">이번 주 미언급</span>
        </div>
      )}

      {hasCompareDiff && (statusChanged || titleChanged) && (
        <div className="flex flex-col gap-1 bg-muted rounded px-2 py-1.5 -mx-0.5">
          {titleChanged && (
            <p className="text-sm text-ink-400 leading-snug">
              <span className="text-ink-300">이전 제목</span> {item.prev_title}
            </p>
          )}
          {statusChanged && (
            <div className="flex items-center gap-1.5">
              <StatusChip status={item.prev_status ?? null} dim />
              <span className="text-xs text-ink-300">→</span>
              <StatusChip status={item.status ?? null} />
            </div>
          )}
        </div>
      )}

      {/* compareMode + continued이지만 변경사항 없음 */}
      {hasCompareDiff && !statusChanged && !titleChanged && item.change === 'continued' && (
        <p className="text-sm text-ink-300 italic">전주와 동일</p>
      )}

      {/* 태그 */}
      <div className="flex gap-1.5 flex-wrap mt-auto pt-0.5">
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-xs ${meta.badgeCls}`}>
          {meta.label}
        </span>
        {item.task_type ? (
          <span className="text-xs px-1.5 py-0.5 rounded-xs bg-ink-100 text-ink-500">
            {item.task_type}
          </span>
        ) : item.type ? (
          <span className="text-xs px-1.5 py-0.5 rounded-xs bg-ink-100 text-ink-500">
            {item.type === 'issue' ? '이슈' : item.type === 'decision' ? '결정' : '계획'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ── ChangeSection ──────────────────────────────────────────────────

export function ChangeSection({ changeKey, items, compareMode }: {
  changeKey: ChangeKey
  items: EnrichedItem[]
  compareMode: boolean
}) {
  if (items.length === 0) return null
  const meta = CHANGE_META[changeKey]
  return (
    <section className="mb-6">
      <div className="mb-3">
        <SectionDivider label={meta.sectionLabel} count={items.length} dotClass={meta.dotCls} border={false} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, i) => (
          <ItemCard key={i} item={item} compareMode={compareMode} />
        ))}
      </div>
    </section>
  )
}

// ── TypeTab ───────────────────────────────────────────────────────

export function TypeTab({
  typeFilter,
  onTypeFilterChange,
  typeCounts,
}: {
  typeFilter: TypeKey
  onTypeFilterChange: (t: TypeKey) => void
  typeCounts: Record<TypeKey, number>
}) {
  return (
    <div className="flex items-center gap-1 mb-4 border-b border-border">
      {TYPE_TABS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onTypeFilterChange(typeFilter === key ? 'all' : key)}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            typeFilter === key
              ? 'border-lilac-500 text-lilac-600 dark:text-lilac-400'
              : 'border-transparent text-ink-400 hover:text-foreground'
          }`}
        >
          {label}
          <span className={`ml-1.5 text-xs ${typeFilter === key ? 'text-lilac-500' : 'text-ink-300'}`}>
            {typeCounts[key]}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── FilterBar ─────────────────────────────────────────────────────

export function FilterBar({
  compareMode,
  onCompareModeChange,
  filter,
  onFilterChange,
  counts,
}: {
  compareMode: boolean
  onCompareModeChange: (v: boolean) => void
  filter: FilterKey
  onFilterChange: (f: FilterKey) => void
  counts: Record<FilterKey, number>
}) {
  const pills: { key: FilterKey; label: string; dotCls?: string }[] = [
    { key: 'all',       label: '전체' },
    { key: 'new',       label: '신규',   dotCls: 'bg-lilac-500' },
    { key: 'continued', label: '진행중', dotCls: 'bg-status-future' },
    { key: 'completed', label: '완료',   dotCls: 'bg-mint-500' },
    { key: 'blocked',   label: '블로킹', dotCls: 'bg-status-late' },
    { key: 'dropped',   label: '미언급', dotCls: 'bg-status-warn' },
  ]

  return (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      {/* 전주 비교 모드 토글 */}
      <button
        role="switch"
        aria-checked={compareMode}
        onClick={() => onCompareModeChange(!compareMode)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
          compareMode ? 'bg-lilac-500' : 'bg-ink-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform ${
            compareMode ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span className={`text-sm shrink-0 ${compareMode ? 'text-lilac-600 font-medium' : 'text-ink-500'}`}>전주 비교 모드</span>

      <div className="w-px h-4 bg-border shrink-0" />

      {/* 필터 pills */}
      {pills.map(p => {
        const active = filter === p.key
        const count = counts[p.key]
        return (
          <button
            key={p.key}
            onClick={() => onFilterChange(active ? 'all' : p.key)}
            className={`flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full border transition-colors ${
              active
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card text-ink-500 border-border hover:border-ink-400 hover:text-foreground'
            }`}
          >
            {p.dotCls && (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dotCls}`} />
            )}
            {p.label}
            <span className={`font-medium ${active ? '' : 'text-ink-400'}`}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────

export function ProgressBar({ progress, slowPhase, statusMessage }: {
  progress: number
  slowPhase: boolean
  statusMessage: string | null
}) {
  return (
    <div>
      <div className="relative h-px3 rounded-full bg-ink-100 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 h-full bg-lilac-500"
          style={{
            width: `${progress}%`,
            transition: progress === 0 ? 'none'
              : slowPhase ? 'width 18s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'width 0.5s ease-out',
          }}
        />
      </div>
      {statusMessage && <p className="text-sm text-ink-400 mt-1.5">{statusMessage}</p>}
    </div>
  )
}

// ── Delta ─────────────────────────────────────────────────────────

export function Delta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-sm text-ink-400">—</span>
  const up = delta > 0
  return (
    <span className={`text-sm font-medium flex items-center gap-0.5 ${up ? 'text-mint-500' : 'text-status-late'}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{delta}
    </span>
  )
}
