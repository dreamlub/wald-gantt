'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { BrandIcon } from '@/components/brand-icon'
import { useBrandProfiles } from '@/hooks/use-brand-profiles'

interface BrandStat {
  name: string
  count: number
}

interface Props {
  brands: BrandStat[]
  selectedBrand: string
  onSelectBrand: (brand: string) => void
}

export function ReviewSidebar({ brands, selectedBrand, onSelectBrand }: Props) {
  const [search, setSearch] = useState('')
  const profiles = useBrandProfiles()

  const filtered = search
    ? brands.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
    : brands
  const total = brands.reduce((s, b) => s + b.count, 0)

  return (
    <div
      className="shrink-0 border-r bg-muted flex flex-col overflow-hidden"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
        <span className="text-sm font-semibold text-ink-400">일감 판단</span>
      </div>

      {brands.length > 0 && (
        <div className="shrink-0 px-2 pt-2 pb-1">
          <div className="relative">
            <Search size={10} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="브랜드 검색"
              className="w-full text-sm pl-6 pr-2 py-1 border border-border rounded bg-card placeholder:text-ink-300 focus:outline-none focus:border-lilac-300"
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 flex flex-col [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {brands.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-xs text-ink-300">
            후보를 수집하면 브랜드가 표시됩니다
          </div>
        ) : (
          <>
            <button
              onClick={() => onSelectBrand('all')}
              className={`sidebar-btn ${selectedBrand === 'all' ? 'sidebar-btn-active' : ''}`}
            >
              <span className="w-2 h-2 rounded-full bg-ink-300 shrink-0" />
              <span className="flex-1 truncate text-left">전체</span>
              <span className="text-xs text-ink-400">{total}</span>
            </button>
            {filtered.map(b => (
              <button
                key={b.name}
                onClick={() => onSelectBrand(selectedBrand === b.name ? 'all' : b.name)}
                className={`sidebar-btn ${selectedBrand === b.name ? 'sidebar-btn-active' : ''}`}
              >
                <BrandIcon name={b.name} logoUrl={profiles.get(b.name)?.logo_url} lucideIcon={profiles.get(b.name)?.lucide_icon} size={8}
                />
                <span className="flex-1 truncate text-left">{b.name}</span>
                <span className="text-xs text-ink-400">{b.count}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
