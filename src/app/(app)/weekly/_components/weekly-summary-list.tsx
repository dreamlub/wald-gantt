'use client'

import { useState } from 'react'
import type { WeeklyReport, WeeklyReportItem, WeeklyReportSummary } from '@/types/index'

// ── 타입 & 상수 ───────────────────────────────────────────────────

type ChangeKey = 'new' | 'continued' | 'completed' | 'blocked' | 'dropped'
type TypeKey   = 'issue' | 'decision' | 'plan'

interface EnrichedItem extends WeeklyReportItem {
  _team:  string
  change: ChangeKey
}

const CHANGE_META: Record<ChangeKey, { label: string; dot: string; badge: string }> = {
  new:       { label: '신규',   dot: 'bg-lilac-500',     badge: 'bg-lilac-100 text-lilac-600 dark:bg-lilac-900/30 dark:text-lilac-400' },
  continued: { label: '진행중', dot: 'bg-status-future', badge: 'bg-status-future/10 text-status-future' },
  completed: { label: '완료',   dot: 'bg-mint-500',      badge: 'bg-mint-100 text-mint-600 dark:bg-mint-900/20 dark:text-mint-400' },
  blocked:   { label: '블로킹', dot: 'bg-status-late',   badge: 'bg-status-late/10 text-status-late' },
  dropped:   { label: '미언급', dot: 'bg-status-warn',   badge: 'bg-status-warn/10 text-status-warn' },
}

const TYPE_LABEL: Record<TypeKey, string> = {
  issue: '이슈', decision: '결정', plan: '계획',
}

const CHANGE_ORDER: ChangeKey[] = ['blocked', 'new', 'continued', 'completed', 'dropped']

const NO_BRAND = '기타'

// 브랜드 고유 색상 — 이름 해시로 팔레트에서 일관되게 선택
const BRAND_PALETTE = [
  'var(--color-id-indigo)',
  'var(--color-id-purple)',
  'var(--color-id-teal)',
  'var(--color-id-green)',
  'var(--color-id-amber)',
  'var(--color-id-pink)',
  'var(--color-id-blue)',
  'var(--color-id-orange)',
]

function brandColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return BRAND_PALETTE[h % BRAND_PALETTE.length]
}

// ── 데이터 조립 ───────────────────────────────────────────────────

function assembleItems(reports: WeeklyReport[]): EnrichedItem[] {
  const result: EnrichedItem[] = []
  for (const r of reports) {
    const summary = r.summary as unknown as WeeklyReportSummary | null
    for (const item of summary?.items ?? []) {
      result.push({ ...item, change: (item.change as ChangeKey) ?? 'continued', _team: r.team })
    }
    for (const dropped of summary?.diff_summary?.dropped_items ?? []) {
      result.push({
        ...dropped,
        change: 'dropped',
        type:   (dropped.type ?? 'plan') as TypeKey,
        detail: dropped.detail ?? '',
        date:   dropped.date ?? null,
        _team:  r.team,
      })
    }
  }
  result.sort((a, b) => CHANGE_ORDER.indexOf(a.change) - CHANGE_ORDER.indexOf(b.change))
  return result
}

function brandOf(item: EnrichedItem): string {
  return item.brand ?? NO_BRAND
}

// ── ItemRow ───────────────────────────────────────────────────────

