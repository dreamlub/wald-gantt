'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, ListTodo } from 'lucide-react'

import type { HistoryItem, Tag } from '../_lib/types'
import { TAG_KEYS, TAG_META } from '../_lib/mock-data'
import { PriorityBars, TagBadge } from './badges'

interface Props {
  items: HistoryItem[]
  hasFilters: boolean
  total?: number
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
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

function TagSummary({ counts }: { counts: Partial<Record<Tag, number>> }) {
  const visible = TAG_KEYS.filter(tag => (counts[tag] ?? 0) > 0)
  if (visible.length === 0) return null
  return (
    <div className="flex items-center gap-1.5">
      {visible.map(tag => (
        <TagBadge key={tag} tag={tag} variant="solid">{TAG_META[tag].label} {counts[tag]}</TagBadge>
      ))}
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
          {(item.tags ?? []).map(tag => (
            <TagBadge key={tag} tag={tag} variant="solid" />
          ))}
          {item.thread_count > 0 && (
            <span className="text-3xs px-1.5 py-0.5 rounded bg-lilac-100 text-lilac-600 font-semibold">
              스레드 {item.thread_count}
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
  onLoadMore,
  onClearFilters,
  onCreateTask,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null | undefined>(undefined)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const dateGroups = useMemo(() => groupByDate(items), [items])
  const allTagCounts = useMemo(() => tagCounts(items), [items])
  const expandedItemId = expandedId === undefined ? (items[0]?.id ?? null) : expandedId

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
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      <header className="shrink-0 h-10 border-b border-border bg-card px-5 flex items-center gap-3">
        <span className="text-xs text-ink-400">{items.length} / {total ?? items.length}건</span>
        <div className="ml-auto shrink-0">
          <TagSummary counts={allTagCounts} />
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
    </div>
  )
}
