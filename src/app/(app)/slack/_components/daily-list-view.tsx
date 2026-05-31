'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, ListTodo } from 'lucide-react'

import type { HistoryItem } from '../_lib/types'
import { TAG_META } from '../_lib/constants'
import { PriorityBars } from './badges'
import { BrandIcon } from '@/components/brand-icon'
import { useBrandProfiles } from '@/hooks/use-brand-profiles'
import { toKSTDate } from '@/lib/history-query-utils'

interface Props {
  items: HistoryItem[]
  hasFilters: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onClearFilters: () => void
  onCreateTask?: (item: HistoryItem) => void
}

function shortDateLabel(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00+09:00`)
  const dow = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${date.getMonth() + 1}/${date.getDate()} ${dow}요일`
}


function groupByDate(items: HistoryItem[]) {
  const map = new Map<string, HistoryItem[]>()
  for (const item of items) {
    const date = toKSTDate(item.occurred_at)
    const group = map.get(date)
    if (group) group.push(item)
    else map.set(date, [item])
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, groupItems]) => ({ date, items: groupItems }))
}


function EmptyState({ hasFilters, onClearFilters }: { hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-muted-foreground mb-3">
        {hasFilters ? '조건에 맞는 항목이 없어요' : '해당 기간에 데이터가 없습니다'}
      </p>
      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="text-sm px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
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
  const profiles = useBrandProfiles()
  const p = item.brand_name ? profiles.get(item.brand_name) : undefined

  return (
    <div
      onClick={onToggle}
      className={`group border border-border bg-card cursor-pointer transition-colors hover:border-ink-300 hover:bg-muted/30 ${
        expanded ? 'rounded-md shadow-sm' : 'rounded-sm'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 min-h-9">
        <span className="w-3.5 flex justify-center shrink-0">
          {item.priority
            ? <PriorityBars priority={item.priority} />
            : item.brand_name
              ? <BrandIcon name={item.brand_name} logoUrl={p?.logo_url} lucideIcon={p?.lucide_icon} size={12} />
              : <span className="w-1 h-1 rounded-full bg-ink-300" />
          }
        </span>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <p className="min-w-0 text-sm font-semibold text-foreground truncate">{item.title}</p>
          {item.source_ref && (
            <a
              href={item.source_ref}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border border-dashed border-ink-300 text-muted-foreground hover:text-foreground hover:border-ink-400 hover:bg-muted transition-all whitespace-nowrap"
            >
              <ExternalLink size={10} />
              Slack
            </a>
          )}
          {onCreateTask && (
            <button
              onClick={e => { e.stopPropagation(); onCreateTask() }}
              className="shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border border-dashed border-ink-300 text-muted-foreground hover:text-foreground hover:border-ink-400 hover:bg-muted transition-all whitespace-nowrap"
            >
              <ListTodo size={10} />
              태스크
            </button>
          )}
        </div>
        {(item.tags ?? []).slice(0, 1).map(tag => {
          const meta = TAG_META[tag as keyof typeof TAG_META]
          if (!meta) return null
          return (
            <span
              key={tag}
              className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded"
              style={{
                background: `color-mix(in srgb, var(--color-tag-${tag}-dot) 12%, transparent)`,
                color: `var(--color-tag-${tag}-dot)`,
              }}
            >
              {meta.label}
            </span>
          )
        })}
        {item.author && <span className="shrink-0 text-sm text-ink-400">{item.author}</span>}
      </div>

      {expanded && (
        <div className="border-t border-border px-5 py-3 space-y-2">
          {item.body && (
            <p className="text-sm text-ink-500 leading-relaxed whitespace-pre-line">
              {item.body.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                part.startsWith('**') && part.endsWith('**')
                  ? <strong key={i}>{part.slice(2, -2)}</strong>
                  : part
              )}
            </p>
          )}
          <div className="flex items-center gap-2 text-sm text-ink-400">
            <span className="truncate"># {item.channel}</span>
            {item.thread_count > 0 && <span>스레드 {item.thread_count}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export function DailyListView({
  items,
  hasFilters,
  hasMore,
  loadingMore,
  onLoadMore,
  onClearFilters,
  onCreateTask,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null | undefined>(undefined)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const dateGroups = useMemo(() => groupByDate(items), [items])
  const firstItemId = items[0]?.id ?? null
  const expandedItemId = expandedId === undefined
    ? firstItemId
    : expandedId && items.some(item => item.id === expandedId)
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
    <div data-scrolltop className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {dateGroups.map(group => (
        <section key={group.date} className="space-y-2">
          <div className="flex items-center gap-2 pb-1 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">{shortDateLabel(group.date)}</h3>
            <span className="text-sm text-ink-400">{group.items.length}건</span>
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
    </div>
  )
}
