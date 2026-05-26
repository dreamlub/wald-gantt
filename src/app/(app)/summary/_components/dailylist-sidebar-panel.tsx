'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import type { Tag } from '../_lib/types'
import { TAG_KEYS, PRIORITY_KEYS } from '../_lib/constants'
import { TagFilterBadge, PriorityFilterBadge } from './badges'
import { brandColor } from '@/lib/history-service'
import { SidebarDatePicker, PRESETS, applyDatePreset, getActivePreset } from './_sidebar-controls'
import type { PriorityKey } from './_sidebar-utils'

// 섹션 타이틀 — px-2 없이 부모 컨테이너 패딩만 사용 (정렬 일관성)
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-2 mb-1 text-sm font-semibold text-ink-400 uppercase tracking-wider">{children}</div>
}

interface Props {
  dateFrom: string; dateTo: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  selectedTags: Set<Tag>; onToggleTag: (t: Tag) => void
  priorityKey: PriorityKey; onPriorityChange: (p: PriorityKey) => void
  brandId: string | 'all'; onBrandChange: (b: string | 'all') => void
  brandCounts?: Record<string, number>
}

export function DailyListSidebarPanel({
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  selectedTags, onToggleTag,
  priorityKey, onPriorityChange,
  brandId, onBrandChange,
  brandCounts,
}: Props) {
  const [brandQuery, setBrandQuery] = useState('')
  const activePreset = getActivePreset(dateFrom, dateTo)

  const brandList = useMemo(() => {
    if (!brandCounts || Object.keys(brandCounts).length === 0) return []
    return Object.entries(brandCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  }, [brandCounts])

  const visibleBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase()
    if (!q) return brandList
    return brandList.filter(b => b.name.toLowerCase().includes(q))
  }, [brandList, brandQuery])

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

      {/* ── 기간 ── */}
      <div className="p-2 border-b border-border shrink-0">
        <SectionTitle>기간</SectionTitle>
        <div className="flex items-center gap-1.5 mb-2">
          <SidebarDatePicker value={dateFrom} onChange={onDateFromChange} placeholder="시작일" />
          <span className="text-sm text-ink-400 shrink-0">~</span>
          <SidebarDatePicker value={dateTo}   onChange={onDateToChange}   placeholder="종료일" />
        </div>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyDatePreset(key, onDateFromChange, onDateToChange)}
              className={`text-sm px-2 py-0.5 rounded border transition-colors ${
                activePreset === key
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border text-ink-500 hover:text-foreground hover:border-ink-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 태그 ── */}
      <div className="p-2 border-b border-border shrink-0">
        <SectionTitle>태그</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {TAG_KEYS.map(t => {
            const active = selectedTags.has(t)
            return (
              <TagFilterBadge
                key={t}
                tag={t}
                active={active}
                onClick={() => onToggleTag(t)}
                dimmed={selectedTags.size > 0 && !active}
              />
            )
          })}
        </div>
      </div>

      {/* ── 중요도 ── */}
      <div className="p-2 border-b border-border shrink-0">
        <SectionTitle>중요도</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITY_KEYS.map(p => {
            const active = priorityKey === p
            return (
              <PriorityFilterBadge
                key={p}
                priority={p}
                active={active}
                onClick={() => onPriorityChange(priorityKey === p ? 'all' : p)}
                dimmed={priorityKey !== 'all' && !active}
              />
            )
          })}
        </div>
      </div>

      {/* ── 브랜드 ── */}
      {brandList.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-2 shrink-0">
            <SectionTitle>브랜드 {brandList.length}</SectionTitle>
            <div className="relative">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
              <input
                value={brandQuery}
                onChange={e => setBrandQuery(e.target.value)}
                placeholder="브랜드 검색"
                className="w-full text-sm pl-5 pr-2 py-1 border border-border rounded bg-card text-muted-foreground placeholder:text-ink-300 focus:outline-none focus:border-lilac-300"
              />
            </div>
          </div>
          <div className="px-2 pb-3 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {visibleBrands.map(brand => {
              const active = brandId === brand.name
              return (
                <button
                  key={brand.name}
                  onClick={() => onBrandChange(active ? 'all' : brand.name)}
                  className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(brand.name) }} />
                  <span className="flex-1 truncate text-left">{brand.name}</span>
                  <span className="text-sm text-ink-400">{brand.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
