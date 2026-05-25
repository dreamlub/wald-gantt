'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ExternalLink, ListTodo, Hash } from 'lucide-react'

import type { HistoryItem, Tag } from '../_lib/types'
import { TAG_META } from '../_lib/mock-data'
import { PriorityBars } from './badges'
import { brandColor } from '@/lib/history-service'

interface Props {
  items: HistoryItem[]
  selectedTags:     Set<Tag>
  searchQuery?:     string
  hasFilters:       boolean
  total?:           number
  hasMore?:         boolean
  loadingMore?:     boolean
  brandCounts?:     Record<string, number>
  activeBrand?:     string | null
  onLoadMore?:      () => void
  onToggleTag:      (t: Tag) => void
  onSelectBrand:    (id: string) => void
  onSelectAuthor:   (a: string) => void
  onOpenItem?:      (item: HistoryItem) => void
  onClearFilters:   () => void
  onCreateTask?:    (item: HistoryItem) => void
  onCreateProject?: (item: HistoryItem) => void
}

function fmtDate(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd (eee)', { locale: ko })
}

function MarkdownBody({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>
        )
        return <div key={i}>{parts}</div>
      })}
    </div>
  )
}

function Highlight({ text, query }: { text: string; query?: string }) {
  const q = query?.trim()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx < 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let last = 0, pos = idx, k = 0
  while (pos >= 0) {
    if (pos > last) parts.push(text.slice(last, pos))
    parts.push(<mark key={k++} className="bg-amber-100 text-foreground rounded-sm px-0.5">{text.slice(pos, pos + needle.length)}</mark>)
    last = pos + needle.length
    pos = lower.indexOf(needle, last)
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function TableView({
  items, searchQuery, hasFilters,
  total, hasMore, loadingMore, brandCounts, activeBrand,
  onLoadMore,
  onToggleTag, onSelectBrand, onSelectAuthor, onClearFilters,
  onOpenItem, onCreateTask,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loadingMore && onLoadMore) onLoadMore()
  }, [hasMore, loadingMore, onLoadMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !onLoadMore) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleLoadMore, onLoadMore])
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const brandCountList = useMemo(() => {
    const entries = brandCounts
      ? Object.entries(brandCounts)
      : (() => {
          const m = new Map<string, number>()
          for (const item of items) {
            const b = item.brand_name ?? '미분류'
            m.set(b, (m.get(b) ?? 0) + 1)
          }
          return [...m.entries()]
        })()
    return entries
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [items, brandCounts])

  if (items.length === 0 && !loadingMore) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <div className="text-xs text-muted-foreground mb-1">
          {hasFilters
            ? '조건에 맞는 항목이 없어요'
            : onLoadMore
              ? '해당 기간에 데이터가 없습니다'
              : '수집된 히스토리가 없어요'
          }
        </div>
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors mt-3"
          >
            필터 초기화
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 브랜드 배지 */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-border bg-card">
        <button
          onClick={() => activeBrand && onSelectBrand(activeBrand)}
          className={`text-xs px-2.5 py-[3px] rounded-full border transition-colors ${
            !activeBrand
              ? 'bg-foreground text-white border-foreground'
              : 'bg-card text-muted-foreground border-border hover:border-ink-400'
          }`}
        >
          전체 {total ?? items.length}
        </button>
        {brandCountList.map(b => {
          const active = activeBrand === b.name
          const color = brandColor(b.name)
          return (
            <button
              key={b.name}
              onClick={() => onSelectBrand(b.name)}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-[3px] rounded-full border transition-colors ${
                active
                  ? 'text-white border-transparent'
                  : 'bg-card text-muted-foreground border-border hover:border-ink-400'
              }`}
              style={active ? { backgroundColor: color, borderColor: color } : undefined}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'white' : color }} />
              {b.name}
              <span className={`text-3xs ${active ? 'text-white/70' : 'text-ink-400'}`}>{b.count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs table-fixed">
          <thead className="sticky top-0 z-10 bg-muted border-b border-ink-150">
            <tr>
              <th className="text-left px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-[110px]">날짜</th>
              <th className="text-left px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-[90px]">브랜드</th>
              <th className="text-left px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-[200px]">제목</th>
              <th className="text-left px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider min-w-[200px]">내용</th>
              <th className="text-left px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-[110px]">태그</th>
              <th className="text-center px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-[60px]">중요도</th>
              <th className="text-left px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-[75px]">작성자</th>
              <th className="text-left px-3 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-[140px]">채널</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const isHovered = hoveredId === item.id
              return (
                <tr
                  key={item.id}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onOpenItem?.(item)}
                  className="border-b border-border hover:bg-muted/50 transition-colors align-top cursor-pointer"
                >
                  {/* 날짜 */}
                  <td className="px-3 py-2.5 text-2xs text-ink-500 tabular-nums whitespace-nowrap">
                    {fmtDate(item.occurred_at)}
                  </td>

                  {/* 브랜드 */}
                  <td className="px-3 py-2.5">
                    {item.brand_name ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectBrand(item.brand_name!); }}
                        className="inline-flex items-center gap-1.5 text-xs text-ink-700 hover:text-foreground transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: brandColor(item.brand_name) }} />
                        <span className="truncate max-w-[70px]">{item.brand_name}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-ink-300">—</span>
                    )}
                  </td>

                  {/* 제목 + 호버 액션 */}
                  <td className="px-3 py-2.5 relative">
                    <div className="text-xs font-semibold text-foreground leading-snug">
                      <Highlight text={item.title} query={searchQuery} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {item.thread_count > 0 && (
                        <span className="text-3xs text-lilac-500">스레드 {item.thread_count}</span>
                      )}
                      {item.reclassified_at && (
                        <span className="text-4xs px-1 py-px rounded font-medium bg-amber-100 text-amber-700">업데이트</span>
                      )}
                    </div>
                    {isHovered && (
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        {item.source_ref && (
                          <a
                            href={item.source_ref}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-3xs px-1.5 py-0.5 rounded bg-card border border-border text-ink-500 hover:text-foreground hover:border-ink-400 transition-colors"
                          >
                            <ExternalLink size={10} />
                            Slack
                          </a>
                        )}
                        {onCreateTask && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onCreateTask(item); }}
                            className="inline-flex items-center gap-1 text-3xs px-1.5 py-0.5 rounded bg-card border border-border text-ink-500 hover:text-foreground hover:border-ink-400 transition-colors"
                          >
                            <ListTodo size={10} />
                            태스크
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 내용 */}
                  <td className="px-3 py-2.5">
                    {item.body && (
                      <MarkdownBody text={item.body} className="text-xs text-ink-400 leading-[1.6]" />
                    )}
                  </td>

                  {/* 태그 */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {(item.tags ?? []).map(t => {
                        const meta = TAG_META[t]
                        if (!meta) return null
                        return (
                          <button
                            key={t}
                            onClick={(e) => { e.stopPropagation(); onToggleTag(t); }}
                            className="inline-flex items-center text-3xs px-1.5 py-[1px] rounded font-medium"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </button>
                        )
                      })}
                    </div>
                  </td>

                  {/* 우선순위 */}
                  <td className="px-3 py-2.5 text-center">
                    {item.priority && (
                      <PriorityBars priority={item.priority} />
                    )}
                  </td>

                  {/* 작성자 */}
                  <td className="px-3 py-2.5">
                    {item.author ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectAuthor(item.author!); }}
                        className="text-2xs text-ink-700 hover:text-foreground transition-colors truncate max-w-[70px] block"
                      >
                        {item.author}
                      </button>
                    ) : (
                      <span className="text-2xs text-ink-300">—</span>
                    )}
                  </td>

                  {/* 채널 */}
                  <td className="px-3 py-2.5 max-w-[160px]">
                    <div className="flex items-center gap-0.5 text-2xs text-ink-500 min-w-0">
                      <Hash size={10} className="shrink-0 text-ink-300" />
                      <span className="truncate">{item.channel}</span>
                    </div>
                  </td>

                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted border-t border-ink-150">
            <tr>
              <td colSpan={8} className="px-5 py-2 text-right text-3xs text-ink-400 tabular-nums">
                {loadingMore
                  ? <span className="text-ink-300">불러오는 중...</span>
                  : <>
                      <b className="text-foreground font-semibold">{items.length}</b> / {total ?? items.length} 건 표시
                    </>
                }
              </td>
            </tr>
          </tfoot>
        </table>
        {onLoadMore && <div ref={sentinelRef} className="h-px" />}
      </div>
    </div>
  )
}
