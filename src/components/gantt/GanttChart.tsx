'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  DndContext, closestCenter, DragOverlay,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { useDndSensors, findContainer } from '@/lib/dnd-utils'
import { Plus, GripVertical } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { GanttToolbar } from './GanttToolbar'
import {
  buildMonthRange, monthOffset, formatYearMonth, MONTH_LABELS,
  buildWeekRange, dayOffset, dayOffsetInWeeks, buildDayRange, colFracToDate,
} from '@/lib/gantt-utils'
import type { WeekInfo, DayInfo } from '@/lib/gantt-utils'
import type { GanttCategory, GanttProject, GanttStatus } from '@/types'
import { ASSIGNEE_COLORS } from '@/app/(app)/tasks/_constants'
import { MemoTooltip } from '@/components/MemoTooltip'
import {
  CAT_ROW_H, PROJ_ROW_H, CAT_COLORS, STATUS_META, STATUS_ORDER,
  randomCatColor, isProjectOverdue, isStartDelayed, formatBarDate,
  GanttCategoryLeft, GanttCategoryRight,
} from './_GanttRows'

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
  readOnly?: boolean
}

/** 평균 월 일수 (365.25 / 12) — 월뷰 드래그 스냅 계산용 */
const AVG_DAYS_PER_MONTH = 30.4375
const COL_WIDTH      = 72
const WEEK_COL_WIDTH = 36
const DAY_COL_WIDTH  = 28
const LEFT_WIDTH_DEFAULT = 260
const LEFT_WIDTH_MIN     = 160
const LEFT_WIDTH_MAX     = 480
const YEAR_H      = 34
const MONTH_H     = 28
const TODAY_H     = 18
const HEADER_H    = YEAR_H + MONTH_H + TODAY_H  // 80
const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type ViewMode = 'month' | 'week' | 'day'

