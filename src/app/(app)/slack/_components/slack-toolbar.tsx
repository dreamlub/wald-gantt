'use client'

import type { Dispatch, RefObject, SetStateAction } from 'react'
import {
  CalendarDays, Database, GitMerge, LayoutList,
  Newspaper, Search, Table, X,
  type LucideIcon,
} from 'lucide-react'

import type { ViewKey } from './slack-shell-state'

const VIEW_TABS: { key: ViewKey; label: string; icon: LucideIcon }[] = [
  { key: 'rawdata',     label: 'Raw Data',     icon: Database },
  { key: 'dailylist',   label: 'Daily List',   icon: LayoutList },
  { key: 'dailyreport', label: 'Daily Report', icon: Newspaper },
  { key: 'weeklylist',  label: 'Weekly List',  icon: Table },
  { key: 'issue-tracker',    label: 'Issue Tracker', icon: GitMerge },
  { key: 'calendar',    label: 'Calendar',     icon: CalendarDays },
]

interface Props {
  view: ViewKey
  onViewChange: (view: ViewKey) => void
  searchRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
}

export function SummaryToolbar({
  view,
  onViewChange,
  searchRef,
  searchInputRef,
  searchOpen,
  setSearchOpen,
  searchQuery,
  setSearchQuery,
}: Props) {
  return (
    <div className="h-12 flex items-stretch border-b bg-card shrink-0">
      <nav className="flex items-stretch pl-3">
        {VIEW_TABS.map(tab => {
          const Icon = tab.icon
          const active = view === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onViewChange(tab.key)}
              className={`flex items-center gap-1.5 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? 'border-lilac-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-ink-200'
              }`}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          )
        })}
      </nav>

      {view === 'dailylist' && (
      <div ref={searchRef} className="relative flex items-center ml-auto mr-3">
        {searchOpen || searchQuery ? (
          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2 text-ink-300 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }}
              placeholder="검색"
              className="text-sm pl-6 pr-6 py-1 border rounded w-40 outline-none focus:ring-1 focus:ring-lilac-300 text-muted-foreground placeholder:text-ink-300"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
                className="absolute right-1 text-ink-300 hover:text-muted-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            title="검색"
            className="p-1.5 rounded text-ink-400 hover:text-muted-foreground hover:bg-muted transition-colors"
          >
            <Search size={13} />
          </button>
        )}
      </div>
      )}
    </div>
  )
}
