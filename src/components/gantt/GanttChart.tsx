'use client'

import { useState, useEffect, useLayoutEffect } from 'react'
import {
  DndContext, closestCenter, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDndSensors } from '@/lib/dnd-utils'
import { Plus, GripVertical, Undo2, Redo2 } from 'lucide-react'
import { GanttToolbar } from './GanttToolbar'
import { dayOffset, dayOffsetInWeeks } from '@/lib/gantt-utils'
import type { WeekInfo, DayInfo } from '@/lib/gantt-utils'
import type { GanttCategory, GanttProject, GanttStatus } from '@/types'
import { ASSIGNEE_COLORS } from '@/app/(app)/tasks/_constants'
import { MemoTooltip } from '@/components/MemoTooltip'
import {
  CAT_ROW_H, PROJ_ROW_H, CAT_COLORS, STATUS_META, STATUS_ORDER,
  randomCatColor, isProjectOverdue, isStartDelayed,
  GanttCategoryLeft, GanttCategoryRight,
} from './_GanttRows'
import {
  LEFT_WIDTH_DEFAULT, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX, HEADER_H,
  type ViewMode,
} from './_GanttConstants'
import { useGanttDnd } from './_useGanttDnd'
import { useBarDrag, colIndexToDate } from './_useBarDrag'
import { useGanttScroll } from './_useGanttScroll'
import { useGanttViewData } from './_useGanttViewData'
import { GanttTimelineHeader } from './_GanttTimelineHeader'
import { CategoryAddDialog } from './_CategoryAddDialog'

interface Props {
  categories: GanttCategory[]
  projects: GanttProject[]
  viewStart: string
  viewEnd: string
  boardName?: string
  undoCount?: number
  onUndo?: () => void
  redoCount?: number
  onRedo?: () => void
  onAddCategory: (name: string, color: string) => Promise<void>
  onUpdateCategory: (id: string, updates: { name?: string; color?: string }) => Promise<void>
  onDeleteCategory: (id: string) => Promise<void>
  onAddProject: (categoryId: string) => void
  onEditProject: (project: GanttProject) => void
  onDeleteProject: (id: string) => void
  onShowHistory: (project: GanttProject) => void
  onOpenMemo: (project: GanttProject) => void
  onUpdateProjectDates: (id: string, startMonth: string, endMonth: string) => Promise<void>
  onUpdateProjectName: (id: string, name: string) => Promise<void>
  onUpdateProjectStatus: (id: string, status: GanttStatus) => Promise<void>
  onMoveProject: (updates: { id: string; category_id: string; sort_order: number }[]) => Promise<void>
  onMoveCategory?: (updates: { id: string; sort_order: number }[]) => Promise<void>
  onShare?: () => void
  overdueFilter?: boolean
  startDelayedFilter?: boolean
  readOnly?: boolean
  hideToolbar?: boolean
  sidebarClosed?: boolean
  onOpenSidebar?: () => void
}

