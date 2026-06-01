'use client'

import React from 'react'
import { Plus, Search, X, CheckSquare } from 'lucide-react'
import { VIEW_TABS, type ViewType } from '../_constants'
import { Switch } from '@/components/ui/switch'

interface TasksActionBarProps {
  view: ViewType
  onViewChange: (v: ViewType) => void
  // 검색
  searchOpen: boolean
  onSearchOpenChange: (v: boolean) => void
  searchQuery: string
  onSearchQueryChange: (v: string) => void
  searchRef: React.RefObject<HTMLDivElement | null>
  searchInputRef: React.RefObject<HTMLInputElement | null>
  // 선택
  selectionMode: boolean
  onToggleSelection: () => void
  // 완료 숨김
  hideDone: boolean
  onHideDoneChange: (v: boolean) => void
  // 추가
  onAdd: () => void
}

export function TasksActionBar({
  view, onViewChange,
  searchOpen, onSearchOpenChange, searchQuery, onSearchQueryChange,
  searchRef, searchInputRef,
  selectionMode, onToggleSelection,
  hideDone, onHideDoneChange,
  onAdd,
}: TasksActionBarProps) {
  return (
    <>
      <div className="h-12 flex items-stretch border-b bg-card shrink-0">
        {/* 뷰 탭 */}
        <nav className="flex items-stretch pl-3">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => onViewChange(tab.key)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                view === tab.key
                  ? 'border-lilac-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-ink-200'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* 검색 */}
        <div ref={searchRef} className="relative flex items-center ml-auto mr-1">
          {searchOpen || searchQuery ? (
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2 text-ink-300 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => onSearchQueryChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { onSearchQueryChange(''); onSearchOpenChange(false) } }}
                placeholder="태스크 검색"
                className="text-sm pl-6 pr-6 py-1 border rounded w-40 outline-none focus:ring-1 focus:ring-lilac-300 text-muted-foreground placeholder:text-ink-300"
              />
              {searchQuery && (
                <button
                  onClick={() => { onSearchQueryChange(''); onSearchOpenChange(false) }}
                  className="absolute right-1 text-ink-300 hover:text-muted-foreground"
                  title="지우기"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => onSearchOpenChange(true)}
              title="태스크 검색"
              className="p-1.5 rounded text-ink-400 hover:text-muted-foreground hover:bg-muted transition-colors"
            >
              <Search size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mr-3">
          <Switch
            checked={!hideDone}
            onCheckedChange={(show) => onHideDoneChange(!show)}
            label="완료 포함"
            title={hideDone ? '완료 태스크 보이기' : '완료 태스크 숨기기'}
            offClassName="bg-border"
            className="hidden sm:flex text-sm text-muted-foreground flex-row-reverse"
          />
          {(view === 'basic' || view === 'listview') && (
            <button
              onClick={onToggleSelection}
              className={`hidden sm:flex items-center gap-1 text-sm px-2.5 py-1.5 rounded transition-colors ${
                selectionMode
                  ? 'bg-lilac-100 text-lilac-700 font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="선택 모드"
            >
              <CheckSquare size={13} />
              {selectionMode ? '선택 중' : '선택'}
            </button>
          )}
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-sm font-medium text-background bg-foreground hover:bg-ink-800 px-2.5 py-1.5 rounded transition-colors"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">태스크 추가</span>
          </button>
        </div>
      </div>

    </>
  )
}
