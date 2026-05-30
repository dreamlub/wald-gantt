'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

import { brandColor } from '@/lib/history-service'
import { DateRangePanel } from './sidebar-date-panels'

// 섹션 타이틀 — px-2 없이 부모 컨테이너 패딩만 사용 (정렬 일관성)
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-2 mb-1 text-sm font-semibold text-ink-400 uppercase tracking-wider">{children}</div>
}

interface Props {
  dateFrom: string; dateTo: string
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  brandId: string | 'all'; onBrandChange: (b: string | 'all') => void
  brandCounts?: Record<string, number>
}

export function DailyListSidebarPanel({
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  brandId, onBrandChange,
  brandCounts,
}: Props) {
  const [brandQuery, setBrandQuery] = useState('')

  const brandList = useMemo(() => {
    if (!brandCounts || Object.keys(brandCounts).length === 0) return []
    return Object.entries(brandCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  }, [brandCounts])

  const totalCount = useMemo(
    () => brandList.reduce((s, b) => s + b.count, 0),
    [brandList],
  )

  const visibleBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase()
    if (!q) return brandList
    return brandList.filter(b => b.name.toLowerCase().includes(q))
  }, [brandList, brandQuery])

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

      {/* ── 기간 ── */}
      <div className="border-b border-border shrink-0 pt-2">
        <DateRangePanel
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
          showToday={true}
        />
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
            <button
              onClick={() => onBrandChange('all')}
              className={`sidebar-btn ${brandId === 'all' ? 'sidebar-btn-active' : ''}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-ink-300" />
              <span className="flex-1 truncate text-left">전체</span>
              <span className="text-sm text-ink-400">{totalCount}</span>
            </button>
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
