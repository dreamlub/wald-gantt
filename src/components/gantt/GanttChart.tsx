'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragOverlay,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  sortableKeyboardCoordinates, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, CalendarDays, GripVertical, Check, X, Clock, StickyNote } from 'lucide-react'
import { GanttToolbar } from './GanttToolbar'
import {
  buildMonthRange, monthOffset, formatYearMonth, parseYearMonth, MONTH_LABELS,
  buildWeekRange, dayOffset, dayOffsetInWeeks,
} from '@/lib/gantt-utils'
import type { WeekInfo } from '@/lib/gantt-utils'
import type { GanttCategory, GanttProject, GanttStatus } from '@/types'
import type { GhostDates } from '@/lib/gantt-service'

interface Props {
  categories: GanttCategory[]
  projects: GanttProject[]
  viewStart: string
  viewEnd: string
  boardName?: string
  ghostDates?: GhostDates | null
  onToggleGhost?: (enabled: boolean) => Promise<void>
  undoCount?: number
  onUndo?: () => void
  onAddCategory: (name: string) => Promise<void>
  onUpdateCategory: (id: string, name: string) => Promise<void>
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
  readOnly?: boolean
}

const COL_WIDTH      = 72
const WEEK_COL_WIDTH = 44
const LEFT_WIDTH  = 260
const YEAR_H      = 34
const MONTH_H     = 28
const TODAY_H     = 18
const HEADER_H    = YEAR_H + MONTH_H + TODAY_H  // 80
const CAT_ROW_H       = 32
const PROJ_ROW_H      = 36
const PROJ_ROW_H_CMP  = 56
const ADD_ROW_H   = 24

const PASTEL_COLORS = [
  '#a5b4fc', '#fdba74', '#86efac', '#93c5fd',
  '#f9a8d4', '#fde047', '#c4b5fd', '#7dd3fc',
]

const STATUS_META: Record<GanttStatus, { label: string; bg: string; color: string }> = {
  'in-progress': { label: 'In Progress', bg: '#dbeafe', color: '#1d4ed8' },
  'pending':     { label: 'Pending',     bg: '#fef3c7', color: '#b45309' },
  'backlog':     { label: 'Backlog',     bg: '#f3f4f6', color: '#6b7280' },
  'to-do':       { label: 'To-Do',       bg: '#ede9fe', color: '#6d28d9' },
  'done':        { label: 'Done',        bg: '#dcfce7', color: '#15803d' },
}
const STATUS_ORDER: GanttStatus[] = ['to-do', 'in-progress', 'pending', 'backlog', 'done']

type ViewMode = 'month' | 'week'

function formatBarDate(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-')
  const [ey, em, ed] = end.split('-')
  const sLabel = `${parseInt(sm)}/${parseInt(sd)}`
  const eLabel = `${parseInt(em)}/${parseInt(ed)}`
  if (sy === ey) return `${sLabel} ~ ${eLabel}`
  return `${sy.slice(2)}.${sLabel} ~ ${ey.slice(2)}.${eLabel}`
}

