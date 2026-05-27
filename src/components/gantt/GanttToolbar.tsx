'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useClickAway } from '@/hooks/use-click-away'
import { Plus, ChevronDown, Search, X, ArrowUpDown, Filter, Link2, PanelLeftOpen } from 'lucide-react'
import type { GanttCategory } from '@/types'

type ViewMode = 'month' | 'week' | 'day'
type SortMode = 'default' | 'start-asc' | 'end-desc' | 'priority-desc'

const SORT_LABELS: Record<SortMode, string> = {
  'default':       '입력순',
  'start-asc':     '시작일↑',
  'end-desc':      '종료일↓',
  'priority-desc': '우선순위↓',
}

interface Props {
  boardName?: string
  readOnly?: boolean
  sidebarClosed?: boolean
  onOpenSidebar?: () => void
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
  // share
  onShare?: () => void
  // inline mode (no wrapper div)
  inline?: boolean
}

export function GanttToolbar({
  boardName,
  readOnly,
  sidebarClosed = false,
  onOpenSidebar,
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
  onShare,
  inline = false,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [showFilter,     setShowFilter]     = useState(false)
  const [filterPos,      setFilterPos]      = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const [showSort,       setShowSort]       = useState(false)
  const [sortPos,        setSortPos]        = useState<{ top: number; right: number; width: number }>({ top: 0, right: 0, width: 0 })
  const [showAddProject, setShowAddProject] = useState(false)
  const [addProjectPos,  setAddProjectPos]  = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  const searchInputRef   = useRef<HTMLInputElement>(null)
  const filterBtnRef     = useRef<HTMLButtonElement>(null)
  const sortBtnRef       = useRef<HTMLButtonElement>(null)
  const addProjectBtnRef = useRef<HTMLButtonElement>(null)

  const searchRef     = useClickAway<HTMLDivElement>(searchOpen,      () => { if (!searchQuery) setSearchOpen(false) })
  const filterRef     = useClickAway<HTMLDivElement>(showFilter,      () => setShowFilter(false))
  const sortRef       = useClickAway<HTMLDivElement>(showSort,        () => setShowSort(false))
  const addProjectRef = useClickAway<HTMLDivElement>(showAddProject,  () => setShowAddProject(false))

  const toggleFilter = useCallback(() => {
    setShowFilter(v => {
      if (!v && filterBtnRef.current) {
        const rect = filterBtnRef.current.getBoundingClientRect()
        setFilterPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
      }
      return !v
    })
  }, [])

  const totalExcluded = excludedTeams.size + excludedPMs.size

  // 검색이 열렸을 때 자동 포커스
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const hasAnyFilter = allTeams.length > 0 || allPMs.length > 0
  const sortActive = sortMode !== 'default'

  const controls = (
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
                className="text-sm pl-6 pr-6 py-1 border rounded w-40 outline-none focus:ring-1 focus:ring-lilac-300 text-muted-foreground placeholder:text-ink-300"
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
          <div ref={filterRef}>
            <button
              ref={filterBtnRef}
              onClick={toggleFilter}
              className={`flex items-center gap-1 text-sm px-2 py-1 border rounded transition-colors ${
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
              <div className="fixed bg-card border rounded-lg shadow-lg py-1 w-[260px]" style={{ top: filterPos.top, right: filterPos.right, zIndex: 'var(--z-dialog)' }}>
                {allTeams.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 border-b flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">팀별 보기</span>
                      <div className="flex items-center gap-2">
                        {excludedTeams.size > 0 && (
                          <button
                            onClick={() => allTeams.filter(t => excludedTeams.has(t)).forEach(onToggleTeam)}
                            className="text-xs text-lilac-500 hover:text-lilac-600 whitespace-nowrap"
                          >
                            전체 선택
                          </button>
                        )}
                        {excludedTeams.size < allTeams.length && (
                          <button
                            onClick={() => allTeams.filter(t => !excludedTeams.has(t)).forEach(onToggleTeam)}
                            className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
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
                        <span className="text-sm text-foreground">{team || '팀 없음'}</span>
                      </label>
                    ))}
                  </>
                )}

                {allPMs.length > 0 && (
                  <>
                    <div className={`px-3 py-1.5 ${allTeams.length > 0 ? 'border-t border-b mt-1' : 'border-b'} flex items-center justify-between gap-2`}>
                      <span className="text-sm font-semibold text-muted-foreground">PM별 보기</span>
                      <div className="flex items-center gap-2">
                        {excludedPMs.size > 0 && (
                          <button
                            onClick={() => allPMs.filter(p => excludedPMs.has(p)).forEach(onTogglePM)}
                            className="text-xs text-lilac-500 hover:text-lilac-600 whitespace-nowrap"
                          >
                            전체 선택
                          </button>
                        )}
                        {excludedPMs.size < allPMs.length && (
                          <button
                            onClick={() => allPMs.filter(p => !excludedPMs.has(p)).forEach(onTogglePM)}
                            className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
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
                        <span className="text-sm text-foreground">{pm || 'PM 없음'}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 뷰 모드 */}
        <div className="flex items-center gap-0.5 border rounded overflow-hidden text-sm">
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
        <div ref={sortRef}>
          <button
            ref={sortBtnRef}
            onClick={() => {
              setShowSort(v => {
                if (!v && sortBtnRef.current) {
                  const rect = sortBtnRef.current.getBoundingClientRect()
                  setSortPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right, width: rect.width })
                }
                return !v
              })
            }}
            className={`flex items-center gap-1 text-sm px-2 py-1 border rounded transition-colors ${
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
            <div className="fixed bg-card border rounded-lg shadow-lg py-0.5 w-max" style={{ top: sortPos.top, right: sortPos.right, minWidth: sortPos.width, zIndex: 'var(--z-dialog)' }}>
              {(Object.keys(SORT_LABELS) as SortMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => { onSortModeChange(mode); setShowSort(false) }}
                  className={`block w-full text-left px-3 py-1 text-sm whitespace-nowrap transition-colors ${
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

        {/* 공유 */}
        {!readOnly && onShare && (
          <button
            onClick={onShare}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-lilac-600 border border-border hover:border-lilac-300 px-3 py-1.5 rounded transition-colors"
          >
            <Link2 size={13} /> 공유
          </button>
        )}

        {/* 카테고리 추가 */}
        {!readOnly && onAddCategory && (
          <button
            onClick={onAddCategory}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-lilac-600 border border-border hover:border-lilac-300 px-3 py-1.5 rounded transition-colors"
          >
            <Plus size={13} /> 카테고리
          </button>
        )}

        {/* 프로젝트 추가 */}
        {!readOnly && sortedCats.length > 0 && (
          <button
            onClick={() => onAddProject(sortedCats[0].id)}
            className="flex items-center gap-1 text-sm font-medium text-background bg-foreground hover:bg-ink-800 px-3 py-1.5 rounded transition-colors"
          >
            <Plus size={13} /> 프로젝트 추가
          </button>
        )}
      </div>
  )

  if (inline) return controls

  return (
    <div className="flex items-center px-3 h-12 border-b shrink-0 gap-2">
      {sidebarClosed && onOpenSidebar && (
        <button
          onClick={onOpenSidebar}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="사이드바 열기"
        >
          <PanelLeftOpen size={15} />
        </button>
      )}
      {boardName && (
        <h1 className="text-xl font-semibold text-foreground whitespace-nowrap">{boardName}</h1>
      )}
      <div className="flex-1" />
      {controls}
    </div>
  )
}