function ItemRow({ item, expanded, onToggle }: {
  item:     EnrichedItem
  expanded: boolean
  onToggle: () => void
}) {
  const cm = CHANGE_META[item.change]
  const tl = TYPE_LABEL[item.type as TypeKey] ?? item.type

  return (
    <div
      onClick={onToggle}
      className={`group border border-border bg-card cursor-pointer transition-colors
        hover:border-ink-300 hover:bg-muted/30
        ${expanded ? 'rounded-md shadow-sm' : 'rounded-sm'}`}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-10">
        <span className={`w-2 h-2 rounded-full shrink-0 ${cm.dot}`} />

        {/* 제목 */}
        <p className="flex-1 min-w-0 text-sm truncate text-foreground">
          {item.title}
        </p>

        {/* 배지 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {item.assignee && (
            <span className="text-xs text-ink-400 hidden sm:inline">{item.assignee}</span>
          )}
          <span className="text-xs text-ink-400 hidden sm:inline">{item._team}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-xs bg-ink-100 text-ink-500">
            {tl}
          </span>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-xs ${cm.badge}`}>
            {cm.label}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-1.5">
          {item.detail && item.detail.split('\n').filter(Boolean).map((line, i) => (
            <p key={i} className="flex items-start gap-1.5 text-sm text-ink-500 leading-relaxed">
              <span className="mt-[7px] w-1 h-1 rounded-full bg-ink-300 shrink-0" />
              {line}
            </p>
          ))}
          {item.block_reason && (
            <div className="mt-2 text-sm text-status-late bg-status-late/10 border border-status-late/20 rounded px-2.5 py-1.5">
              🚧 {item.block_reason}
            </div>
          )}
          {item.date && (
            <p className="text-xs text-ink-400 mt-1">일정: {item.date}</p>
          )}
          <p className="text-xs text-ink-300 mt-1">{item._team}</p>
        </div>
      )}
    </div>
  )
}

// ── 브랜드 섹션 ───────────────────────────────────────────────────

function BrandSection({ brand, items, expandedKey, onToggle }: {
  brand:       string
  items:       EnrichedItem[]
  expandedKey: string | null
  onToggle:    (key: string) => void
}) {
  const counts = CHANGE_ORDER.reduce((acc, k) => {
    const n = items.filter(i => i.change === k).length
    if (n > 0) acc.push({ k, n })
    return acc
  }, [] as { k: ChangeKey; n: number }[])

  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2 pb-1.5 border-b border-border">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: brand === NO_BRAND ? 'var(--color-ink-300)' : brandColor(brand) }} />
        <h3 className="text-sm font-bold text-foreground">{brand}</h3>
        <span className="text-sm text-ink-400">{items.length}건</span>
        <div className="ml-auto flex items-center gap-1.5">
          {counts.map(({ k, n }) => (
            <span key={k} className={`text-xs font-semibold px-1.5 py-0.5 rounded-xs ${CHANGE_META[k].badge}`}>
              {CHANGE_META[k].label} {n}
            </span>
          ))}
        </div>
      </div>
      {items.map((item, i) => {
        const key = `${brand}-${i}`
        return (
          <ItemRow
            key={key}
            item={item}
            expanded={expandedKey === key}
            onToggle={() => onToggle(key)}
          />
        )
      })}
    </section>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

interface Props {
  reports: WeeklyReport[]
}

export function WeeklySummaryList({ reports }: Props) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [expandedKey,   setExpandedKey]   = useState<string | null>(null)

  const allItems = assembleItems(reports)

  // 브랜드 목록 — 건수 내림차순, 기타는 맨 마지막
  const brandCountMap = new Map<string, number>()
  for (const item of allItems) {
    const b = brandOf(item)
    brandCountMap.set(b, (brandCountMap.get(b) ?? 0) + 1)
  }
  const brandList = [...new Set(allItems.map(brandOf))].sort((a, b) => {
    if (a === NO_BRAND) return 1
    if (b === NO_BRAND) return -1
    return (brandCountMap.get(b) ?? 0) - (brandCountMap.get(a) ?? 0)
  })

  const filtered = selectedBrand
    ? allItems.filter(i => brandOf(i) === selectedBrand)
    : allItems

  const groups = (selectedBrand ? [selectedBrand] : brandList)
    .map(brand => ({ brand, items: filtered.filter(i => brandOf(i) === brand) }))
    .filter(g => g.items.length > 0)

  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 text-ink-400">
        <p className="text-sm">요약 데이터가 없습니다.</p>
        <p className="text-xs">MCP 스킬로 주간보고 요약을 실행해 주세요.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* 브랜드 사이드바 */}
      <aside className="w-52 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="px-3 py-2.5 text-xs font-semibold text-ink-400 uppercase tracking-wider border-b border-border">
          브랜드 {brandList.length}
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setSelectedBrand(null)}
            className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
              selectedBrand === null
                ? 'bg-muted text-foreground'
                : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-300 shrink-0" />
              <span className="flex-1 truncate text-sm font-medium">전체</span>
              <span className="text-sm tabular-nums text-ink-400">{allItems.length}</span>
            </div>
          </button>

          {brandList.map(brand => {
            const count      = allItems.filter(i => brandOf(i) === brand).length
            const active     = selectedBrand === brand
            const hasBlocked = allItems.some(i => brandOf(i) === brand && i.change === 'blocked')
            return (
              <button
                key={brand}
                onClick={() => setSelectedBrand(p => p === brand ? null : brand)}
                className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                  active
                    ? 'bg-muted text-foreground'
                    : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: hasBlocked ? 'var(--color-status-late)' : brandColor(brand) }}
                  />
                  <span className="flex-1 truncate text-sm font-medium">{brand}</span>
                  <span className="text-sm tabular-nums text-ink-400">{count}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-6
                      [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map(({ brand, items }) => (
          <BrandSection
            key={brand}
            brand={brand}
            items={items}
            expandedKey={expandedKey}
            onToggle={key => setExpandedKey(k => k === key ? null : key)}
          />
        ))}
      </div>
    </div>
  )
}
