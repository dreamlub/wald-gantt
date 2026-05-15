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
import { Plus, Trash2, GripVertical, Check, X, StickyNote } from 'lucide-react'
import { GanttToolbar } from './GanttToolbar'
import {
  buildMonthRange, monthOffset, formatYearMonth, parseYearMonth, MONTH_LABELS,
  buildWeekRange, dayOffset, dayOffsetInWeeks, buildDayRange,
} from '@/lib/gantt-utils'
import type { WeekInfo, DayInfo } from '@/lib/gantt-utils'
import type { GanttCategory, GanttProject, GanttStatus, Priority } from '@/types'
import { PriorityBars } from '@/app/(app)/tasks/_constants'
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
  redoCount?: number
  onRedo?: () => void
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
  onMoveCategory: (updates: { id: string; sort_order: number }[]) => Promise<void>
  readOnly?: boolean
}

const COL_WIDTH      = 72
const WEEK_COL_WIDTH = 44
const DAY_COL_WIDTH  = 28
const LEFT_WIDTH_DEFAULT = 260
const LEFT_WIDTH_MIN     = 160
const LEFT_WIDTH_MAX     = 480
const YEAR_H      = 34
const MONTH_H     = 28
const TODAY_H     = 18
const HEADER_H    = YEAR_H + MONTH_H + TODAY_H  // 80
const CAT_ROW_H       = 32
const PROJ_ROW_H      = 36
const PROJ_ROW_H_CMP  = 56

const PASTEL_COLORS = [
  '#a5b4fc', '#fdba74', '#86efac', '#93c5fd',
  '#f9a8d4', '#fde047', '#c4b5fd', '#7dd3fc',
]

const STATUS_META: Record<GanttStatus, { label: string; abbr: string; dot: string }> = {
  'to-do':       { label: 'To-Do',       abbr: 'T', dot: '#6366f1' },
  'in-progress': { label: 'In Progress', abbr: 'I', dot: '#f59e0b' },
  'pending':     { label: 'Pending',     abbr: 'P', dot: '#a78bfa' },
  'backlog':     { label: 'Backlog',     abbr: 'B', dot: '#9ca3af' },
  'done':        { label: 'Done',        abbr: 'D', dot: '#22c55e' },
}
const STATUS_ORDER: GanttStatus[] = ['to-do', 'in-progress', 'pending', 'backlog', 'done']
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type ViewMode = 'month' | 'week' | 'day'

function formatBarDate(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-')
  const [ey, em, ed] = end.split('-')
  const sLabel = `${parseInt(sm)}/${parseInt(sd)}`
  const eLabel = `${parseInt(em)}/${parseInt(ed)}`
  if (sy === ey) return `${sLabel} ~ ${eLabel}`
  return `${sy.slice(2)}.${sLabel} ~ ${ey.slice(2)}.${eLabel}`
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

// ── Sortable category row shell ──────────────────────────────
function SortableCatRow({ id, disabled, children }: {
  id: string
  disabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: (props: { listeners: any; isDragging: boolean }) => React.ReactNode
}) {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
      {...attributes}
    >
      {children({ listeners, isDragging })}
    </div>
  )
}

