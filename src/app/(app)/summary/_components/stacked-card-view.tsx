'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ExternalLink } from 'lucide-react'

import type { HistoryItem, Tag } from '../_lib/types'
import { TAG_META, TAG_KEYS } from '../_lib/mock-data'
import { PriorityBars, TagBadge } from './badges'
import { brandColor } from '@/lib/history-service'

const PEEK_H   = 34   // 뒤 카드 헤더 높이 (px)
const MAX_PEEK = 4    // 최대 표시 peek 개수

// ── 유틸 ─────────────────────────────────────────────────────────
function kstDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

function fmtShort(ymd: string) {
  try { return format(new Date(ymd + 'T00:00:00'), 'M/d (eee)', { locale: ko }) }
  catch { return ymd }
}

function tagCounts(items: HistoryItem[]): Partial<Record<Tag, number>> {
  const m: Partial<Record<Tag, number>> = {}
  for (const item of items)
    for (const t of item.tags ?? [])
      m[t] = (m[t] ?? 0) + 1
  return m
}

function groupByDate(items: HistoryItem[]) {
  const map = new Map<string, HistoryItem[]>()
  for (const item of items) {
    const d = kstDate(item.occurred_at)
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(item)
  }
  // 최신 날짜 → index 0
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }))
}

function groupByBrand(items: HistoryItem[]) {
  const map = new Map<string, HistoryItem[]>()
  for (const item of items) {
    const k = item.brand_name ?? '미분류'
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([brand, items]) => ({ brand, items }))
}

// ── 태그 뱃지 열 ─────────────────────────────────────────────────
function TagBadges({ items }: { items: HistoryItem[] }) {
  const counts = useMemo(() => tagCounts(items), [items])
  const tags = TAG_KEYS.filter(t => (counts[t] ?? 0) > 0)
  if (!tags.length) return null
  return (
    <div className="flex items-center gap-1">
      {tags.map(t => (
        <TagBadge key={t} tag={t} variant="solid">{counts[t]}</TagBadge>
      ))}
    </div>
  )
}

