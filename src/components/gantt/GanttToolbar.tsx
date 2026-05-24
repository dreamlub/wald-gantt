'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, ChevronDown, Undo2, Redo2, Search, X, ArrowUpDown, Filter } from 'lucide-react'
import type { GanttCategory } from '@/types'

type ViewMode = 'month' | 'week' | 'day'
type SortMode = 'default' | 'start-asc' | 'end-desc' | 'priority-desc'

const SORT_LABELS: Record<SortMode, string> = {
  'default':       '입력순',
  'start-asc':     '시작일 ↑',
  'end-desc':      '종료일 ↓',
  'priority-desc': '우선순위 ↓',
}

interface Props {
  boardName?: string
  readOnly?: boolean
  // undo / redo
  undoCount?: number
  onUndo?: () => void
  redoCount?: number
  onRedo?: () => void
  // overdue indicator/filter
  overdueCount?: number
  overdueFilter?: boolean
  onToggleOverdueFilter?: () => void
  // start-delayed indicator/filter
  startDelayedCount?: number
  startDelayedFilter?: boolean
  onToggleStartDelayedFilter?: () => void
  // search
  searchQuery: string
  onSearchChange: (v: string) => void
  // team filter
  allTeams: string[]
  excludedTeams: Set<string>
  onToggleTeam: (team: string) => void
  // pm filter
  allPMs: string[]
  excludedPMs: Set<string>
  onTogglePM: (pm: string) => void
  // view
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  // sort
  sortMode: SortMode
  onSortModeChange: (v: SortMode) => void
  // add project
  sortedCats: GanttCategory[]
  onAddProject: (categoryId: string) => void
  // add category
  onAddCategory?: () => void
}