// ── GanttChart ────────────────────────────────────────────────
export function GanttChart({
  categories, projects, viewStart, viewEnd, boardName,
  ghostDates, onToggleGhost, undoCount = 0, onUndo, redoCount = 0, onRedo,
  onAddCategory, onUpdateCategory, onDeleteCategory,
  onAddProject, onEditProject, onDeleteProject, onShowHistory, onOpenMemo,
  onUpdateProjectDates, onUpdateProjectName, onUpdateProjectStatus,
  onMoveProject, onMoveCategory, readOnly = false,
}: Props) {
  const months = buildMonthRange(viewStart, viewEnd)
  const leftRef         = useRef<HTMLDivElement>(null)
  const rightRef        = useRef<HTMLDivElement>(null)
  const headerRef       = useRef<HTMLDivElement>(null)
  const stickyScrollRef = useRef<HTMLDivElement>(null)

  const [leftWidth, setLeftWidth]           = useState(LEFT_WIDTH_DEFAULT)
  const [viewMode, setViewMode]             = useState<ViewMode>('week')
  const [editCatId, setEditCatId]           = useState<string | null>(null)
  const [editCatVal, setEditCatVal]         = useState('')
  const [addingCat, setAddingCat]           = useState(false)
  const [newCatName, setNewCatName]         = useState('')
  const [sortMode, setSortMode]           = useState<'default' | 'start-asc' | 'end-desc' | 'priority-desc'>('default')
  const [excludedTeams, setExcludedTeams] = useState<Set<string>>(new Set())
  const [excludedPMs, setExcludedPMs]     = useState<Set<string>>(new Set())
  const [ghostEnabled, setGhostEnabled]   = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const [activeId, setActiveId]             = useState<string | null>(null)
  const [liveItems, setLiveItems]           = useState<Record<string, string[]> | null>(null)
  const [liveCats, setLiveCats]             = useState<string[] | null>(null)
  const [memoHover, setMemoHover]           = useState<{ text: string; x: number; y: number } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // 뷰 모드별 파생 값
  const colW      = viewMode === 'week' ? WEEK_COL_WIDTH : viewMode === 'day' ? DAY_COL_WIDTH : COL_WIDTH
  const weeks     = viewMode === 'week' ? buildWeekRange(viewStart, viewEnd) : ([] as WeekInfo[])
  const days      = viewMode === 'day'  ? buildDayRange(viewStart, viewEnd)  : ([] as DayInfo[])
  const totalCols = viewMode === 'week' ? weeks.length : viewMode === 'day' ? days.length : months.length
  const totalWidth = colW * totalCols

  // 헤더용 그룹 (월/주/일 공통)
  const yearGroups: { year: number; count: number }[] = []
  for (const year of (viewMode === 'month' ? months.map(ym => parseInt(ym)) : viewMode === 'week' ? weeks.map(w => w.year) : days.map(d => d.year))) {
    if (!yearGroups.length || yearGroups[yearGroups.length-1].year !== year) yearGroups.push({ year, count: 1 })
    else yearGroups[yearGroups.length-1].count++
  }

  // 주·일 뷰의 월 그룹 (월 행 렌더용)
  const monthGroups: { ym: string; label: string; count: number }[] = []
  for (const item of (viewMode === 'week' ? weeks : viewMode === 'day' ? days : []) as { year: number; month: number }[]) {
    const ym = formatYearMonth(item.year, item.month)
    if (!monthGroups.length || monthGroups[monthGroups.length-1].ym !== ym) monthGroups.push({ ym, label: MONTH_LABELS[item.month-1], count: 1 })
    else monthGroups[monthGroups.length-1].count++
  }

  const allTeams   = [...new Set(projects.map(p => p.team || ''))].sort()
  const allPMs     = [...new Set(projects.map(p => p.pm || ''))].sort()
  const catIdSet   = new Set(categories.map(c => c.id))
  const isCatDrag  = (id: string) => catIdSet.has(id)
  const sortedCats = liveCats
    ? liveCats.map(id => categories.find(c => c.id === id)!).filter(Boolean)
    : [...categories].sort((a, b) => a.sort_order - b.sort_order)

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

  const today   = new Date()
  const todayYM  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const todayStr = `${todayYM}-${String(today.getDate()).padStart(2, '0')}`

  let todayX: number | null = null
  if (viewMode === 'month') {
    const col = monthOffset(viewStart, todayYM)
    todayX = col >= 0 && col < totalCols ? col * colW + colW / 2 : null
  } else if (viewMode === 'week') {
    const idx = weeks.findIndex(w => { const e = new Date(w.weekStart); e.setDate(e.getDate() + 6); return today >= w.weekStart && today <= e })
    todayX = idx >= 0 ? idx * colW + colW / 2 : null
  } else {
    const idx = days.findIndex(d => d.key === todayStr)
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
    const cw = viewMode === 'week' ? WEEK_COL_WIDTH : viewMode === 'day' ? DAY_COL_WIDTH : COL_WIDTH
    const now = new Date()
    let scrollX = 0
    if (viewMode === 'month') {
      scrollX = Math.max(0, monthOffset(viewStart, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`) * cw - 200)
    } else if (viewMode === 'week') {
      const ws = buildWeekRange(viewStart, viewEnd)
      const idx = ws.findIndex(w => { const e = new Date(w.weekStart); e.setDate(e.getDate() + 6); return now >= w.weekStart && now <= e })
      scrollX = idx >= 0 ? Math.max(0, idx * cw - 200) : 0
    } else {
      const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const ds = buildDayRange(viewStart, viewEnd)
      const idx = ds.findIndex(d => d.key === nowStr)
      scrollX = idx >= 0 ? Math.max(0, idx * cw - 200) : 0
    }
    rightRef.current.scrollLeft = scrollX
    if (headerRef.current) headerRef.current.scrollLeft = scrollX
  }, [viewMode, viewStart, viewEnd])

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

  // ── 프로젝트/카테고리 행 DnD (dnd-kit) ─────────────────────
  function findContainer(items: Record<string, string[]>, id: string): string | undefined {
    if (id in items) return id
    for (const [catId, ids] of Object.entries(items)) {
      if (ids.includes(id)) return catId
    }
    return undefined
  }

  function handleProjDragStart({ active }: DragStartEvent) {
    const id = active.id as string
    if (isCatDrag(id)) {
      // 카테고리 드래그
      setActiveId(id)
      setLiveCats(sortedCats.map(c => c.id))
    } else {
      // 프로젝트 드래그
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
  }

  function handleProjDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const aid = active.id as string
    const oid = over.id as string

    if (isCatDrag(aid)) {
      // 카테고리 재정렬
      setLiveCats(prev => {
        if (!prev) return prev
        const oldIdx = prev.indexOf(aid)
        const newIdx = prev.indexOf(oid)
        if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev
        return arrayMove(prev, oldIdx, newIdx)
      })
      return
    }

    // 프로젝트 재정렬
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
    const id = active.id as string

    if (isCatDrag(id) && liveCats) {
      setActiveId(null)
      const updates = liveCats
        .map((catId, i) => ({ id: catId, sort_order: i }))
        .filter(u => {
          const cat = categories.find(c => c.id === u.id)
          return cat && cat.sort_order !== u.sort_order
        })
      setLiveCats(null)
      if (updates.length > 0) await onMoveCategory(updates)
      return
    }

    setActiveId(null)
    if (!liveItems) return

    const updates: { id: string; category_id: string; sort_order: number }[] = []
    for (const [catId, ids] of Object.entries(liveItems)) {
      ids.forEach((projId, i) => {
        const proj = projects.find(p => p.id === projId)
        if (proj && (proj.category_id !== catId || proj.sort_order !== i))
          updates.push({ id: projId, category_id: catId, sort_order: i })
      })
    }

    setLiveItems(null)
    if (updates.length > 0) await onMoveProject(updates)
  }

  function handleProjDragCancel() {
    setActiveId(null)
    setLiveItems(null)
    setLiveCats(null)
  }

  // ── 바 드래그 핸들러 (월/주 뷰 공통) ────────────────────
  const makeDragHandlers = useCallback((p: GanttProject, dragType: 'move' | 'resize-left' | 'resize-right') => {
    return (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (!p.start_date || !p.end_date) return

      const cw = viewMode === 'week' ? WEEK_COL_WIDTH : viewMode === 'day' ? DAY_COL_WIDTH : COL_WIDTH
      const ws = viewMode === 'week' ? buildWeekRange(viewStart, viewEnd) : []
      const ds = viewMode === 'day'  ? buildDayRange(viewStart, viewEnd)  : ([] as DayInfo[])

      // 드래그 단위: 월뷰=주(7일), 주뷰·일뷰=일(1일)
      const AVG_MONTH  = 30.4375
      const snapDays   = viewMode === 'month' ? 7 : 1
      const pxPerSnap  = viewMode === 'month' ? cw / AVG_MONTH * 7
                       : viewMode === 'week'  ? cw / 7
                       : cw  // day: 1컬럼=1일

      const origStartDate = new Date(p.start_date + 'T00:00:00')
      const origEndDate   = new Date(p.end_date   + 'T00:00:00')

      // 일뷰 전용 컬럼 인덱스
      let origColStart = ds.findIndex(d => d.key === p.start_date); if (origColStart < 0) origColStart = 0
      let origColEnd   = ds.findIndex(d => d.key === p.end_date);   if (origColEnd < 0) origColEnd = 0

      const startX = e.clientX
      let snapDelta = 0
      let previewColStart = origColStart, previewColEnd = origColEnd

      const overlay = document.createElement('div')
      overlay.style.cssText = `position:fixed;inset:0;cursor:${dragType === 'move' ? 'grabbing' : 'ew-resize'};z-index:9999;user-select:none;`
      document.body.appendChild(overlay)

      const tooltip = document.createElement('div')
      tooltip.style.cssText = 'position:fixed;z-index:10000;background:#1e293b;color:#f1f5f9;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;pointer-events:none;white-space:nowrap;transform:translate(-50%,calc(-100% - 10px));box-shadow:0 2px 8px rgba(0,0,0,.3);font-family:system-ui,sans-serif;display:none;'
      const tooltipLabel = document.createElement('span')
      const tooltipArrow = document.createElement('div')
      tooltipArrow.style.cssText = 'position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid #1e293b;'
      tooltip.appendChild(tooltipLabel)
      tooltip.appendChild(tooltipArrow)
      document.body.appendChild(tooltip)

      const barEl = (e.currentTarget as HTMLElement).closest('[data-bar-id]') as HTMLElement | null

      function shift(date: Date, d: number): Date { const r = new Date(date); r.setDate(r.getDate() + d); return r }
      function fmt(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
      function barPx(sd: Date, ed: Date): { left: number; width: number } {
        if (viewMode === 'month') {
          const s = dayOffset(viewStart, fmt(sd), 'start'), e = dayOffset(viewStart, fmt(ed), 'end')
          return { left: s * cw + 4, width: Math.max(4, (e - s) * cw - 8) }
        }
        const s = dayOffsetInWeeks(ws, fmt(sd), 'start'), e = dayOffsetInWeeks(ws, fmt(ed), 'end')
        return { left: s * cw + 4, width: Math.max(4, (e - s) * cw - 8) }
      }

      function onMouseMove(me: MouseEvent) {
        const raw = me.clientX - startX
        if (viewMode === 'day') {
          const delta = Math.round(raw / cw)
          if (dragType === 'move') {
            previewColStart = Math.max(0, Math.min(origColStart + delta, totalCols - 1))
            const span = origColEnd - origColStart
            previewColEnd = Math.min(previewColStart + span, totalCols - 1)
            if (previewColEnd === totalCols - 1) previewColStart = previewColEnd - span
          } else if (dragType === 'resize-left') {
            previewColStart = Math.max(0, Math.min(origColStart + delta, origColEnd)); previewColEnd = origColEnd
          } else {
            previewColStart = origColStart; previewColEnd = Math.max(origColStart, Math.min(origColEnd + delta, totalCols - 1))
          }
          if (barEl) { barEl.style.left = `${previewColStart * cw + 4}px`; barEl.style.width = `${(previewColEnd - previewColStart + 1) * cw - 8}px` }
          // 툴팁
          const sk = ds[Math.max(0, Math.min(previewColStart, ds.length-1))].key
          const ek = ds[Math.max(0, Math.min(previewColEnd,   ds.length-1))].key
          tooltipLabel.textContent = formatBarDate(sk, ek)
          tooltip.style.left = `${me.clientX}px`; tooltip.style.top = `${me.clientY}px`; tooltip.style.display = 'block'
        } else {
          snapDelta = Math.round(raw / pxPerSnap)
          const d = snapDelta * snapDays
          let ns = origStartDate, ne = origEndDate
          if (dragType === 'move')         { ns = shift(origStartDate, d);  ne = shift(origEndDate, d) }
          else if (dragType === 'resize-left') { ns = shift(origStartDate, d);  if (ns > origEndDate)   ns = origEndDate }
          else                             { ne = shift(origEndDate, d);    if (ne < origStartDate) ne = origStartDate }
          if (barEl) { const px = barPx(ns, ne); barEl.style.left = `${px.left}px`; barEl.style.width = `${px.width}px` }
          // 툴팁
          tooltipLabel.textContent = formatBarDate(fmt(ns), fmt(ne))
          tooltip.style.left = `${me.clientX}px`; tooltip.style.top = `${me.clientY}px`; tooltip.style.display = 'block'
        }
      }

      async function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        overlay.remove()
        tooltip.remove()
        if (viewMode === 'day') {
          if (previewColStart !== origColStart || previewColEnd !== origColEnd)
            await onUpdateProjectDates(p.id, ds[Math.max(0, Math.min(previewColStart, ds.length-1))].key, ds[Math.max(0, Math.min(previewColEnd, ds.length-1))].key)
        } else if (snapDelta !== 0) {
          const d = snapDelta * snapDays
          let ns = origStartDate, ne = origEndDate
          if (dragType === 'move')             { ns = shift(origStartDate, d);  ne = shift(origEndDate, d) }
          else if (dragType === 'resize-left') { ns = shift(origStartDate, d);  if (ns > origEndDate)   ns = origEndDate }
          else                                 { ne = shift(origEndDate, d);    if (ne < origStartDate) ne = origStartDate }
          await onUpdateProjectDates(p.id, fmt(ns), fmt(ne))
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
        <SortableCatRow key={cat.id} id={cat.id} disabled={readOnly}>
          {({ listeners }) => (
        <div data-row>
          {/* 카테고리 헤더 — 왼쪽 */}
          <div
            className="flex items-center group border-b"
            style={{ height: CAT_ROW_H, backgroundColor: '#f8f9fa', borderLeft: `3px solid ${cat.color}` }}
          >
            {!readOnly && (
              <div
                {...listeners}
                className="pl-1.5 pr-0.5 flex items-center self-stretch cursor-grab text-gray-300 hover:text-gray-500 shrink-0"
              >
                <GripVertical size={13} />
              </div>
            )}
            <div className={`flex items-center gap-2 ${readOnly ? 'pl-3' : 'pl-1'} pr-2 w-full min-w-0`}>
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
                  <button onClick={() => onAddProject(cat.id)} className="p-1 text-gray-300 hover:text-indigo-500 rounded"><Plus size={12} /></button>
                  <button onClick={() => onDeleteCategory(cat.id)} className="p-1 text-gray-300 hover:text-red-400 rounded"><Trash2 size={11} /></button>
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
                            className="shrink-0 cursor-grab touch-none p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => e.stopPropagation()}
                            tabIndex={-1}
                          >
                            <GripVertical size={13} className="text-gray-300" />
                          </button>
                        )}
                        {/* 상태 불릿 + 약식 */}
                        <button
                          onClick={readOnly ? undefined : () => cycleStatus(project)}
                          className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold leading-none tabular-nums"
                          style={{ color: sm.dot, cursor: readOnly ? 'default' : 'pointer' }}
                          title={sm.label}
                        >
                          <span className="text-[8px]">●</span>
                          <span>{sm.abbr}</span>
                        </button>
                        {/* 우선순위 */}
                        {project.priority > 0 && (
                          <span className="shrink-0">
                            <PriorityBars priority={project.priority as Priority} />
                          </span>
                        )}
                        {/* 프로젝트 이름 */}
                        <span
                          className="text-xs font-medium text-gray-800 truncate flex-1 min-w-0 cursor-pointer hover:text-indigo-600"
                          onClick={readOnly ? undefined : () => onEditProject(project)}
                          title={project.name}
                        >
                          {project.name}
                        </span>
                        {/* 메모 버튼 */}
                        {!readOnly && (
                          <button
                            onClick={() => onOpenMemo(project)}
                            onMouseEnter={project.memo ? e => setMemoHover({ text: project.memo!, x: e.clientX, y: e.clientY }) : undefined}
                            onMouseLeave={project.memo ? () => setMemoHover(null) : undefined}
                            className={`shrink-0 p-1 rounded transition-all ${
                              project.memo
                                ? 'text-indigo-400 hover:text-indigo-600'
                                : 'text-gray-200 opacity-0 group-hover:opacity-100 hover:text-indigo-400'
                            }`}
                            title="메모"
                          >
                            <StickyNote size={11} />
                          </button>
                        )}
                        {/* 삭제 버튼 */}
                        {!readOnly && (
                          <button
                            onClick={e => { e.stopPropagation(); onDeleteProject(project.id) }}
                            className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                            title="삭제 (휴지통으로 이동)"
                          >
                            <Trash2 size={11} />
                          </button>
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
            <div className="border-b border-gray-50" style={{ height: PROJ_ROW_H }}>
              <button
                onClick={() => onAddProject(cat.id)}
                className="h-full flex items-center gap-0.5 pl-3 text-xs text-gray-300 hover:text-gray-500"
              >
                <Plus size={10} /> 프로젝트
              </button>
            </div>
          )}
        </div>
          )}
        </SortableCatRow>
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
        <div className="border-b border-gray-50" style={{ height: PROJ_ROW_H }} />
      </div>
    )
  }

  // DragOverlay 내용: 드래그 중인 행 미리보기
  const activeCatForOverlay  = activeId && isCatDrag(activeId) ? categories.find(c => c.id === activeId) : null
  const activeProjForOverlay = activeId && !isCatDrag(activeId) ? projects.find(p => p.id === activeId) : null

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 툴바 */}
      <GanttToolbar
        boardName={boardName}
        readOnly={readOnly}
        undoCount={undoCount}
        onUndo={onUndo}
        redoCount={redoCount}
        onRedo={onRedo}
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
          className="shrink-0 flex flex-col shadow-[2px_0_6px_rgba(0,0,0,0.06)]"
          style={{ width: leftWidth, overflowY: 'hidden', overflowX: 'hidden', zIndex: 10 }}
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
                    <span className="text-[10px] text-gray-300">우측 상단 버튼 또는 더블클릭</span>
                  </div>
                )}
                <SortableContext items={sortedCats.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  {sortedCats.map((cat, catIdx) => renderCategoryRows(cat, catIdx, 'left'))}
                </SortableContext>

                {/* 마지막 카테고리 바로 아래: 카테고리 추가 */}
                {!readOnly && (
                  addingCat ? (
                    <div
                      className="flex items-center gap-2 px-3 border-b"
                      style={{ height: CAT_ROW_H, backgroundColor: '#f8f9fa', borderLeft: '3px solid #6366f1' }}
                    >
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
                      className="w-full flex items-center gap-1.5 px-3 text-xs text-gray-400 hover:text-indigo-500 hover:bg-gray-50 transition-colors border-b"
                      style={{ height: CAT_ROW_H, backgroundColor: '#f8f9fa', borderLeft: '3px solid transparent' }}
                    >
                      <Plus size={12} /> 카테고리
                    </button>
                  )
                )}

              </div>

              {/* DragOverlay: 드래그 중인 행의 커서 따라가는 미리보기 */}
              <DragOverlay dropAnimation={null}>
                {activeCatForOverlay ? (
                  <div
                    className="flex items-center gap-1.5 border border-indigo-300 bg-gray-50 shadow-xl rounded px-2 cursor-grabbing"
                    style={{ height: CAT_ROW_H, width: leftWidth - 4, opacity: 0.95, borderLeft: `3px solid ${activeCatForOverlay.color}` }}
                  >
                    <GripVertical size={13} className="text-gray-400 shrink-0" />
                    <span className="text-xs font-bold text-gray-700 truncate flex-1">
                      {activeCatForOverlay.name}
                    </span>
                  </div>
                ) : activeProjForOverlay ? (() => {
                  const sm = STATUS_META[activeProjForOverlay.status]
                  return (
                    <div
                      className="flex items-center gap-1.5 border border-indigo-300 bg-white shadow-xl rounded px-2 cursor-grabbing"
                      style={{ height: PROJ_ROW_H, width: leftWidth - 4, opacity: 0.95 }}
                    >
                      <GripVertical size={13} className="text-gray-400 shrink-0" />
                      <span
                        className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold leading-none"
                        style={{ color: sm.dot }}
                      >
                        <span className="text-[8px]">●</span>
                        <span>{sm.abbr}</span>
                      </span>
                      <span className="text-xs font-medium text-gray-800 truncate flex-1">
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
          className="shrink-0 w-1 cursor-col-resize bg-transparent hover:bg-indigo-300 active:bg-indigo-400 transition-colors z-20 border-r border-gray-200"
          title="드래그하여 너비 조절"
        />

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
                  <div key={year} className="text-sm font-bold text-gray-700 px-3 flex items-center border-r bg-gray-50" style={{ width: colW * count }}>
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

              {/* TODAY / 주 레이블 / 일 레이블 행 */}
              <div className="flex" style={{ height: TODAY_H }}>
                {viewMode === 'month' ? (
                  <div className="relative w-full">
                    {todayX !== null && (
                      <div className="absolute text-[9px] font-bold text-red-400 tracking-widest" style={{ left: todayX, transform: 'translateX(-50%)', top: 2 }}>
                        TODAY
                      </div>
                    )}
                  </div>
                ) : viewMode === 'week' ? (
                  weeks.map((w, i) => {
                    const isToday = todayX !== null && Math.round(i * colW + colW / 2) === Math.round(todayX)
                    return (
                      <div
                        key={w.key}
                        className={`text-center border-r shrink-0 flex items-center justify-center text-[10px] font-medium ${isToday ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-400'}`}
                        style={{ width: colW }}
                      >
                        {`${w.weekStart.getMonth() + 1}/${w.weekStart.getDate()}`}
                      </div>
                    )
                  })
                ) : (
                  days.map((d, i) => {
                    const isToday = todayX !== null && i * colW + colW / 2 === todayX
                    return (
                      <div
                        key={d.key}
                        className={`text-center border-r shrink-0 flex flex-col items-center justify-center ${
                          isToday ? 'text-red-400' : d.isWeekend ? 'text-gray-300 bg-gray-50/50' : 'text-gray-400'
                        }`}
                        style={{ width: colW }}
                      >
                        <span className="text-[7px] leading-none">{DOW_LABELS[d.date.getDay()]}</span>
                        <span className={`text-[8px] leading-none mt-0.5 ${isToday ? 'font-bold' : 'font-medium'}`}>{d.day}</span>
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
              {sortedCats.map((cat, catIdx) => renderCategoryRows(cat, catIdx, 'right'))}

              {/* 카테고리 추가 행 — 오른쪽 음영 */}
              {!readOnly && (
                <div
                  className="border-b"
                  style={{ height: CAT_ROW_H, backgroundColor: '#f8f9fa' }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 고정 스크롤바 */}
      <div
        ref={stickyScrollRef}
        className="shrink-0 overflow-x-auto overflow-y-hidden border-t bg-white"
        style={{ height: 14, marginLeft: leftWidth + 4 }}
        onScroll={onStickyScroll}
      >
        <div style={{ width: totalWidth, height: 1 }} />
      </div>

      {/* 메모 hover 툴팁 */}
      {memoHover && (
        <div
          className="fixed z-[9999] pointer-events-none max-w-xs"
          style={{ left: memoHover.x + 14, top: memoHover.y - 8 }}
        >
          <div className="bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl px-3 py-2 leading-relaxed whitespace-pre-wrap break-words">
            {memoHover.text}
          </div>
          <div className="absolute -left-1.5 top-3 w-3 h-3 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  )
}