// ── 아이템 행 (활성 카드 내부) ───────────────────────────────────
function ItemRow({ item, onOpen }: { item: HistoryItem; onOpen: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      className="relative flex items-start gap-2 px-3 py-2.5 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {item.priority && <div className="mt-0.5 shrink-0"><PriorityBars priority={item.priority} /></div>}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground leading-snug line-clamp-2">{item.title}</p>
        {(item.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(item.tags ?? []).map(t => (
              <TagBadge key={t} tag={t} variant="solid" />
            ))}
          </div>
        )}
      </div>
      {hov && item.source_ref && (
        <a href={item.source_ref} target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 p-0.5 text-ink-400 hover:text-foreground">
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

// ── 브랜드 덱 ────────────────────────────────────────────────────
function BrandDeck({ brand, items, onOpenItem }: {
  brand: string
  items: HistoryItem[]
  onOpenItem: (item: HistoryItem) => void
}) {
  const color      = brandColor(brand)
  const dateGroups = useMemo(() => groupByDate(items), [items])
  const [activeIdx, setActiveIdx] = useState(0)

  // 뒤에서 peeking할 그룹들 (active 제외, 오래된 순 → 최신 순)
  const allPeeks = useMemo(
    () => dateGroups
      .map((g, i) => ({ ...g, origIdx: i }))
      .filter(g => g.origIdx !== activeIdx)
      .reverse(),      // oldest 먼저 (위쪽)
    [dateGroups, activeIdx],
  )
  const hiddenCount = Math.max(0, allPeeks.length - MAX_PEEK)
  const peeks       = allPeeks.slice(hiddenCount) // 보여줄 peek (최신 MAX_PEEK개)
  const peekCount   = peeks.length + (hiddenCount > 0 ? 1 : 0) // +1: hidden indicator

  return (
    <div>
      {/* 브랜드 헤더 */}
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs font-bold text-foreground">{brand}</span>
        <span className="text-3xs text-ink-400">{items.length}</span>
        <div className="ml-auto"><TagBadges items={items} /></div>
      </div>

      {/* 카드 스택 */}
      <div className="relative" style={{ paddingTop: peekCount * PEEK_H }}>

        {/* hidden 날짜 indicator */}
        {hiddenCount > 0 && (
          <div
            className="absolute left-0 right-0 flex items-center px-3 text-3xs text-ink-400"
            style={{ top: 0, height: PEEK_H, zIndex: 1 }}
          >
            +{hiddenCount}일 더
          </div>
        )}

        {/* 뒤 카드 헤더 (peek) */}
        {peeks.map((g, peekI) => {
          const topIdx   = (hiddenCount > 0 ? 1 : 0) + peekI
          const zIdx     = peeks.length - peekI + 1
          return (
            <motion.div
              key={g.date}
              layout
              transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              className="absolute left-0 right-0 cursor-pointer"
              style={{ top: topIdx * PEEK_H, zIndex: zIdx, height: PEEK_H }}
              onClick={() => setActiveIdx(g.origIdx)}
            >
              <div
                className="h-full flex items-center gap-2 px-3 rounded-t-xl border border-b-0 border-border bg-card hover:bg-muted/40 transition-colors"
                style={{ borderLeftWidth: 3, borderLeftColor: color }}
              >
                <span className="text-2xs font-semibold text-foreground">{fmtShort(g.date)}</span>
                <span className="text-3xs text-ink-300">{g.items.length}건</span>
                <div className="ml-auto"><TagBadges items={g.items} /></div>
              </div>
            </motion.div>
          )
        })}

        {/* 앞 카드 (활성) */}
        <div className="relative" style={{ zIndex: peeks.length + 10 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"
              style={{ borderLeftWidth: 3, borderLeftColor: color }}
            >
              {/* 활성 카드 날짜 헤더 */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                <span className="text-2xs font-bold text-foreground">
                  {fmtShort(dateGroups[activeIdx]?.date ?? '')}
                </span>
                <span className="text-3xs text-ink-400">
                  {dateGroups[activeIdx]?.items.length}건
                </span>
                <div className="ml-auto">
                  <TagBadges items={dateGroups[activeIdx]?.items ?? []} />
                </div>
              </div>

              {/* 아이템 목록 */}
              {(dateGroups[activeIdx]?.items ?? []).map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.16 }}
                >
                  <ItemRow item={item} onOpen={() => onOpenItem(item)} />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── 빈 상태 ─────────────────────────────────────────────────────
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
      <p className="text-xs text-muted-foreground mb-3">
        {hasFilters ? '조건에 맞는 항목이 없어요' : '해당 기간에 데이터가 없습니다'}
      </p>
      {hasFilters && (
        <button onClick={onClear}
          className="text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors">
          필터 초기화
        </button>
      )}
    </div>
  )
}

// ── 메인 ────────────────────────────────────────────────────────
interface Props {
  items: HistoryItem[]
  hasFilters: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onOpenItem: (item: HistoryItem) => void
  onCreateTask?: (item: HistoryItem) => void
  onClearFilters: () => void
}

export function StackedCardsView({
  items, hasFilters, hasMore, loadingMore,
  onLoadMore, onOpenItem, onClearFilters,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => groupByBrand(items), [items])

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loadingMore && onLoadMore) onLoadMore()
  }, [hasMore, loadingMore, onLoadMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !onLoadMore) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) handleLoadMore() },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [handleLoadMore, onLoadMore])

  if (items.length === 0 && !loadingMore) {
    return <EmptyState hasFilters={hasFilters} onClear={onClearFilters} />
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-8">
        {groups.map((g, gi) => (
          <motion.div
            key={g.brand}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(gi * 0.04, 0.3), duration: 0.24, ease: 'easeOut' }}
          >
            <BrandDeck
              brand={g.brand}
              items={g.items}
              onOpenItem={onOpenItem}
            />
          </motion.div>
        ))}
      </div>
      {onLoadMore && <div ref={sentinelRef} className="h-px mt-4" />}
      {loadingMore && <p className="text-center py-6 text-xs text-ink-400">불러오는 중...</p>}
    </div>
  )
}