export function GanttToolbar({
  boardName, readOnly,
  undoCount = 0, onUndo, redoCount = 0, onRedo,
  overdueCount = 0, overdueFilter = false, onToggleOverdueFilter,
  startDelayedCount = 0, startDelayedFilter = false, onToggleStartDelayedFilter,
  searchQuery, onSearchChange,
  allTeams, excludedTeams, onToggleTeam,
  allPMs, excludedPMs, onTogglePM,
  viewMode, onViewModeChange,
  sortMode, onSortModeChange,
  sortedCats, onAddProject,
  onAddCategory,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [showSort,   setShowSort]   = useState(false)

  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const sortRef   = useRef<HTMLDivElement>(null)

  const totalExcluded = excludedTeams.size + excludedPMs.size

  // 검색이 열렸을 때 자동 포커스
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  // 검색 — 외부 클릭 시 값이 비어있으면 자동 닫힘
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!searchRef.current?.contains(e.target as Node)) {
        if (!searchQuery) setSearchOpen(false)
      }
    }
    if (searchOpen) document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [searchOpen, searchQuery])

  // 필터 드롭다운 외부 클릭 닫힘
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setShowFilter(false)
    }
    if (showFilter) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showFilter])

  // 정렬 드롭다운 외부 클릭 닫힘
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node))
        setShowSort(false)
    }
    if (showSort) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showSort])

  const hasAnyFilter = allTeams.length > 0 || allPMs.length > 0
  const sortActive = sortMode !== 'default'

  return (
    <div className="flex items-center justify-between px-5 py-2 border-b shrink-0">
      {/* 왼쪽: 타이틀 + 보드명 + undo */}
      <div className="flex items-center gap-2">
        {!readOnly && onUndo && (
          <button
            onClick={onUndo}
            disabled={undoCount === 0}
            title={`실행 취소 (Ctrl+Z)${undoCount > 0 ? ` — ${undoCount}단계` : ''}`}
            className="flex items-center gap-1 text-2xs px-2 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Undo2 size={13} />
            {undoCount > 0 && <span className="tabular-nums">{undoCount}</span>}
          </button>
        )}
        {!readOnly && onRedo && (
          <button
            onClick={onRedo}
            disabled={redoCount === 0}
            title={`다시 실행 (Ctrl+Y)${redoCount > 0 ? ` — ${redoCount}단계` : ''}`}
            className="flex items-center gap-1 text-2xs px-2 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Redo2 size={13} />
            {redoCount > 0 && <span className="tabular-nums">{redoCount}</span>}
          </button>
        )}
        {overdueCount > 0 && onToggleOverdueFilter && (
          <button
            onClick={onToggleOverdueFilter}
            title={overdueFilter ? '전체 보기' : '마감 지연 프로젝트만 보기'}
            className={`flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full border transition-colors ${
              overdueFilter
                ? 'bg-status-late text-white border-status-late'
                : 'bg-status-late/10 text-status-late border-status-late/15 hover:bg-status-late/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            지연 {overdueCount}건
          </button>
        )}
        {startDelayedCount > 0 && onToggleStartDelayedFilter && (
          <button
            onClick={onToggleStartDelayedFilter}
            title={startDelayedFilter ? '전체 보기' : '시작 지연 프로젝트만 보기'}
            className={`flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full border transition-colors ${
              startDelayedFilter
                ? 'bg-status-warn text-white border-status-warn'
                : 'bg-status-warn/10 text-status-warn border-status-warn/15 hover:bg-status-warn/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            시작 지연 {startDelayedCount}건
          </button>
        )}
      </div>

      {/* 오른쪽: 각종 컨트롤 */}
      <div className="flex items-center gap-2">
        {/* 검색 — 토글 펼침 */}
        <div ref={searchRef} className="relative flex items-center">
          {searchOpen || searchQuery ? (
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2 text-ink-300 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { onSearchChange(''); setSearchOpen(false) } }}
                placeholder="프로젝트 검색"
                className="text-2xs pl-6 pr-6 py-1 border rounded w-40 outline-none focus:ring-1 focus:ring-lilac-300 text-muted-foreground placeholder:text-ink-300"
              />
              {searchQuery && (
                <button
                  onClick={() => { onSearchChange(''); setSearchOpen(false) }}
                  className="absolute right-1 text-ink-300 hover:text-muted-foreground"
                  title="지우기"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              title="프로젝트 검색"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Search size={13} />
            </button>
          )}
        </div>

        {/* 통합 필터 (팀 + PM) */}
        {hasAnyFilter && (
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(v => !v)}
              className={`flex items-center gap-1 text-2xs px-2 py-1 border rounded transition-colors ${
                totalExcluded > 0
                  ? 'border-lilac-300 bg-lilac-100 text-lilac-600 font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Filter size={11} />
              필터
              {totalExcluded > 0 && (
                <span className="bg-lilac-500 text-white rounded-full text-4xs w-3.5 h-3.5 flex items-center justify-center">
                  {totalExcluded}
                </span>
              )}
              <ChevronDown size={11} />
            </button>
            {showFilter && (
              <div className="absolute right-0 top-full mt-1 bg-card border rounded-lg shadow-lg z-50 min-w-[200px] py-1">
                {allTeams.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 border-b flex items-center justify-between gap-2">
                      <span className="text-2xs font-semibold text-muted-foreground">팀별 보기</span>
                      <div className="flex items-center gap-2">
                        {excludedTeams.size > 0 && (
                          <button
                            onClick={() => allTeams.filter(t => excludedTeams.has(t)).forEach(onToggleTeam)}
                            className="text-3xs text-lilac-500 hover:text-lilac-600"
                          >
                            전체 선택
                          </button>
                        )}
                        {excludedTeams.size < allTeams.length && (
                          <button
                            onClick={() => allTeams.filter(t => !excludedTeams.has(t)).forEach(onToggleTeam)}
                            className="text-3xs text-muted-foreground hover:text-foreground"
                          >
                            전체 해제
                          </button>
                        )}
                      </div>
                    </div>
                    {allTeams.map(team => (
                      <label key={team} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!excludedTeams.has(team)}
                          onChange={() => onToggleTeam(team)}
                          className="w-3 h-3 rounded accent-lilac-500"
                        />
                        <span className="text-xs text-foreground">{team || '팀 없음'}</span>
                      </label>
                    ))}
                  </>
                )}

                {allPMs.length > 0 && (
                  <>
                    <div className={`px-3 py-1.5 ${allTeams.length > 0 ? 'border-t border-b mt-1' : 'border-b'} flex items-center justify-between gap-2`}>
                      <span className="text-2xs font-semibold text-muted-foreground">PM별 보기</span>
                      <div className="flex items-center gap-2">
                        {excludedPMs.size > 0 && (
                          <button
                            onClick={() => allPMs.filter(p => excludedPMs.has(p)).forEach(onTogglePM)}
                            className="text-3xs text-lilac-500 hover:text-lilac-600"
                          >
                            전체 선택
                          </button>
                        )}
                        {excludedPMs.size < allPMs.length && (
                          <button
                            onClick={() => allPMs.filter(p => !excludedPMs.has(p)).forEach(onTogglePM)}
                            className="text-3xs text-muted-foreground hover:text-foreground"
                          >
                            전체 해제
                          </button>
                        )}
                      </div>
                    </div>
                    {allPMs.map(pm => (
                      <label key={pm} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!excludedPMs.has(pm)}
                          onChange={() => onTogglePM(pm)}
                          className="w-3 h-3 rounded accent-lilac-500"
                        />
                        <span className="text-xs text-foreground">{pm || 'PM 없음'}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 뷰 모드 */}
        <div className="flex items-center gap-0.5 border rounded overflow-hidden text-2xs">
          {(['month', 'week', 'day'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-2 py-1 transition-colors ${viewMode === mode ? 'bg-lilac-100 text-lilac-600 font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {mode === 'month' ? '월' : mode === 'week' ? '주' : '일'}
            </button>
          ))}
        </div>

        {/* 정렬 드롭다운 */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setShowSort(v => !v)}
            className={`flex items-center gap-1 text-2xs px-2 py-1 border rounded transition-colors ${
              sortActive
                ? 'border-lilac-300 bg-lilac-100 text-lilac-600 font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowUpDown size={11} />
            {SORT_LABELS[sortMode]}
            <ChevronDown size={11} />
          </button>
          {showSort && (
            <div className="absolute right-0 top-full mt-1 bg-card border rounded-lg shadow-lg z-50 min-w-[140px] py-1">
              {(Object.keys(SORT_LABELS) as SortMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => { onSortModeChange(mode); setShowSort(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    sortMode === mode
                      ? 'bg-lilac-100 text-lilac-600 font-medium'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {SORT_LABELS[mode]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 카테고리 추가 */}
        {!readOnly && onAddCategory && (
          <button
            onClick={onAddCategory}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-lilac-600 border border-border hover:border-lilac-300 px-3 py-1.5 rounded transition-colors"
          >
            <Plus size={13} /> 카테고리
          </button>
        )}

        {/* 프로젝트 추가 */}
        {!readOnly && sortedCats.length > 0 && (
          <button
            onClick={() => onAddProject(sortedCats[0].id)}
            className="flex items-center gap-1 text-xs font-medium text-background bg-foreground hover:bg-ink-800 px-3 py-1.5 rounded transition-colors"
          >
            <Plus size={13} /> 프로젝트 추가
          </button>
        )}
      </div>
    </div>
  )
}
