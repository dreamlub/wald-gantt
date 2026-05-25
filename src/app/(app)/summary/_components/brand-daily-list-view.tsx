'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, ListTodo, Search } from 'lucide-react'

import type { HistoryItem, Tag } from '../_lib/types'
import { TAG_KEYS, TAG_META } from '../_lib/mock-data'
import { PriorityBars } from './badges'
import { brandColor } from '@/lib/history-service'

interface Props {
  items: HistoryItem[]
  hasFilters: boolean
  total?: number
  hasMore?: boolean
  loadingMore?: boolean
  brandCounts?: Record<string, number>
  activeBrand?: string | null
  onLoadMore?: () => void
  onSelectBrand: (brand: string) => void
  onClearFilters: () => void
  onCreateTask?: (item: HistoryItem) => void
}

function toKstDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

function shortDateLabel(ymd: string): string {
  const dow = new Date(`${ymd}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
    weekday: 'short', timeZone: 'Asia/Seoul',
  })
  return `${parseInt(ymd.slice(5, 7))}/${parseInt(ymd.slice(8, 10))} (${dow})`
}

function shortTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function tagCounts(items: HistoryItem[]): Partial<Record<Tag, number>> {
  const counts: Partial<Record<Tag, number>> = {}
  for (const item of items) {
    for (const tag of item.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1
  }
  return counts
}

function groupByDate(items: HistoryItem[]) {
  const map = new Map<string, HistoryItem[]>()
  for (const item of items) {
    const date = toKstDate(item.occurred_at)
    const group = map.get(date)
    if (group) group.push(item)
    else map.set(date, [item])
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, groupItems]) => ({ date, items: groupItems }))
}

function buildBrandList(items: HistoryItem[], brandCounts?: Record<string, number>) {
  const entries = brandCounts && Object.keys(brandCounts).length > 0
    ? Object.entries(brandCounts)
    : (() => {
        const counts = new Map<string, number>()
        for (const item of items) {
          const brand = item.brand_name ?? '미분류'
          counts.set(brand, (counts.get(brand) ?? 0) + 1)
        }
        return [...counts.entries()]
      })()

  return entries
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
}

function TagSummary({ counts }: { counts: Partial<Record<Tag, number>> }) {
  const visible = TAG_KEYS.filter(tag => (counts[tag] ?? 0) > 0)
  if (visible.length === 0) return null
  return (
    <div className="flex items-center gap-1.5">
      {visible.map(tag => {
        const meta = TAG_META[tag]
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-3xs font-semibold px-1.5 py-0.5 rounded"
            style={{ background: meta.bg, color: meta.color }}
          >
            {meta.label} {counts[tag]}
          </span>
        )
      })}
    </div>
  )
}

function EmptyState({ hasFilters, onClearFilters }: { hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
      <p className="text-xs text-muted-foreground mb-3">
        {hasFilters ? '조건에 맞는 항목이 없어요' : '해당 기간에 데이터가 없습니다'}
      </p>
      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
        >
          필터 초기화
        </button>
      )}
    </div>
  )
}

function HistoryRow({
  item,
  expanded,
  onToggle,
  onCreateTask,
}: {
  item: HistoryItem
  expanded: boolean
  onToggle: () => void
  onCreateTask?: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className={`group border border-border bg-card cursor-pointer transition-colors hover:border-ink-300 hover:bg-muted/30 ${
        expanded ? 'rounded-md shadow-sm' : 'rounded-sm'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 min-h-9">
        <span className="w-3.5 flex justify-center shrink-0">
          {item.priority ? <PriorityBars priority={item.priority} /> : <span className="w-1 h-1 rounded-full bg-ink-300" />}
        </span>
        <p className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">{item.title}</p>
        <div className="shrink-0 flex items-center gap-1">
          {(item.tags ?? []).map(tag => {
            const meta = TAG_META[tag]
            return (
              <span
                key={tag}
                className="text-3xs font-semibold px-1.5 py-0.5 rounded"
                style={{ background: meta.bg, color: meta.color }}
              >
                {meta.label}
              </span>
            )
          })}
          {item.thread_count > 0 && (
            <span className="text-3xs px-1.5 py-0.5 rounded bg-lilac-100 text-lilac-600 font-semibold">
              스레드 {item.thread_count}
            </span>
          )}
          {item.reclassified_at && (
            <span className="text-3xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
              업데이트됨
            </span>
          )}
        </div>
        {item.author && <span className="shrink-0 text-3xs text-ink-400">{item.author}</span>}
        <span className="shrink-0 text-3xs text-ink-400 tabular-nums">{shortTime(item.occurred_at)}</span>
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-3 space-y-2">
          {item.body && <p className="text-2xs text-ink-500 leading-relaxed whitespace-pre-line">{item.body}</p>}
          <div className="flex items-center gap-2 text-3xs text-ink-400">
            <span className="truncate"># {item.channel}</span>
            <div className="ml-auto flex items-center gap-1">
              {item.source_ref && (
                <a
                  href={item.source_ref}
                  target="_blank"
                  rel="noreferrer"
                  onClick={event => event.stopPropagation()}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-background hover:text-foreground"
                >
                  <ExternalLink size={10} />
                  Slack
                </a>
              )}
              {onCreateTask && (
                <button
                  onClick={event => { event.stopPropagation(); onCreateTask() }}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-background hover:text-foreground"
                >
                  <ListTodo size={10} />
                  태스크
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function BrandDailyListView({
  items,
  hasFilters,
  total,
  hasMore,
  loadingMore,
  brandCounts,
  activeBrand,
  onLoadMore,
  onSelectBrand,
  onClearFilters,
  onCreateTask,
}: Props) {
  const [brandQuery, setBrandQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null | undefined>(undefined)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const brandList = useMemo(() => buildBrandList(items, brandCounts), [items, brandCounts])
  const selectedBrand = activeBrand ?? brandList[0]?.name ?? null
  const visibleBrands = useMemo(() => {
    const query = brandQuery.trim().toLowerCase()
    if (!query) return brandList
    return brandList.filter(brand => brand.name.toLowerCase().includes(query))
  }, [brandList, brandQuery])
  const selectedItems = useMemo(() => {
    if (!selectedBrand) return items
    return items.filter(item => (item.brand_name ?? '미분류') === selectedBrand)
  }, [items, selectedBrand])
  const dateGroups = useMemo(() => groupByDate(selectedItems), [selectedItems])
  const selectedTagCounts = useMemo(() => tagCounts(selectedItems), [selectedItems])
  const firstItemId = selectedItems[0]?.id ?? null
  const expandedItemId = expandedId === undefined
    ? firstItemId
    : expandedId && selectedItems.some(item => item.id === expandedId)
      ? expandedId
      : expandedId

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loadingMore && onLoadMore) onLoadMore()
  }, [hasMore, loadingMore, onLoadMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !onLoadMore) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore() },
      { rootMargin: '260px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleLoadMore, onLoadMore])

  if (items.length === 0 && !loadingMore) {
    return <EmptyState hasFilters={hasFilters} onClearFilters={onClearFilters} />
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden bg-background">
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col min-h-0">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            <input
              value={brandQuery}
              onChange={event => setBrandQuery(event.target.value)}
              placeholder="브랜드 검색"
              className="w-full h-8 rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-lilac-300"
            />
          </div>
        </div>
        <div className="px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider">브랜드 {brandList.length}</div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleBrands.map(brand => {
            const active = selectedBrand === brand.name
            const color = brandColor(brand.name)
            return (
              <button
                key={brand.name}
                onClick={() => onSelectBrand(brand.name)}
                className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                  active ? 'bg-muted text-foreground' : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="flex-1 truncate text-xs font-semibold">{brand.name}</span>
                  <span className="text-2xs tabular-nums">{brand.count}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="shrink-0 h-11 border-b border-border bg-card px-5 flex items-center gap-3">
          {selectedBrand && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(selectedBrand) }} />
          )}
          <h2 className="text-sm font-bold text-foreground truncate">{selectedBrand ?? '전체 브랜드'}</h2>
          <span className="text-xs text-ink-400 shrink-0">{selectedItems.length} / {total ?? items.length}건</span>
          <div className="ml-auto shrink-0">
            <TagSummary counts={selectedTagCounts} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {dateGroups.map(group => (
            <section key={group.date} className="space-y-2">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <h3 className="text-sm font-bold text-foreground">{shortDateLabel(group.date)}</h3>
                <span className="text-xs text-ink-400">{group.items.length}건</span>
                <div className="ml-auto"><TagSummary counts={tagCounts(group.items)} /></div>
              </div>
              <div className="space-y-1.5">
                {group.items.map(item => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    expanded={expandedItemId === item.id}
                    onToggle={() => setExpandedId(expandedItemId === item.id ? null : item.id)}
                    onCreateTask={onCreateTask ? () => onCreateTask(item) : undefined}
                  />
                ))}
              </div>
            </section>
          ))}

          {onLoadMore && <div ref={sentinelRef} className="h-px" />}
          {loadingMore && <p className="text-center py-4 text-xs text-ink-400">불러오는 중...</p>}
        </div>
      </main>
    </div>
  )
}
