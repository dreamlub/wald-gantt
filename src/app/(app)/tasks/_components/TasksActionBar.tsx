'use client'

import React from 'react'
import { Plus, Search, X, PanelLeftOpen, CheckSquare } from 'lucide-react'
import { VIEW_TABS, ASSIGNEE_COLORS, type ViewType } from '../_constants'

interface TasksActionBarProps {
  sidebarOpen: boolean
  onSidebarOpen: () => void
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
  // 담당자 필터 바 (사이드바 닫힘 시)
  allAssignees: { key: string; label: string }[]
  filterAssignee: string | null
  onFilterAssigneeChange: (key: string | null) => void
}

export function TasksActionBar({
  sidebarOpen, onSidebarOpen,
  view, onViewChange,
  searchOpen, onSearchOpenChange, searchQuery, onSearchQueryChange,
  searchRef, searchInputRef,
  selectionMode, onToggleSelection,
  hideDone, onHideDoneChange,
  onAdd,
  allAssignees, filterAssignee, onFilterAssigneeChange,
}: TasksActionBarProps) {
  return (
    <>
      <div className="h-12 flex items-center border-b bg-card shrink-0 px-4 gap-2">
        {!sidebarOpen && (
          <button
            onClick={onSidebarOpen}
            className="p-1.5 rounded text-ink-400 hover:text-muted-foreground hover:bg-muted transition-colors"
            title="사이드바 열기"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}

        {/* 뷰 탭 */}
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => onViewChange(tab.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                ${view === tab.key
                  ? 'bg-card text-ink-700 shadow-sm'
                  : 'text-muted-foreground hover:text-ink-700'}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div ref={searchRef} className="relative flex items-center ml-2">
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
                className="text-[11px] pl-6 pr-6 py-1 border rounded w-40 outline-none focus:ring-1 focus:ring-lilac-300 text-muted-foreground placeholder:text-ink-300"
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

        <div className="ml-auto flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 cursor-pointer select-none"
            onClick={() => onHideDoneChange(!hideDone)}
            title={hideDone ? '완료 태스크 보이기' : '완료 태스크 숨기기'}
          >
            <span className="text-xs text-muted-foreground">완료 포함</span>
            <div
              role="switch"
              aria-checked={!hideDone}
              className={`relative w-7 h-4 rounded-full transition-colors duration-200 ${hideDone ? 'bg-border' : 'bg-foreground'}`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${hideDone ? 'translate-x-0.5' : 'translate-x-3.5'}`} />
            </div>
          </div>
          {(view === 'normal' || view === 'list') && (
            <button
              onClick={onToggleSelection}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded transition-colors ${
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
            className="flex items-center gap-1 text-xs font-medium text-background bg-foreground hover:bg-ink-800 px-3 py-1.5 rounded transition-colors"
          >
            <Plus size={13} /> 태스크 추가
          </button>
        </div>
      </div>

      {/* 담당자 필터 바 — 사이드바 닫혔을 때만 */}
      {!sidebarOpen && (view === 'normal' || view === 'list' || view === 'kanban') && allAssignees.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-card shrink-0 overflow-x-auto">
          <button
            onClick={() => onFilterAssigneeChange(null)}
            className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap
              ${!filterAssignee ? 'bg-foreground border-foreground text-white' : 'border-border text-muted-foreground hover:border-ink-400'}`}
          >
            전체
          </button>
          {allAssignees.map(({ key, label }, i) => {
            const color = ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length]
            const active = filterAssignee === key
            return (
              <button
                key={key}
                onClick={() => onFilterAssigneeChange(active ? null : key)}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap
                  ${active ? 'text-white border-transparent' : 'border-border text-muted-foreground hover:border-ink-400'}`}
                style={active ? { backgroundColor: color, borderColor: color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? 'white' : color }} />
                {label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