// ── GanttChart ────────────────────────────────────────────────
export function GanttChart({
  categories, projects, viewStart, viewEnd, boardName,
  undoCount = 0, onUndo, redoCount = 0, onRedo,
  onAddCategory, onUpdateCategory, onDeleteCategory,
  onAddProject, onEditProject, onDeleteProject, onOpenMemo,
  onUpdateProjectDates, onUpdateProjectStatus,
  onMoveProject, onMoveCategory, onShare,
  overdueFilter: externalOverdueFilter, startDelayedFilter: externalStartDelayedFilter,
  readOnly = false,
  hideToolbar = false,
  sidebarClosed = false,
  onOpenSidebar,
}: Props) {
  const [leftWidth, setLeftWidth]           = useState(LEFT_WIDTH_DEFAULT)
  const [viewMode, setViewMode]             = useState<ViewMode>(() => (typeof window !== 'undefined' ? localStorage.getItem('wald.gantt.viewMode') as ViewMode : null) ?? 'week')
  const changeViewMode = (v: ViewMode) => { localStorage.setItem('wald.gantt.viewMode', v); setViewMode(v) }
  const [editCatId, setEditCatId]           = useState<string | null>(null)
  const [editCatVal, setEditCatVal]         = useState('')
  const [addingCat, setAddingCat]           = useState(false)
  const [newCatName, setNewCatName]         = useState('')
  const [newCatColor, setNewCatColor]       = useState<string>(CAT_COLORS[0])
  const [sortMode, setSortMode]           = useState<'default' | 'start-asc' | 'end-desc' | 'priority-desc'>(() => (typeof window !== 'undefined' ? localStorage.getItem('wald.gantt.sortMode') as 'default' | 'start-asc' | 'end-desc' | 'priority-desc' : null) ?? 'default')
  const changeSortMode = (v: 'default' | 'start-asc' | 'end-desc' | 'priority-desc') => { localStorage.setItem('wald.gantt.sortMode', v); setSortMode(v) }
  const [excludedTeams, setExcludedTeams] = useState<Set<string>>(new Set())
  const [excludedPMs, setExcludedPMs]     = useState<Set<string>>(new Set())
  const [internalOverdueFilter, setInternalOverdueFilter] = useState(false)
  const [internalStartDelayedFilter, setInternalStartDelayedFilter] = useState(false)
  const overdueFilter = externalOverdueFilter ?? internalOverdueFilter
  const startDelayedFilter = externalStartDelayedFilter ?? internalStartDelayedFilter
  const [searchQuery, setSearchQuery]       = useState('')
  const [memoHover, setMemoHover]           = useState<{ text: string; x: number; y: number } | null>(null)

  const sensors = useDndSensors()

  // 뷰 모드별 파생 값
  const {
    months, colW, weeks, days, totalCols, totalWidth,
    yearGroups, monthGroups, gridLinePositions,
    todayStr, todayYM, todayX,
  } = useGanttViewData(viewMode, viewStart, viewEnd)

  const allTeams   = [...new Set(projects.map(p => p.team || ''))].sort()
  const allPMs     = [...new Set(projects.map(p => p.pm || ''))].sort()

  const overdueCount = projects.filter(p => isProjectOverdue(p, todayStr)).length
  const startDelayedCount = projects.filter(p => isStartDelayed(p, todayStr) && !isProjectOverdue(p, todayStr)).length

  const pmColorMap = new Map<string, string>()
  allPMs.filter(Boolean).forEach((pm, i) => pmColorMap.set(pm, ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length]))
  const catIdSet   = new Set(categories.map(c => c.id))

  const defaultSortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  const {
    liveItems, liveCats, isCatDrag,
    activeCatForOverlay, activeProjForOverlay,
    handleDragStart, handleDragOver, handleDragEnd, handleDragCancel,
  } = useGanttDnd({
    categories, projects, sortedCats: defaultSortedCats, catIdSet,
    onMoveProject, onMoveCategory,
  })

  const sortedCats = liveCats
    ? liveCats.map(id => categories.find(c => c.id === id)!).filter(Boolean)
    : defaultSortedCats

  const projectsOf = (catId: string): GanttProject[] => {
    let base: GanttProject[]
    if (sortMode === 'default' && liveItems) {
      const ids = liveItems[catId] ?? []
      const projMap = new Map(projects.map(p => [p.id, p]))
      base = ids.map(id => projMap.get(id)).filter((p): p is GanttProject => !!p)
    } else {
      base = projects.filter(p => p.category_id === catId)
    }
    if (searchQuery.trim())
      base = base.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    if (excludedTeams.size > 0)
      base = base.filter(p => !excludedTeams.has(p.team || ''))
    if (excludedPMs.size > 0)
      base = base.filter(p => !excludedPMs.has(p.pm || ''))
    if (overdueFilter || startDelayedFilter)
      base = base.filter(p =>
        (overdueFilter && isProjectOverdue(p, todayStr)) ||
        (startDelayedFilter && isStartDelayed(p, todayStr) && !isProjectOverdue(p, todayStr))
      )
    if (!liveItems) {
      if (sortMode === 'start-asc')
        return [...base].sort((a, b) => (a.start_date ?? 'zzzz') < (b.start_date ?? 'zzzz') ? -1 : 1)
      if (sortMode === 'end-desc')
        return [...base].sort((a, b) => (a.end_date ?? '') > (b.end_date ?? '') ? -1 : 1)
      if (sortMode === 'priority-desc')
        return [...base].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      return [...base].sort((a, b) => a.sort_order - b.sort_order)
    }
    return base
  }

  function barCols(p: GanttProject): { start: number; end: number } | null {
    if (!p.start_date || !p.end_date) return null
    if (viewMode === 'month') {
      const s = dayOffset(viewStart, p.start_date, 'start')
      const e = dayOffset(viewStart, p.end_date, 'end')
      if (s >= totalCols || e <= 0) return null
      return { start: Math.max(0, s), end: Math.min(totalCols, e) }
    } else if (viewMode === 'week') {
      const s = dayOffsetInWeeks(weeks, p.start_date, 'start')
      const e = dayOffsetInWeeks(weeks, p.end_date, 'end')
      if (s >= totalCols || e <= 0) return null
      return { start: Math.max(0, s), end: Math.min(totalCols, e) }
    } else {
      const si = days.findIndex(d => d.key === p.start_date)
      const ei = days.findIndex(d => d.key === p.end_date)
      const s = si >= 0 ? si : 0
      const e = ei >= 0 ? ei + 1 : days.length
      if (s >= totalCols || e <= 0) return null
      return { start: Math.max(0, s), end: Math.min(totalCols, e) }
    }
  }

  function handleBarCreate(projectId: string, colIndex: number) {
    const startDate = colIndexToDate(viewMode, totalCols, viewStart, days, weeks, colIndex)
    if (!startDate) return
    const start = new Date(startDate + 'T00:00:00')
    const daysToAdd = viewMode === 'month' ? 29 : 6
    const end = new Date(start)
    end.setDate(end.getDate() + daysToAdd)
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    onUpdateProjectDates(projectId, startDate, endDate)
  }

  // Hooks
  const {
    leftRef, leftPanelRef, rightRef, headerRef, stickyScrollRef,
    onRightScroll, onStickyScroll,
  } = useGanttScroll(viewMode, viewStart, viewEnd)

  const { barDrag, makeDragHandlers } = useBarDrag({
    viewMode, viewStart, viewEnd, totalCols, onUpdateProjectDates,
  })

  // 필터/정렬 변경 시 paint 전에 좌우 패널 scroll 강제 동기화
  // (LEFT 패널은 DndContext 안에 있어 SortableContext 업데이트로 extra render가 발생할 수 있음)
  useLayoutEffect(() => {
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, startDelayedFilter, overdueFilter, searchQuery, excludedTeams, excludedPMs])

  // 카테고리 추가 모달 열릴 때 랜덤 색상
  useEffect(() => {
    if (addingCat) setNewCatColor(randomCatColor(new Set(categories.map(c => c.color))))
  }, [addingCat, categories])

  // 왼쪽 패널 리사이즈
  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = leftWidth
    function onMove(me: MouseEvent) {
      const next = Math.min(LEFT_WIDTH_MAX, Math.max(LEFT_WIDTH_MIN, startW + me.clientX - startX))
      setLeftWidth(next)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // 카테고리 이름 인라인 편집
  function startEditCat(c: GanttCategory, e: React.MouseEvent) {
    e.stopPropagation(); setEditCatId(c.id); setEditCatVal(c.name)
  }
  async function commitEditCat(id: string) {
    if (editCatVal.trim()) await onUpdateCategory(id, { name: editCatVal.trim() })
    setEditCatId(null)
  }

  async function submitAddCat() {
    const name = newCatName.trim()
    if (name) await onAddCategory(name, newCatColor)
    setNewCatName(''); setAddingCat(false)
  }

  function cycleStatus(p: GanttProject) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(p.status) + 1) % STATUS_ORDER.length]
    onUpdateProjectStatus(p.id, next)
  }

  function toggleTeam(team: string) {
    setExcludedTeams(prev => { const next = new Set(prev); if (next.has(team)) next.delete(team); else next.add(team); return next })
  }
  function togglePM(pm: string) {
    setExcludedPMs(prev => { const next = new Set(prev); if (next.has(pm)) next.delete(pm); else next.add(pm); return next })
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 툴바 */}
      {!hideToolbar && (
        <GanttToolbar
          boardName={boardName}
          readOnly={readOnly}
          sidebarClosed={sidebarClosed}
          onOpenSidebar={onOpenSidebar}
          undoCount={undoCount}
          onUndo={onUndo}
          redoCount={redoCount}
          onRedo={onRedo}
          overdueCount={overdueCount}
          overdueFilter={overdueFilter}
          onToggleOverdueFilter={() => setInternalOverdueFilter(v => !v)}
          startDelayedCount={startDelayedCount}
          startDelayedFilter={startDelayedFilter}
          onToggleStartDelayedFilter={() => setInternalStartDelayedFilter(v => !v)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          allTeams={allTeams}
          excludedTeams={excludedTeams}
          onToggleTeam={toggleTeam}
          allPMs={allPMs}
          excludedPMs={excludedPMs}
          onTogglePM={togglePM}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          sortMode={sortMode}
          onSortModeChange={changeSortMode}
          sortedCats={sortedCats}
          onAddProject={onAddProject}
          onAddCategory={() => setAddingCat(true)}
          onShare={onShare}
        />
      )}

      {/* 메인 영역 */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽 패널 (고정, 레이블) ─────────────────────── */}
        <div
          ref={leftPanelRef}
          className="shrink-0 flex flex-col shadow-panel-l"
          style={{ width: leftWidth, overflowY: 'hidden', overflowX: 'hidden', zIndex: 'var(--z-overlay)' }}
        >
          <div className="shrink-0 border-b bg-card flex flex-col justify-between px-3" style={{ height: HEADER_H }}>
            {!readOnly && (
              <div className="flex items-center gap-1.5 pt-1.5">
                {onUndo && (
                  <button
                    onClick={onUndo}
                    disabled={undoCount === 0}
                    title={`실행 취소 (Ctrl+Z)${undoCount > 0 ? ` — ${undoCount}단계` : ''}`}
                    className="flex items-center gap-0.5 text-2xs px-1 py-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Undo2 size={11} />
                    {undoCount > 0 && <span className="tabular-nums">{undoCount}</span>}
                  </button>
                )}
                {onRedo && (
                  <button
                    onClick={onRedo}
                    disabled={redoCount === 0}
                    title={`다시 실행 (Ctrl+Y)${redoCount > 0 ? ` — ${redoCount}단계` : ''}`}
                    className="flex items-center gap-0.5 text-2xs px-1 py-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Redo2 size={11} />
                    {redoCount > 0 && <span className="tabular-nums">{redoCount}</span>}
                  </button>
                )}
                {overdueCount > 0 && (
                  <button
                    onClick={() => setInternalOverdueFilter(v => !v)}
                    className={`flex items-center gap-0.5 text-2xs font-medium px-1.5 py-0.5 rounded-full border transition-colors ${
                      overdueFilter
                        ? 'bg-status-late text-white border-status-late'
                        : 'bg-status-late/10 text-status-late border-status-late/15 hover:bg-status-late/20'
                    }`}
                  >
                    <span className="w-1 h-1 rounded-full bg-current" />
                    지연 {overdueCount}
                  </button>
                )}
                {startDelayedCount > 0 && (
                  <button
                    onClick={() => setInternalStartDelayedFilter(v => !v)}
                    className={`flex items-center gap-0.5 text-2xs font-medium px-1.5 py-0.5 rounded-full border transition-colors ${
                      startDelayedFilter
                        ? 'bg-status-warn text-white border-status-warn'
                        : 'bg-status-warn/10 text-status-warn border-status-warn/15 hover:bg-status-warn/20'
                    }`}
                  >
                    <span className="w-1 h-1 rounded-full bg-current" />
                    시작지연 {startDelayedCount}
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center justify-between pb-1.5">
              <span className="text-2xs font-semibold text-muted-foreground">프로젝트</span>
              {!readOnly && (
                <button
                  onClick={() => setAddingCat(true)}
                  className="flex items-center gap-0.5 text-2xs text-muted-foreground hover:text-foreground transition-colors"
                  title="카테고리 추가"
                >
                  <Plus size={11} /> 카테고리
                </button>
              )}
            </div>
          </div>
          <div
            ref={leftRef}
            className="flex-1 flex flex-col"
            style={{ overflowY: 'scroll', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="flex-1" onDoubleClick={e => {
                if ((e.target as HTMLElement).closest('[data-row]')) return
                setAddingCat(true)
              }}>
                {categories.length === 0 && !addingCat && (
                  <div
                    className="flex flex-col items-center justify-center h-28 text-muted-foreground text-xs gap-1 cursor-pointer select-none"
                    onDoubleClick={() => setAddingCat(true)}
                  >
                    <span>카테고리를 추가해 보세요</span>
                    <span className="text-xs text-ink-300">우측 상단 버튼 또는 더블클릭</span>
                  </div>
                )}
                <SortableContext items={sortedCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {sortedCats.map(cat => (
                    <GanttCategoryLeft
                      key={cat.id}
                      cat={cat}
                      catProjs={projectsOf(cat.id)}
                      readOnly={readOnly}
                      editCatId={editCatId}
                      editCatVal={editCatVal}
                      onEditCatValChange={setEditCatVal}
                      onCommitEditCat={commitEditCat}
                      onCancelEditCat={() => setEditCatId(null)}
                      onStartEditCat={startEditCat}
                      onDeleteCategory={onDeleteCategory}
                      onUpdateCategory={onUpdateCategory}
                      onAddProject={onAddProject}
                      onDeleteProject={onDeleteProject}
                      onEditProject={onEditProject}
                      onOpenMemo={onOpenMemo}
                      onSetMemoHover={setMemoHover}
                      onCycleStatus={cycleStatus}
                      todayStr={todayStr}
                    />
                  ))}
                </SortableContext>
              </div>

              {/* DragOverlay */}
              <DragOverlay dropAnimation={null}>
                {activeCatForOverlay ? (
                  <div
                    className="flex items-center gap-1.5 border border-lilac-300 bg-muted shadow-xl rounded px-2 cursor-grabbing"
                    style={{ height: CAT_ROW_H, width: leftWidth - 4, opacity: 0.95, borderLeft: `3px solid ${activeCatForOverlay.color}` }}
                  >
                    <GripVertical size={13} className="text-ink-400 shrink-0" />
                    <span className="text-xs font-bold text-foreground truncate flex-1">
                      {activeCatForOverlay.name}
                    </span>
                  </div>
                ) : activeProjForOverlay ? (() => {
                  const sm = STATUS_META[activeProjForOverlay.status]
                  return (
                    <div
                      className="flex items-center gap-1.5 border border-lilac-300 bg-card shadow-xl rounded px-2 cursor-grabbing"
                      style={{ height: PROJ_ROW_H, width: leftWidth - 4, opacity: 0.95 }}
                    >
                      <GripVertical size={13} className="text-ink-400 shrink-0" />
                      <span
                        className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-5xs font-bold text-white"
                        style={{ backgroundColor: sm.dot }}
                        aria-label={sm.label}
                      >
                        {sm.abbr}
                      </span>
                      <span className="text-xs font-medium text-foreground truncate flex-1">
                        {activeProjForOverlay.name}
                      </span>
                    </div>
                  )
                })() : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        {/* ── 리사이즈 핸들 ───────────────────────────────── */}
        <div
          onMouseDown={onResizeMouseDown}
          className="shrink-0 w-1 cursor-col-resize bg-transparent hover:bg-lilac-300 active:bg-lilac-400 transition-colors z-20 border-r border-border"
          title="드래그하여 너비 조절"
        />

        {/* ── 오른쪽 패널 (타임라인) ───────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 달력 헤더 */}
          <div
            ref={headerRef}
            className="shrink-0 overflow-hidden bg-card border-b"
            style={{ height: HEADER_H }}
          >
            <GanttTimelineHeader
              viewMode={viewMode}
              colW={colW}
              totalWidth={totalWidth}
              months={months}
              weeks={weeks}
              days={days}
              yearGroups={yearGroups}
              monthGroups={monthGroups}
              todayYM={todayYM}
              todayStr={todayStr}
              todayX={todayX}
            />
          </div>

          {/* 바 행 스크롤 영역 */}
          <div
            ref={rightRef}
            onScroll={onRightScroll}
            className="flex-1 overflow-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overscrollBehavior: 'contain' } as React.CSSProperties}
          >
            <div style={{ width: totalWidth }} className="relative bg-background">
              {gridLinePositions.map((x, i) => (
                <div
                  key={`gl-${i}`}
                  className="absolute top-0 bottom-0 w-px bg-border pointer-events-none"
                  style={{ left: x }}
                />
              ))}
              {todayX !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-lilac-400 opacity-70 z-10 pointer-events-none" style={{ left: todayX }} />
              )}
              {sortedCats.map(cat => (
                <GanttCategoryRight
                  key={cat.id}
                  cat={cat}
                  catProjs={projectsOf(cat.id)}
                  readOnly={readOnly}
                  colW={colW}
                  barCols={barCols}
                  makeDragHandlers={makeDragHandlers}
                  pmColorMap={pmColorMap}
                  onBarCreate={readOnly ? undefined : handleBarCreate}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 고정 스크롤바 */}
      <div
        ref={stickyScrollRef}
        className="shrink-0 overflow-x-auto overflow-y-hidden border-t bg-card"
        style={{ height: 14, marginLeft: leftWidth + 4 }}
        onScroll={onStickyScroll}
      >
        <div style={{ width: totalWidth, height: 1 }} />
      </div>

      {/* 바 드래그 overlay + tooltip */}
      {barDrag && (
        <>
          <div className="fixed inset-0 z-tooltip select-none" style={{ cursor: barDrag.cursor }} />
          {barDrag.tooltipText && (
            <div
              className="fixed z-drag pointer-events-none"
              style={{ left: barDrag.x, top: barDrag.y, transform: 'translate(-50%, calc(-100% - 10px))' }}
            >
              <span className="inline-block bg-foreground text-background text-2xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap shadow-tooltip">
                {barDrag.tooltipText}
              </span>
              <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-foreground" />
            </div>
          )}
        </>
      )}

      {/* 메모 hover 툴팁 */}
      {memoHover && <MemoTooltip memo={memoHover.text} x={memoHover.x} y={memoHover.y} />}

      {/* 카테고리 추가 모달 */}
      <CategoryAddDialog
        open={addingCat}
        onOpenChange={open => { if (!open) { setAddingCat(false); setNewCatName('') } }}
        newCatName={newCatName}
        onNameChange={setNewCatName}
        newCatColor={newCatColor}
        onColorChange={setNewCatColor}
        onSubmit={submitAddCat}
      />
    </div>
  )
}
