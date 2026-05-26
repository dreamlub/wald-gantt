'use client'

import type { Dispatch, RefObject, SetStateAction } from 'react'
import {
  CalendarDays, Database, GitMerge, LayoutGrid, LayoutList,
  Newspaper, PanelLeftOpen, Search, Table, X,
  type LucideIcon,
} from 'lucide-react'

import type { ViewKey } from './summary-shell-state'

const VIEW_TABS: { key: ViewKey; label: string; icon: LucideIcon }[] = [
  { key: 'rawdata',     label: 'Raw Data',     icon: Database },
  { key: 'dailylist',   label: 'Daily List',   icon: LayoutList },
  { key: 'dailyreport', label: 'Daily Report', icon: Newspaper },
  { key: 'weeklylist',  label: 'Weekly List',  icon: Table },
  { key: 'timeline',    label: 'Timeline',     icon: GitMerge },
  { key: 'calendar',    label: 'Calendar',     icon: CalendarDays },
]

interface Props {
  sidebarOpen: boolean
  onOpenSidebar: () => void
  view: ViewKey
  onViewChange: (view: ViewKey) => void
  searchRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  cardMode: boolean
  setCardMode: Dispatch<SetStateAction<boolean>>
}

export function SummaryToolbar({
  sidebarOpen,
  onOpenSidebar,
  view,
  onViewChange,
  searchRef,
  searchInputRef,
  searchOpen,
  setSearchOpen,
  searchQuery,
  setSearchQuery,
  cardMode,
  setCardMode,
}: Props) {
  return (
    <div className="h-12 flex items-center border-b bg-card shrink-0 px-4 gap-2">
      {!sidebarOpen && (
        <button
          onClick={onOpenSidebar}
          className="p-1.5 rounded text-ink-400 hover:text-muted-foreground hover:bg-muted transition-colors"
          title="사이드바 열기"
        >
          <PanelLeftOpen size={14} />
        </button>
      )}

      <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
        {VIEW_TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => onViewChange(tab.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                view === tab.key ? 'bg-card text-ink-700 shadow-sm' : 'text-muted-foreground hover:text-ink-700'
              }`}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div ref={searchRef} className="relative flex items-center ml-2">
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
              className="text-2xs pl-6 pr-6 py-1 border rounded w-40 outline-none focus:ring-1 focus:ring-lilac-300 text-muted-foreground placeholder:text-ink-300"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchOpen(false) }} className="absolute right-1 text-ink-300 hover:text-muted-foreground">
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

      {view === 'dailylist' && (
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            onClick={() => setCardMode(false)}
            title="테이블 뷰"
            className={`p-1.5 rounded transition-colors ${!cardMode ? 'bg-muted text-foreground' : 'text-ink-400 hover:text-foreground hover:bg-muted'}`}
          >
            <LayoutList size={13} />
          </button>
          <button
            onClick={() => setCardMode(true)}
            title="카드 뷰"
            className={`p-1.5 rounded transition-colors ${cardMode ? 'bg-muted text-foreground' : 'text-ink-400 hover:text-foreground hover:bg-muted'}`}
          >
            <LayoutGrid size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