// ── GanttChart ────────────────────────────────────────────────
export function GanttChart({
  categories, projects, viewStart, viewEnd, boardName,
  undoCount = 0, onUndo, redoCount = 0, onRedo,
  onAddCategory, onUpdateCategory, onDeleteCategory,
  onAddProject, onEditProject, onDeleteProject, onOpenMemo,
  onUpdateProjectDates, onUpdateProjectStatus,
  onMoveProject, onMoveCategory, readOnly = false,
}: Props) {
  const months = buildMonthRange(viewStart, viewEnd)
  const leftRef         = useRef<HTMLDivElement>(null)
  const leftPanelRef    = useRef<HTMLDivElement>(null)
  const rightRef        = useRef<HTMLDivElement>(null)
  const headerRef       = useRef<HTMLDivElement>(null)
  const stickyScrollRef = useRef<HTMLDivElement>(null)

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
  const [overdueFilter, setOverdueFilter] = useState(false)
  const [startDelayedFilter, setStartDelayedFilter] = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const [activeId, setActiveId]             = useState<string | null>(null)
  const [liveItems, setLiveItems]           = useState<Record<string, string[]> | null>(null)
  const [liveCats, setLiveCats]             = useState<string[] | null>(null)
  const [memoHover, setMemoHover]           = useState<{ text: string; x: number; y: number } | null>(null)
  const [barDrag, setBarDrag] = useState<{ cursor: string; tooltipText: string; x: number; y: number } | null>(null)

  const sensors = useDndSensors()

  // 뷰 모드별 파생 값
  const colW      = viewMode === 'week' ? WEEK_COL_WIDTH : viewMode === 'day' ? DAY_COL_WIDTH : COL_WIDTH
  const weeks = useMemo(
    () => viewMode === 'week' ? buildWeekRange(viewStart, viewEnd) : ([] as WeekInfo[]),
    [viewMode, viewStart, viewEnd]
  )
  const days = useMemo(
    () => viewMode === 'day' ? buildDayRange(viewStart, viewEnd) : ([] as DayInfo[]),
    [viewMode, viewStart, viewEnd]
  )
  const totalCols = viewMode === 'week' ? weeks.length : viewMode === 'day' ? days.length : months.length
  const totalWidth = colW * totalCols

  // 헤더용 그룹 (뷰 모드·범위 변경 시만 재계산)
  const yearGroups = useMemo(() => {
    const groups: { year: number; count: number }[] = []
    for (const year of (viewMode === 'month' ? months.map(ym => parseInt(ym)) : viewMode === 'week' ? weeks.map(w => w.year) : days.map(d => d.year))) {
      if (!groups.length || groups[groups.length-1].year !== year) groups.push({ year, count: 1 })
      else groups[groups.length-1].count++
    }
    return groups
  }, [viewMode, months, weeks, days])

  const monthGroups = useMemo(() => {
    const groups: { ym: string; label: string; count: number }[] = []
    for (const item of (viewMode === 'week' ? weeks : viewMode === 'day' ? days : []) as { year: number; month: number }[]) {
      const ym = formatYearMonth(item.year, item.month)
      if (!groups.length || groups[groups.length-1].ym !== ym) groups.push({ ym, label: MONTH_LABELS[item.month-1], count: 1 })
      else groups[groups.length-1].count++
    }
    return groups
  }, [viewMode, weeks, days])

  // 그리드 세로선 위치 (뷰 모드·범위 변경 시만 재계산)
  const gridLinePositions = useMemo(() => {
    const positions: number[] = []
    if (viewMode === 'month') {
      for (let i = 1; i < months.length; i++) positions.push(i * colW)
    } else if (viewMode === 'week') {
      let acc = 0
      for (let g = 0; g < monthGroups.length - 1; g++) {
        acc += monthGroups[g].count
        positions.push(acc * colW)
      }
    } else {
      for (let i = 1; i < days.length; i++) {
        if (days[i].date.getDay() === 0) positions.push(i * colW)
      }
    }
    return positions
  }, [viewMode, months, monthGroups, days, colW])

  const allTeams   = [...new Set(projects.map(p => p.team || ''))].sort()
  const allPMs     = [...new Set(projects.map(p => p.pm || ''))].sort()

  // KST 기준 오늘 (지연 계산용)
  const _today   = new Date()
  const todayStr = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, '0')}-${String(_today.getDate()).padStart(2, '0')}`
  const overdueCount = projects.filter(p => isProjectOverdue(p, todayStr)).length
  const startDelayedCount = projects.filter(p => isStartDelayed(p, todayStr) && !isProjectOverdue(p, todayStr)).length

  const pmColorMap = new Map<string, string>()
  allPMs.filter(Boolean).forEach((pm, i) => pmColorMap.set(pm, ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length]))
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

  // 열 인덱스 → YYYY-MM-DD 날짜 문자열
  function colIndexToDate(colIndex: number): string {
    const idx = Math.max(0, Math.min(colIndex, totalCols - 1))
    if (viewMode === 'day') return days[idx]?.key ?? ''
    if (viewMode === 'week') {
      const ws = weeks[idx]?.weekStart
      if (!ws) return ''
      return `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`
    }
    // month view
    return colFracToDate(viewStart, idx)
  }

  // 날짜 없는 프로젝트 행 클릭 → 바 즉시 생성
  function handleBarCreate(projectId: string, colIndex: number) {
    const startDate = colIndexToDate(colIndex)
    if (!startDate) return
    const start = new Date(startDate + 'T00:00:00')
    const daysToAdd = viewMode === 'month' ? 29 : 6
    const end = new Date(start)
    end.setDate(end.getDate() + daysToAdd)
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    onUpdateProjectDates(projectId, startDate, endDate)
  }

  const today  = _today
  const todayYM  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  let todayX: number | null = null
  if (viewMode === 'month') {
    const col = monthOffset(viewStart, todayYM)
    if (col >= 0 && col < totalCols) {
      const dayOfMonth  = today.getDate()
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
      todayX = col * colW + (dayOfMonth - 1) / daysInMonth * colW
    }
  } else if (viewMode === 'week') {
    const idx = weeks.findIndex(w => { const e = new Date(w.weekStart); e.setDate(e.getDate() + 7); return today >= w.weekStart && today < e })
    if (idx >= 0) {
      const dayOfWeek = (today.getDay() + 6) % 7 // Mon=0 … Sun=6
      todayX = idx * colW + (dayOfWeek + 0.5) / 7 * colW  // 해당 요일 셀 중앙
    }
  } else {
    const idx = days.findIndex(d => d.key === todayStr)
    todayX = idx >= 0 ? idx * colW + colW / 2 : null  // 오늘 컬럼 중앙
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

  // 왼쪽 패널 휠: non-passive 리스너로 등록해야 preventDefault 가능
  useEffect(() => {
    const el = leftPanelRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      if (!rightRef.current) return
      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 16          // 줄 단위 → 픽셀
      else if (e.deltaMode === 2) dy *= rightRef.current.clientHeight  // 페이지 단위 → 픽셀
      rightRef.current.scrollTop += dy
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // 카테고리 추가 모달 열릴 때 랜덤 색상 (외부 트리거 기반 → 의도된 setState)
  useEffect(() => {
    if (addingCat) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewCatColor(randomCatColor(new Set(categories.map(c => c.color))))
    }
  }, [addingCat, categories])

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
      const idx = ws.findIndex(w => { const e = new Date(w.weekStart); e.setDate(e.getDate() + 7); return now >= w.weekStart && now < e })
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
      if (updates.length > 0) await onMoveCategory?.(updates)
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
      const snapDays   = viewMode === 'month' ? 7 : 1
      const pxPerSnap  = viewMode === 'month' ? cw / AVG_DAYS_PER_MONTH * 7
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

      // React state로 overlay + tooltip 활성화
      const cursor = dragType === 'move' ? 'grabbing' : 'ew-resize'
      setBarDrag({ cursor, tooltipText: '', x: 0, y: 0 })

      // 바/메타 요소 (성능상 직접 스타일 업데이트 — ref 기반 DOM 접근)
      const barEl = (e.currentTarget as HTMLElement).closest('[data-bar-id]') as HTMLElement | null
      const metaEl = barEl?.parentElement?.querySelector(`[data-bar-meta-id="${p.id}"]`) as HTMLElement | null

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
        let tooltipText = ''
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
          if (metaEl) { metaEl.style.left = `${(previewColEnd + 1) * cw + 12}px` }
          const sk = ds[Math.max(0, Math.min(previewColStart, ds.length-1))].key
          const ek = ds[Math.max(0, Math.min(previewColEnd,   ds.length-1))].key
          tooltipText = formatBarDate(sk, ek)
        } else {
          snapDelta = Math.round(raw / pxPerSnap)
          const d = snapDelta * snapDays
          let ns = origStartDate, ne = origEndDate
          if (dragType === 'move')         { ns = shift(origStartDate, d);  ne = shift(origEndDate, d) }
          else if (dragType === 'resize-left') { ns = shift(origStartDate, d);  if (ns > origEndDate)   ns = origEndDate }
          else                             { ne = shift(origEndDate, d);    if (ne < origStartDate) ne = origStartDate }
          if (barEl) { const px = barPx(ns, ne); barEl.style.left = `${px.left}px`; barEl.style.width = `${px.width}px` }
          if (metaEl) { const px = barPx(ns, ne); metaEl.style.left = `${px.left + px.width + 16}px` }
          tooltipText = formatBarDate(fmt(ns), fmt(ne))
        }
        setBarDrag({ cursor, tooltipText, x: me.clientX, y: me.clientY })
      }

      async function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        setBarDrag(null)
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

  // DragOverlay 내용: 드래그 중인 행 미리보기
  const activeCatForOverlay  = activeId && isCatDrag(activeId) ? categories.find(c => c.id === activeId) : null
  const activeProjForOverlay = activeId && !isCatDrag(activeId) ? projects.find(p => p.id === activeId) : null

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 툴바 */}
      <GanttToolbar
        boardName={boardName}
        readOnly={readOnly}
        undoCount={undoCount}
        onUndo={onUndo}
        redoCount={redoCount}
        onRedo={onRedo}
        overdueCount={overdueCount}
        overdueFilter={overdueFilter}
        onToggleOverdueFilter={() => setOverdueFilter(v => !v)}
        startDelayedCount={startDelayedCount}
        startDelayedFilter={startDelayedFilter}
        onToggleStartDelayedFilter={() => setStartDelayedFilter(v => !v)}
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
      />

      {/* 메인 영역 */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽 패널 (고정, 레이블) ─────────────────────── */}
        <div
          ref={leftPanelRef}
          className="shrink-0 flex flex-col shadow-panel-l"
          style={{ width: leftWidth, overflowY: 'hidden', overflowX: 'hidden', zIndex: 10 }}
        >
          <div className="shrink-0 border-b bg-card flex items-end justify-between pr-3" style={{ height: HEADER_H }}>
            <span className="text-2xs font-semibold text-muted-foreground px-3 pb-2">프로젝트</span>
            {!readOnly && (
              <button
                onClick={() => setAddingCat(true)}
                className="flex items-center gap-0.5 text-2xs text-muted-foreground hover:text-foreground pb-2 transition-colors"
                title="카테고리 추가"
              >
                <Plus size={11} /> 카테고리
              </button>
            )}
          </div>
          <div
            ref={leftRef}
            className="flex-1 flex flex-col"
            style={{ overflowY: 'scroll', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
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
                    className="flex flex-col items-center justify-center h-28 text-muted-foreground text-xs gap-1 cursor-pointer select-none"
                    onDoubleClick={() => setAddingCat(true)}
                  >
                    <span>카테고리를 추가해 보세요</span>
                    <span className="text-3xs text-ink-300">우측 상단 버튼 또는 더블클릭</span>
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

              {/* DragOverlay: 드래그 중인 행의 커서 따라가는 미리보기 */}
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

          {/* 달력 헤더 — 수평 스크롤만, 항상 고정 표시 */}
          <div
            ref={headerRef}
            className="shrink-0 overflow-hidden bg-card border-b"
            style={{ height: HEADER_H }}
          >
            <div style={{ width: totalWidth }}>
              {/* 연도 행 */}
              <div className="flex border-b" style={{ height: YEAR_H }}>
                {yearGroups.map(({ year, count }) => (
                  <div key={year} className="text-xs font-bold text-foreground px-3 flex items-center border-r bg-muted" style={{ width: colW * count }}>
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
                      className={`text-center text-xs border-r shrink-0 font-medium flex items-center justify-center ${ym === todayYM ? 'text-status-late' : 'text-muted-foreground'}`}
                      style={{ width: colW }}
                    >
                      {MONTH_LABELS[parseInt(ym.split('-')[1]) - 1]}
                    </div>
                  ))
                ) : (
                  monthGroups.map(({ ym, label, count }) => (
                    <div
                      key={ym}
                      className="text-xs border-r shrink-0 font-semibold flex items-center px-2 text-muted-foreground bg-muted"
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
                      <div className="absolute text-4xs font-bold text-status-late tracking-widest" style={{ left: todayX, transform: 'translateX(-50%)', top: 2 }}>
                        TODAY
                      </div>
                    )}
                  </div>
                ) : viewMode === 'week' ? (
                  weeks.map((w, i) => {
                    const isToday = todayX !== null && todayX >= i * colW && todayX < (i + 1) * colW
                    return (
                      <div
                        key={w.key}
                        className={`text-center border-r shrink-0 flex items-center justify-center text-3xs font-medium ${isToday ? 'bg-lilac-100 text-lilac-600 font-semibold' : 'text-muted-foreground'}`}
                        style={{ width: colW }}
                      >
                        {w.weekStart.getDate()}
                      </div>
                    )
                  })
                ) : (
                  days.map(d => {
                    const isToday = d.key === todayStr
                    return (
                      <div
                        key={d.key}
                        className={`text-center border-r shrink-0 flex flex-col items-center justify-center ${
                          isToday ? 'text-status-late' : d.isWeekend ? 'text-ink-300 bg-muted/50' : 'text-muted-foreground'
                        }`}
                        style={{ width: colW }}
                      >
                        <span className="text-6xs leading-none">{DOW_LABELS[d.date.getDay()]}</span>
                        <span className={`text-5xs leading-none mt-0.5 ${isToday ? 'font-bold' : 'font-medium'}`}>{d.day}</span>
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
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overscrollBehavior: 'contain' } as React.CSSProperties}
          >
            <div style={{ width: totalWidth }} className="relative bg-background">
              {/* 그리드 세로선 */}
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
          <div
            className="fixed inset-0 z-tooltip select-none"
            style={{ cursor: barDrag.cursor }}
          />
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
      {memoHover && (
        <MemoTooltip memo={memoHover.text} x={memoHover.x} y={memoHover.y} />
      )}

      {/* 카테고리 추가 모달 */}
      <Dialog open={addingCat} onOpenChange={open => { if (!open) { setAddingCat(false); setNewCatName('') } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>카테고리 추가</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">이름</label>
              <input
                autoFocus
                className="mt-1.5 w-full text-xs border border-border rounded px-3 py-2 outline-none focus:border-lilac-300 placeholder:text-ink-300"
                placeholder="카테고리명"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitAddCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName('') } }}
              />
            </div>
            <div>
              <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">색상</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CAT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCatColor(c)}
                    className={`w-6 h-6 rounded-full hover:scale-110 transition-transform border border-black/5 ${newCatColor === c ? 'ring-2 ring-foreground ring-offset-1' : ''}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddingCat(false); setNewCatName('') }}>취소</Button>
            <Button onClick={submitAddCat} disabled={!newCatName.trim()}>추가</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