function daysInMonthLocal(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function indexToFirstDay(viewStart: string, index: number): string {
  const { year, month } = parseYearMonth(viewStart)
  const total = year * 12 + (month - 1) + index
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function indexToLastDay(viewStart: string, index: number): string {
  const { year, month } = parseYearMonth(viewStart)
  const total = year * 12 + (month - 1) + index
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  const d = daysInMonthLocal(y, m)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function weekIndexToDate(weeks: WeekInfo[], idx: number, edge: 'start' | 'end'): string {
  const w = weeks[Math.max(0, Math.min(idx, weeks.length - 1))]
  const d = new Date(w.weekStart)
  if (edge === 'end') d.setDate(d.getDate() + 6)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Sortable project row shell ────────────────────────────────
function SortableProjRow({ id, disabled, children }: {
  id: string
  disabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: (props: { listeners: any; isDragging: boolean }) => React.ReactNode
}) {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
    >
      {children({ listeners, isDragging })}
    </div>
  )
}

// ── GanttChart ────────────────────────────────────────────────
export function GanttChart({
  categories, projects, viewStart, viewEnd, boardName,
  ghostDates, onToggleGhost, undoCount = 0, onUndo,
  onAddCategory, onUpdateCategory, onDeleteCategory,
  onAddProject, onEditProject, onDeleteProject, onShowHistory, onOpenMemo,
  onUpdateProjectDates, onUpdateProjectName, onUpdateProjectStatus,
  onMoveProject, readOnly = false,
}: Props) {
  const months = buildMonthRange(viewStart, viewEnd)
  const leftRef         = useRef<HTMLDivElement>(null)
  const rightRef        = useRef<HTMLDivElement>(null)
  const headerRef       = useRef<HTMLDivElement>(null)
  const stickyScrollRef = useRef<HTMLDivElement>(null)

  const [viewMode, setViewMode]             = useState<ViewMode>('month')
  const [editProjId, setEditProjId]         = useState<string | null>(null)
  const [editProjVal, setEditProjVal]       = useState('')
  const [editCatId, setEditCatId]           = useState<string | null>(null)
  const [editCatVal, setEditCatVal]         = useState('')
  const [addingCat, setAddingCat]           = useState(false)
  const [newCatName, setNewCatName]         = useState('')
  const [sortMode, setSortMode]           = useState<'default' | 'start-asc' | 'end-desc'>('default')
  const [excludedTeams, setExcludedTeams] = useState<Set<string>>(new Set())
  const [excludedPMs, setExcludedPMs]     = useState<Set<string>>(new Set())
  const [ghostEnabled, setGhostEnabled]   = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const [activeId, setActiveId]             = useState<string | null>(null)
  const [liveItems, setLiveItems]           = useState<Record<string, string[]> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // 뷰 모드별 파생 값
  const colW       = viewMode === 'week' ? WEEK_COL_WIDTH : COL_WIDTH
  const weeks      = viewMode === 'week' ? buildWeekRange(viewStart, viewEnd) : ([] as WeekInfo[])
  const totalCols  = viewMode === 'week' ? weeks.length : months.length
  const totalWidth = colW * totalCols

  // 주 뷰 헤더용 그룹
  const yearGroups: { year: number; count: number }[] = []
  if (viewMode === 'month') {
    for (const ym of months) {
      const y = parseInt(ym.split('-')[0])
      if (!yearGroups.length || yearGroups[yearGroups.length - 1].year !== y)
        yearGroups.push({ year: y, count: 1 })
      else yearGroups[yearGroups.length - 1].count++
    }
  } else {
    for (const w of weeks) {
      if (!yearGroups.length || yearGroups[yearGroups.length - 1].year !== w.year)
        yearGroups.push({ year: w.year, count: 1 })
      else yearGroups[yearGroups.length - 1].count++
    }
  }

  const monthGroups: { ym: string; label: string; count: number }[] = []
  if (viewMode === 'week') {
    for (const w of weeks) {
      const ym = formatYearMonth(w.year, w.month)
      if (!monthGroups.length || monthGroups[monthGroups.length - 1].ym !== ym)
        monthGroups.push({ ym, label: MONTH_LABELS[w.month - 1], count: 1 })
      else monthGroups[monthGroups.length - 1].count++
    }
  }

  const allTeams   = [...new Set(projects.map(p => p.team || ''))].sort()
  const allPMs     = [...new Set(projects.map(p => p.pm || ''))].sort()
  const sortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  const projectsOf = (catId: string): GanttProject[] => {
    let base: GanttProject[]

    if (sortMode === 'default' && liveItems) {
      // During drag: use live order from dnd-kit state
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

    if (!liveItems) {
      if (sortMode === 'start-asc')
        return [...base].sort((a, b) => (a.start_date ?? 'zzzz') < (b.start_date ?? 'zzzz') ? -1 : 1)
      if (sortMode === 'end-desc')
        return [...base].sort((a, b) => (a.end_date ?? '') > (b.end_date ?? '') ? -1 : 1)
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
    } else {
      const s = dayOffsetInWeeks(weeks, p.start_date, 'start')
      const e = dayOffsetInWeeks(weeks, p.end_date, 'end')
      if (s >= totalCols || e <= 0) return null
      return { start: Math.max(0, s), end: Math.min(totalCols, e) }
    }
  }

  const today   = new Date()
  const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  let todayX: number | null = null
  if (viewMode === 'month') {
    const todayCol = monthOffset(viewStart, todayYM)
    todayX = todayCol >= 0 && todayCol < totalCols ? todayCol * colW + colW / 2 : null
  } else {
    const idx = weeks.findIndex(w => {
      const end = new Date(w.weekStart); end.setDate(end.getDate() + 6)
      return today >= w.weekStart && today <= end
    })
    todayX = idx >= 0 ? idx * colW + colW / 2 : null
  }

  // 스크롤 동기화
  function onRightScroll() {
    if (leftRef.current && rightRef.current)
      leftRef.current.scrollTop = rightRef.current.scrollTop
    if (headerRef.current && rightRef.current)
      headerRef.current.scrollLeft = rightRef.current.scrollLeft
    if (stickyScrollRef.current && rightRef.current)
      stickyScrollRef.current.scrollLeft = rightRef.current.scrollLeft
  }
  function onStickyScroll() {
    if (rightRef.current && stickyScrollRef.current)
      rightRef.current.scrollLeft = stickyScrollRef.current.scrollLeft
    if (headerRef.current && stickyScrollRef.current)
      headerRef.current.scrollLeft = stickyScrollRef.current.scrollLeft
  }
  function onLeftWheel(e: React.WheelEvent) {
    if (rightRef.current) rightRef.current.scrollTop += e.deltaY
  }

  // 뷰 모드 변경 시 today로 스크롤
  useEffect(() => {
    if (!rightRef.current) return
    const cw = viewMode === 'week' ? WEEK_COL_WIDTH : COL_WIDTH
    let scrollX = 0
    if (viewMode === 'month') {
      const now = new Date()
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      scrollX = Math.max(0, monthOffset(viewStart, ym) * cw - 200)
    } else {
      const now = new Date()
      const ws = buildWeekRange(viewStart, viewEnd)
      const idx = ws.findIndex(w => {
        const end = new Date(w.weekStart); end.setDate(end.getDate() + 6)
        return now >= w.weekStart && now <= end
      })
      scrollX = idx >= 0 ? Math.max(0, idx * cw - 200) : 0
    }
    rightRef.current.scrollLeft = scrollX
    if (headerRef.current) headerRef.current.scrollLeft = scrollX
  }, [viewMode, viewStart, viewEnd])

  // 프로젝트 이름 인라인 편집
  function startEditProj(p: GanttProject, e: React.MouseEvent) {
    e.stopPropagation(); setEditProjId(p.id); setEditProjVal(p.name)
  }
  async function commitEditProj(id: string) {
    if (editProjVal.trim()) await onUpdateProjectName(id, editProjVal.trim())
    setEditProjId(null)
  }

  // 카테고리 이름 인라인 편집
  function startEditCat(c: GanttCategory, e: React.MouseEvent) {
    e.stopPropagation(); setEditCatId(c.id); setEditCatVal(c.name)
  }
  async function commitEditCat(id: string) {
    if (editCatVal.trim()) await onUpdateCategory(id, editCatVal.trim())
    setEditCatId(null)
  }

  async function submitAddCat() {
    const name = newCatName.trim()
    if (name) await onAddCategory(name)
    setNewCatName(''); setAddingCat(false)
  }

  function cycleStatus(p: GanttProject) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(p.status) + 1) % STATUS_ORDER.length]
    onUpdateProjectStatus(p.id, next)
  }

  function toggleTeam(team: string) {
    setExcludedTeams(prev => {
      const next = new Set(prev)
      if (next.has(team)) next.delete(team); else next.add(team)
      return next
    })
  }

  function togglePM(pm: string) {
    setExcludedPMs(prev => {
      const next = new Set(prev)
      if (next.has(pm)) next.delete(pm); else next.add(pm)
      return next
    })
  }

  // ── 프로젝트 행 DnD (dnd-kit) ────────────────────────────
  function findContainer(items: Record<string, string[]>, id: string): string | undefined {
    if (id in items) return id
    for (const [catId, ids] of Object.entries(items)) {
      if (ids.includes(id)) return catId
    }
    return undefined
  }

  function handleProjDragStart({ active }: DragStartEvent) {
    const id = active.id as string
    setActiveId(id)
    const initial: Record<string, string[]> = {}
    for (const cat of sortedCats) {
      initial[cat.id] = projects
        .filter(p => p.category_id === cat.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(p => p.id)
    }
    setLiveItems(initial)
  }

  function handleProjDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const aid = active.id as string
    const oid = over.id as string

    setLiveItems(prev => {
      if (!prev) return prev
      const activeContainer = findContainer(prev, aid)
      const overContainer   = findContainer(prev, oid) ??
        (sortedCats.some(c => c.id === oid) ? oid : undefined)
      if (!activeContainer || !overContainer) return prev

      if (activeContainer === overContainer) {
        const list    = prev[activeContainer]
        const oldIdx  = list.indexOf(aid)
        const newIdx  = list.indexOf(oid)
        if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev
        return { ...prev, [activeContainer]: arrayMove(list, oldIdx, newIdx) }
      } else {
        const fromList  = prev[activeContainer].filter(id => id !== aid)
        const toList    = [...prev[overContainer]]
        const overIdx   = toList.indexOf(oid)
        const insertAt  = overIdx >= 0 ? overIdx : toList.length
        toList.splice(insertAt, 0, aid)
        return { ...prev, [activeContainer]: fromList, [overContainer]: toList }
      }
    })
  }

  async function handleProjDragEnd({ active }: DragEndEvent) {
    setActiveId(null)
    if (!liveItems) return

    const updates: { id: string; category_id: string; sort_order: number }[] = []
    for (const [catId, ids] of Object.entries(liveItems)) {
      ids.forEach((id, i) => {
        const proj = projects.find(p => p.id === id)
        if (proj && (proj.category_id !== catId || proj.sort_order !== i))
          updates.push({ id, category_id: catId, sort_order: i })
      })
    }

    setLiveItems(null)
    if (updates.length > 0) await onMoveProject(updates)
  }

  function handleProjDragCancel() {
    setActiveId(null)
    setLiveItems(null)
  }

  // ── 바 드래그 핸들러 (월/주 뷰 공통) ────────────────────
  const makeDragHandlers = useCallback((p: GanttProject, dragType: 'move' | 'resize-left' | 'resize-right') => {
    return (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (!p.start_date || !p.end_date) return

      const cw = viewMode === 'week' ? WEEK_COL_WIDTH : COL_WIDTH
      const ws = viewMode === 'week' ? buildWeekRange(viewStart, viewEnd) : []

      let origStart: number, origEnd: number
      if (viewMode === 'month') {
        origStart = Math.floor(dayOffset(viewStart, p.start_date, 'start'))
        origEnd   = Math.floor(dayOffset(viewStart, p.end_date, 'end'))
      } else {
        origStart = Math.floor(dayOffsetInWeeks(ws, p.start_date, 'start'))
        origEnd   = Math.floor(dayOffsetInWeeks(ws, p.end_date, 'end'))
      }

      const startX = e.clientX
      let previewStart = origStart, previewEnd = origEnd

      const overlay = document.createElement('div')
      overlay.style.cssText = `position:fixed;inset:0;cursor:${dragType === 'move' ? 'grabbing' : 'ew-resize'};z-index:9999;user-select:none;`
      document.body.appendChild(overlay)

      const barEl = (e.currentTarget as HTMLElement).closest('[data-bar-id]') as HTMLElement | null

      function onMouseMove(me: MouseEvent) {
        const delta = Math.round((me.clientX - startX) / cw)
        if (dragType === 'move') {
          previewStart = Math.max(0, Math.min(origStart + delta, totalCols - 1))
          const span = origEnd - origStart
          previewEnd = Math.min(previewStart + span, totalCols - 1)
          if (previewEnd === totalCols - 1) previewStart = previewEnd - span
        } else if (dragType === 'resize-left') {
          previewStart = Math.max(0, Math.min(origStart + delta, origEnd)); previewEnd = origEnd
        } else {
          previewStart = origStart; previewEnd = Math.max(origStart, Math.min(origEnd + delta, totalCols - 1))
        }
        if (barEl) {
          barEl.style.left  = `${previewStart * cw + 4}px`
          barEl.style.width = `${(previewEnd - previewStart + 1) * cw - 8}px`
        }
      }

      async function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        overlay.remove()
        if (previewStart !== origStart || previewEnd !== origEnd) {
          let newStart: string, newEnd: string
          if (viewMode === 'month') {
            newStart = indexToFirstDay(viewStart, previewStart)
            newEnd   = indexToLastDay(viewStart, previewEnd)
          } else {
            newStart = weekIndexToDate(ws, previewStart, 'start')
            newEnd   = weekIndexToDate(ws, previewEnd, 'end')
          }
          await onUpdateProjectDates(p.id, newStart, newEnd)
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
  }, [viewStart, viewEnd, viewMode, totalCols, onUpdateProjectDates])

  // ── 행 렌더 헬퍼 ─────────────────────────────────────────
  const renderCategoryRows = (cat: GanttCategory, catIdx: number, forPanel: 'left' | 'right') => {
    const barColor  = PASTEL_COLORS[catIdx % PASTEL_COLORS.length]
    const catProjs  = projectsOf(cat.id)

    if (forPanel === 'left') {
      return (
        <div key={cat.id} data-row>
          {/* 카테고리 헤더 — 왼쪽 */}
          <div
            className="flex items-center group border-b"
            style={{ height: CAT_ROW_H, backgroundColor: '#f8f9fa', borderLeft: `3px solid ${cat.color}` }}
          >
            <div className="flex items-center gap-2 pl-3 pr-2 w-full">
              {editCatId === cat.id ? (
                <input
                  autoFocus
                  className="text-xs font-bold text-gray-800 border-b border-indigo-400 outline-none bg-transparent flex-1 min-w-0"
                  value={editCatVal}
                  onChange={e => setEditCatVal(e.target.value)}
                  onBlur={() => commitEditCat(cat.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEditCat(cat.id); if (e.key === 'Escape') setEditCatId(null) }}
                />
              ) : (
                <span className="text-xs font-bold text-gray-700 cursor-text hover:text-indigo-600 truncate" onClick={readOnly ? undefined : e => startEditCat(cat, e)}>
                  {cat.name}
                </span>
              )}
              <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">{catProjs.length}</span>
              {!readOnly && (
                <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100">
                  <button onClick={() => onAddProject(cat.id)} className="p-0.5 text-gray-400 hover:text-indigo-500"><Plus size={12} /></button>
                  <button onClick={() => onDeleteCategory(cat.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                </div>
              )}
            </div>
          </div>

          {/* 프로젝트 행 — 왼쪽 (dnd-kit) */}
          <SortableContext items={catProjs.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {catProjs.map(project => {
              const isBacklog = project.status === 'backlog'
              const sm        = STATUS_META[project.status]

              return (
                <SortableProjRow key={project.id} id={project.id} disabled={readOnly}>
                  {({ listeners, isDragging }) => (
                    <div
                      className="relative"
                      style={{ opacity: isDragging ? 0 : 1 }}
                    >
                      <div
                        className="flex items-center gap-1.5 group border-b px-2"
                        style={{
                          height: ghostEnabled ? PROJ_ROW_H_CMP : PROJ_ROW_H,
                          backgroundColor: isBacklog ? '#f3f4f6' : 'white',
                          ...(readOnly && { borderLeft: `3px solid ${barColor}55`, paddingLeft: 14 }),
                        }}
                      >
                        {!readOnly && (
                          <button
                            {...listeners}
                            className="shrink-0 cursor-grab touch-none p-0"
                            onClick={e => e.stopPropagation()}
                            tabIndex={-1}
                          >
                            <GripVertical size={13} className="text-gray-300 group-hover:text-gray-400" />
                          </button>
                        )}
                        {editProjId === project.id ? (
                          <input
                            autoFocus
                            className="text-xs font-medium text-gray-800 border-b border-indigo-400 outline-none bg-transparent flex-1 min-w-0"
                            value={editProjVal}
                            onChange={e => setEditProjVal(e.target.value)}
                            onBlur={() => commitEditProj(project.id)}
                            onKeyDown={e => { if (e.key === 'Enter') commitEditProj(project.id); if (e.key === 'Escape') setEditProjId(null) }}
                          />
                        ) : (
                          <span
                            className="text-xs font-medium text-gray-800 truncate cursor-text hover:text-indigo-600"
                            style={{ maxWidth: 160 }}
                            onClick={readOnly ? undefined : e => startEditProj(project, e)}
                            title={project.name}
                          >
                            {project.name}
                          </span>
                        )}
                        <button
                          onClick={readOnly ? undefined : () => cycleStatus(project)}
                          className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: sm.bg, color: sm.color, cursor: readOnly ? 'default' : 'pointer' }}
                          title={readOnly ? undefined : '클릭하여 상태 변경'}
                        >
                          {sm.label}
                        </button>
                        {!readOnly && (
                          <div className="flex items-center ml-auto shrink-0">
                            {project.memo ? (
                              <button onClick={() => onOpenMemo(project)} className="p-0.5 text-indigo-400 hover:text-indigo-600" title="메모 보기">
                                <StickyNote size={11} />
                              </button>
                            ) : null}
                            <div className="flex items-center opacity-0 group-hover:opacity-100">
                              {!project.memo && (
                                <button onClick={() => onOpenMemo(project)} className="p-0.5 text-gray-400 hover:text-indigo-500" title="메모"><StickyNote size={11} /></button>
                              )}
                              <button onClick={() => onShowHistory(project)} className="p-0.5 text-gray-400 hover:text-purple-500" title="수정 이력"><Clock size={11} /></button>
                              <button onClick={() => onEditProject(project)} className="p-0.5 text-gray-400 hover:text-blue-500" title="기간 편집"><CalendarDays size={11} /></button>
                              <button onClick={() => onDeleteProject(project.id)} className="p-0.5 text-gray-400 hover:text-red-500" title="삭제"><Trash2 size={11} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </SortableProjRow>
              )
            })}
          </SortableContext>

          {/* 프로젝트 추가 행 — 왼쪽 */}
          {!readOnly && (
            <div className="border-b border-gray-50" style={{ height: ADD_ROW_H }}>
              <button
                onClick={() => onAddProject(cat.id)}
                className="h-full flex items-center gap-0.5 pl-3 text-xs text-gray-300 hover:text-gray-500"
              >
                <Plus size={10} /> 프로젝트
              </button>
            </div>
          )}
        </div>
      )
    }

    // 오른쪽 패널
    return (
      <div key={cat.id}>
        {/* 카테고리 헤더 — 오른쪽 */}
        <div
          className="border-b"
          style={{ height: CAT_ROW_H, backgroundColor: '#f8f9fa' }}
        />

        {/* 프로젝트 바 행 — 오른쪽 */}
        {catProjs.map(project => {
          const cols      = barCols(project)
          const isBacklog = project.status === 'backlog'

          const ghost = ghostEnabled && ghostDates?.[project.id]
          const ghostProject = ghost ? {
            ...project,
            start_date: ghost.start_date ?? project.start_date,
            end_date:   ghost.end_date   ?? project.end_date,
          } : null
          const ghostCols = ghostProject ? barCols(ghostProject) : null
          const hasGhostDiff = ghostCols && cols && (
            Math.abs(ghostCols.start - cols.start) > 0.01 ||
            Math.abs(ghostCols.end - cols.end) > 0.01
          )

          const showCompare = !!(ghostEnabled && hasGhostDiff)
          const rowH   = ghostEnabled ? PROJ_ROW_H_CMP : PROJ_ROW_H

          const BAR_H   = 14
          const GHOST_H = 14
          const curTop   = (PROJ_ROW_H - BAR_H) / 2
          const ghostTop = curTop + BAR_H + 8

          return (
            <div
              key={project.id}
              className="relative border-b"
              style={{ height: rowH, backgroundColor: isBacklog ? '#f3f4f6' : 'white' }}
            >
              {/* ghost 바 */}
              {showCompare && ghostCols && (
                <div
                  className="absolute rounded-full overflow-hidden flex items-center pointer-events-none select-none"
                  style={{
                    top: ghostTop,
                    left: ghostCols.start * colW + 4,
                    width: Math.max(2, (ghostCols.end - ghostCols.start) * colW - 8),
                    height: GHOST_H,
                    backgroundColor: barColor + '28',
                    border: `1.5px dashed ${barColor}`,
                  }}
                >
                  {ghostProject?.start_date && ghostProject?.end_date && (
                    <span className="px-2 text-[9px] font-medium tabular-nums truncate" style={{ color: barColor }}>
                      {formatBarDate(ghostProject.start_date, ghostProject.end_date)}
                    </span>
                  )}
                </div>
              )}

              {cols && (
                <>
                  {/* 현재 바 */}
                  <div
                    data-bar-id={project.id}
                    className="absolute rounded-full overflow-hidden flex items-center"
                    style={{
                      top: curTop,
                      left: cols.start * colW + 4,
                      width: (cols.end - cols.start) * colW - 8,
                      height: BAR_H,
                      backgroundColor: barColor,
                      cursor: readOnly ? 'default' : 'grab',
                    }}
                    onMouseDown={readOnly ? undefined : makeDragHandlers(project, 'move')}
                  >
                    {!readOnly && <div className="absolute left-0 top-0 bottom-0 w-3 rounded-l-full cursor-ew-resize" onMouseDown={e => { e.stopPropagation(); makeDragHandlers(project, 'resize-left')(e) }} />}
                    {project.start_date && project.end_date && (
                      <span className="px-2 text-[9px] font-medium tabular-nums truncate pointer-events-none select-none" style={{ color: '#1f2937' }}>
                        {formatBarDate(project.start_date, project.end_date)}
                      </span>
                    )}
                    {!readOnly && <div className="absolute right-0 top-0 bottom-0 w-3 rounded-r-full cursor-ew-resize" onMouseDown={e => { e.stopPropagation(); makeDragHandlers(project, 'resize-right')(e) }} />}
                  </div>

                  {/* 바 오른쪽: 팀/PM 뱃지 */}
                  {(project.team || project.pm) && (
                    <div
                      className="absolute flex items-center gap-1 pointer-events-none"
                      style={{
                        left: (showCompare && ghostCols ? Math.max(cols.end, ghostCols.end) : cols.end) * colW + 8,
                        top: curTop + BAR_H / 2,
                        transform: 'translateY(-50%)',
                      }}
                    >
                      {project.team && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: barColor + '60', color: '#374151' }}>
                          {project.team}
                        </span>
                      )}
                      {project.pm && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap border" style={{ borderColor: barColor, color: '#374151' }}>
                          👤 {project.pm}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

        {/* 프로젝트 추가 행 — 오른쪽 */}
        <div className="border-b border-gray-50" style={{ height: ADD_ROW_H }} />
      </div>
    )
  }

  // DragOverlay 내용: 드래그 중인 프로젝트 행 미리보기
  const activeProjForOverlay = activeId ? projects.find(p => p.id === activeId) : null

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 툴바 */}
      <GanttToolbar
        boardName={boardName}
        readOnly={readOnly}
        undoCount={undoCount}
        onUndo={onUndo}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allTeams={allTeams}
        excludedTeams={excludedTeams}
        onToggleTeam={toggleTeam}
        allPMs={allPMs}
        excludedPMs={excludedPMs}
        onTogglePM={togglePM}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        ghostEnabled={ghostEnabled}
        onToggleGhost={onToggleGhost ? async (enabled) => { setGhostEnabled(enabled); await onToggleGhost(enabled) } : undefined}
        sortedCats={sortedCats}
        onAddProject={onAddProject}
      />

      {/* 메인 영역 */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽 패널 (고정, 레이블) ─────────────────────── */}
        <div
          onWheel={onLeftWheel}
          className="shrink-0 flex flex-col border-r shadow-[2px_0_6px_rgba(0,0,0,0.06)]"
          style={{ width: LEFT_WIDTH, overflowY: 'hidden', overflowX: 'hidden', zIndex: 10 }}
        >
          <div className="shrink-0 border-b bg-white flex items-end" style={{ height: HEADER_H }}>
            <span className="text-[11px] font-semibold text-gray-400 px-3 pb-2">프로젝트</span>
          </div>
          <div
            ref={leftRef}
            className="flex-1 overflow-y-hidden flex flex-col"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleProjDragStart}
              onDragOver={handleProjDragOver}
              onDragEnd={handleProjDragEnd}
              onDragCancel={handleProjDragCancel}
            >
              {/* 카테고리 목록 */}
              <div className="flex-1" onDoubleClick={e => {
                if ((e.target as HTMLElement).closest('[data-row]')) return
                setAddingCat(true)
              }}>
                {categories.length === 0 && !addingCat && (
                  <div
                    className="flex flex-col items-center justify-center h-28 text-gray-400 text-xs gap-1 cursor-pointer select-none"
                    onDoubleClick={() => setAddingCat(true)}
                  >
                    <span>카테고리를 추가해 보세요</span>
                    <span className="text-[10px] text-gray-300">더블클릭 또는 하단 버튼</span>
                  </div>
                )}
                {sortedCats.map((cat, catIdx) => renderCategoryRows(cat, catIdx, 'left'))}
              </div>

              {/* DragOverlay: 드래그 중인 행의 커서 따라가는 미리보기 */}
              <DragOverlay dropAnimation={null}>
                {activeProjForOverlay ? (() => {
                  const sm = STATUS_META[activeProjForOverlay.status]
                  return (
                    <div
                      className="flex items-center gap-1.5 border border-indigo-300 bg-white shadow-xl rounded px-2 cursor-grabbing"
                      style={{ height: PROJ_ROW_H, width: LEFT_WIDTH - 4, opacity: 0.95 }}
                    >
                      <GripVertical size={13} className="text-gray-400 shrink-0" />
                      <span className="text-xs font-medium text-gray-800 truncate flex-1" style={{ maxWidth: 160 }}>
                        {activeProjForOverlay.name}
                      </span>
                      <span
                        className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: sm.bg, color: sm.color }}
                      >
                        {sm.label}
                      </span>
                    </div>
                  )
                })() : null}
              </DragOverlay>
            </DndContext>

            {/* 하단 고정: 카테고리 추가 버튼 or 인라인 입력 */}
            {!readOnly && <div className="shrink-0 border-t bg-white">
              {addingCat ? (
                <div className="flex items-center gap-2 px-3 h-9">
                  <input
                    autoFocus
                    className="text-xs font-bold border-b border-indigo-400 outline-none bg-transparent flex-1 min-w-0"
                    placeholder="카테고리명"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }}
                  />
                  <button onClick={submitAddCat} className="p-0.5 text-indigo-500 hover:text-indigo-700"><Check size={13} /></button>
                  <button onClick={() => { setAddingCat(false); setNewCatName('') }} className="p-0.5 text-gray-400 hover:text-gray-600"><X size={13} /></button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCat(true)}
                  className="w-full h-9 flex items-center gap-1.5 px-3 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Plus size={13} /> 카테고리 추가
                </button>
              )}
            </div>}
          </div>
        </div>

        {/* ── 오른쪽 패널 (타임라인) ───────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* 달력 헤더 — 수평 스크롤만, 항상 고정 표시 */}
          <div
            ref={headerRef}
            className="shrink-0 overflow-hidden bg-white border-b"
            style={{ height: HEADER_H }}
          >
            <div style={{ width: totalWidth }}>
              {/* 연도 행 */}
              <div className="flex border-b" style={{ height: YEAR_H }}>
                {yearGroups.map(({ year, count }) => (
                  <div key={year} className="text-sm font-bold text-gray-700 px-3 flex items-center border-r" style={{ width: colW * count }}>
                    {year}
                  </div>
                ))}
              </div>

              {/* 월 행 */}
              <div className="flex border-b" style={{ height: MONTH_H }}>
                {viewMode === 'month' ? (
                  months.map(ym => (
                    <div
                      key={ym}
                      className={`text-center text-xs border-r shrink-0 font-medium flex items-center justify-center ${ym === todayYM ? 'text-red-400' : 'text-gray-400'}`}
                      style={{ width: colW }}
                    >
                      {MONTH_LABELS[parseInt(ym.split('-')[1]) - 1]}
                    </div>
                  ))
                ) : (
                  monthGroups.map(({ ym, label, count }) => (
                    <div
                      key={ym}
                      className="text-xs border-r shrink-0 font-semibold flex items-center px-2 text-gray-500 bg-gray-50"
                      style={{ width: colW * count }}
                    >
                      {label}
                    </div>
                  ))
                )}
              </div>

              {/* TODAY / 주 레이블 행 */}
              <div className="flex" style={{ height: TODAY_H }}>
                {viewMode === 'month' ? (
                  <div className="relative w-full">
                    {todayX !== null && (
                      <div className="absolute text-[9px] font-bold text-red-400 tracking-widest" style={{ left: todayX, transform: 'translateX(-50%)', top: 2 }}>
                        TODAY
                      </div>
                    )}
                  </div>
                ) : (
                  weeks.map((w, i) => {
                    const isToday = todayX !== null && Math.round(i * colW + colW / 2) === Math.round(todayX)
                    return (
                      <div
                        key={w.key}
                        className={`text-center border-r shrink-0 flex items-center justify-center text-[9px] font-medium ${isToday ? 'text-red-400 font-bold' : 'text-gray-300'}`}
                        style={{ width: colW }}
                      >
                        {w.label}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* 바 행 스크롤 영역 */}
          <div
            ref={rightRef}
            onScroll={onRightScroll}
            className="flex-1 overflow-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            <div style={{ width: totalWidth }} className="relative">
              {todayX !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-red-200 z-10 pointer-events-none" style={{ left: todayX }} />
              )}
              {/* 컬럼 그리드 라인 */}
              {viewMode === 'month' ? (
                months.map((ym, i) => (
                  <div key={ym} className="absolute top-0 bottom-0 border-r border-gray-100 pointer-events-none" style={{ left: i * colW, width: colW }} />
                ))
              ) : (
                weeks.map((w, i) => (
                  <div
                    key={w.key}
                    className={`absolute top-0 bottom-0 pointer-events-none border-r ${w.weekInMonth === 1 ? 'border-gray-200' : 'border-gray-100'}`}
                    style={{ left: i * colW, width: colW }}
                  />
                ))
              )}
              {sortedCats.map((cat, catIdx) => renderCategoryRows(cat, catIdx, 'right'))}
            </div>
          </div>
        </div>
      </div>

      {/* 고정 스크롤바 */}
      <div
        ref={stickyScrollRef}
        className="shrink-0 overflow-x-auto overflow-y-hidden border-t bg-white"
        style={{ height: 14, marginLeft: LEFT_WIDTH }}
        onScroll={onStickyScroll}
      >
        <div style={{ width: totalWidth, height: 1 }} />
      </div>
    </div>
  )
}
