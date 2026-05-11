'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, CalendarDays, GripVertical, Check, X, ChevronDown } from 'lucide-react'
import { buildMonthRange, monthOffset, formatYearMonth, parseYearMonth, MONTH_LABELS } from '@/lib/gantt-utils'
import type { GanttCategory, GanttProject, GanttStatus } from '@/types'

interface Props {
  categories: GanttCategory[]
  projects: GanttProject[]
  viewStart: string
  viewEnd: string
  onAddCategory: (name: string) => Promise<void>
  onUpdateCategory: (id: string, name: string) => Promise<void>
  onDeleteCategory: (id: string) => Promise<void>
  onAddProject: (categoryId: string) => void
  onEditProject: (project: GanttProject) => void
  onDeleteProject: (id: string) => void
  onUpdateProjectDates: (id: string, startMonth: string, endMonth: string) => Promise<void>
  onUpdateProjectName: (id: string, name: string) => Promise<void>
  onUpdateProjectStatus: (id: string, status: GanttStatus) => Promise<void>
  onMoveProject: (updates: { id: string; category_id: string; sort_order: number }[]) => Promise<void>
}

const COL_WIDTH   = 72
const LEFT_WIDTH  = 260
const YEAR_H      = 34
const MONTH_H     = 28
const TODAY_H     = 18
const HEADER_H    = YEAR_H + MONTH_H + TODAY_H  // 80
const CAT_ROW_H   = 32
const PROJ_ROW_H  = 36
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
}
const STATUS_ORDER: GanttStatus[] = ['to-do', 'in-progress', 'pending', 'backlog']

type DragOver =
  | { type: 'category'; id: string }
  | { type: 'project'; id: string; pos: 'top' | 'bottom' }
  | null

function indexToYM(viewStart: string, index: number): string {
  const { year, month } = parseYearMonth(viewStart)
  const total = year * 12 + (month - 1) + index
  return formatYearMonth(Math.floor(total / 12), (total % 12) + 1)
}

export function GanttChart({
  categories, projects, viewStart, viewEnd,
  onAddCategory, onUpdateCategory, onDeleteCategory,
  onAddProject, onEditProject, onDeleteProject,
  onUpdateProjectDates, onUpdateProjectName, onUpdateProjectStatus,
  onMoveProject,
}: Props) {
  const months    = buildMonthRange(viewStart, viewEnd)
  const totalCols = months.length
  const leftRef         = useRef<HTMLDivElement>(null)
  const rightRef        = useRef<HTMLDivElement>(null)
  const stickyScrollRef = useRef<HTMLDivElement>(null)
  const teamFilterRef   = useRef<HTMLDivElement>(null)

  const [editProjId, setEditProjId]       = useState<string | null>(null)
  const [editProjVal, setEditProjVal]     = useState('')
  const [editCatId, setEditCatId]         = useState<string | null>(null)
  const [editCatVal, setEditCatVal]       = useState('')
  const [addingCat, setAddingCat]         = useState(false)
  const [newCatName, setNewCatName]       = useState('')
  const [dragProjId, setDragProjId]       = useState<string | null>(null)
  const [dragOver, setDragOver]           = useState<DragOver>(null)
  const [sortMode, setSortMode]           = useState<'default' | 'start-asc' | 'end-desc'>('default')
  const [excludedTeams, setExcludedTeams] = useState<Set<string>>(new Set())
  const [showTeamFilter, setShowTeamFilter] = useState(false)

  const allTeams  = [...new Set(projects.map(p => p.team || ''))].sort()
  const sortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  const projectsOf = (catId: string) => {
    let base = projects.filter(p => p.category_id === catId)
    if (excludedTeams.size > 0)
      base = base.filter(p => !excludedTeams.has(p.team || ''))
    if (sortMode === 'start-asc')
      return [...base].sort((a, b) => (a.start_month ?? 'zzzz') < (b.start_month ?? 'zzzz') ? -1 : 1)
    if (sortMode === 'end-desc')
      return [...base].sort((a, b) => (a.end_month ?? '') > (b.end_month ?? '') ? -1 : 1)
    return [...base].sort((a, b) => a.sort_order - b.sort_order)
  }

  function barCols(p: GanttProject) {
    if (!p.start_month || !p.end_month) return null
    const s = monthOffset(viewStart, p.start_month)
    const e = monthOffset(viewStart, p.end_month) + 1
    if (s >= totalCols || e <= 0) return null
    return { start: Math.max(0, s), end: Math.min(totalCols, e) }
  }

  const today    = new Date()
  const todayYM  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const todayCol = monthOffset(viewStart, todayYM)
  const todayX   = todayCol >= 0 && todayCol < totalCols ? todayCol * COL_WIDTH + COL_WIDTH / 2 : null

  const yearGroups: { year: number; count: number }[] = []
  for (const ym of months) {
    const y = parseInt(ym.split('-')[0])
    if (!yearGroups.length || yearGroups[yearGroups.length - 1].year !== y)
      yearGroups.push({ year: y, count: 1 })
    else yearGroups[yearGroups.length - 1].count++
  }

  // Scroll sync: right → left (vertical) + sticky scrollbar (horizontal)
  function onRightScroll() {
    if (leftRef.current && rightRef.current)
      leftRef.current.scrollTop = rightRef.current.scrollTop
    if (stickyScrollRef.current && rightRef.current)
      stickyScrollRef.current.scrollLeft = rightRef.current.scrollLeft
  }
  function onStickyScroll() {
    if (rightRef.current && stickyScrollRef.current)
      rightRef.current.scrollLeft = stickyScrollRef.current.scrollLeft
  }
  // Forward wheel on left panel to right panel
  function onLeftWheel(e: React.WheelEvent) {
    if (rightRef.current) rightRef.current.scrollTop += e.deltaY
  }

  useEffect(() => {
    if (rightRef.current && todayCol > 0)
      rightRef.current.scrollLeft = Math.max(0, todayCol * COL_WIDTH - 200)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (teamFilterRef.current && !teamFilterRef.current.contains(e.target as Node))
        setShowTeamFilter(false)
    }
    if (showTeamFilter) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTeamFilter])

  // Project name editing
  function startEditProj(p: GanttProject, e: React.MouseEvent) {
    e.stopPropagation(); setEditProjId(p.id); setEditProjVal(p.name)
  }
  async function commitEditProj(id: string) {
    if (editProjVal.trim()) await onUpdateProjectName(id, editProjVal.trim())
    setEditProjId(null)
  }

  // Category name editing
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

  // ── Row drag-and-drop (left panel) ───────────────────────
  function handleProjDragStart(e: React.DragEvent, id: string) {
    setDragProjId(id)
    e.dataTransfer.effectAllowed = 'move'
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-9999px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => ghost.remove(), 0)
  }

  function handleDragOverProject(e: React.DragEvent, id: string) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragOver({ type: 'project', id, pos: e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom' })
  }

  function handleDragOverCategory(e: React.DragEvent, id: string) {
    e.preventDefault()
    setDragOver({ type: 'category', id })
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (!dragProjId || !dragOver) { resetDrag(); return }

    const dragged = projects.find(p => p.id === dragProjId)
    if (!dragged) { resetDrag(); return }

    let updates: { id: string; category_id: string; sort_order: number }[] = []

    if (dragOver.type === 'category') {
      const catId    = dragOver.id
      const catProjs = projectsOf(catId).filter(p => p.id !== dragProjId)
      const oldProjs = projectsOf(dragged.category_id).filter(p => p.id !== dragProjId)
      updates = [
        ...oldProjs.map((p, i) => ({ id: p.id, category_id: dragged.category_id, sort_order: i })),
        ...catProjs.map((p, i) => ({ id: p.id, category_id: catId, sort_order: i })),
        { id: dragProjId, category_id: catId, sort_order: catProjs.length },
      ]
    } else {
      const target   = projects.find(p => p.id === dragOver.id)
      if (!target) { resetDrag(); return }
      const newCatId = target.category_id
      const catProjs = projectsOf(newCatId).filter(p => p.id !== dragProjId)
      const tIdx     = catProjs.findIndex(p => p.id === dragOver.id)
      catProjs.splice(dragOver.pos === 'bottom' ? tIdx + 1 : tIdx, 0, { ...dragged, category_id: newCatId })
      updates = catProjs.map((p, i) => ({ id: p.id, category_id: newCatId, sort_order: i }))
      if (dragged.category_id !== newCatId) {
        const oldProjs = projectsOf(dragged.category_id).filter(p => p.id !== dragProjId)
        updates.push(...oldProjs.map((p, i) => ({ id: p.id, category_id: dragged.category_id, sort_order: i })))
      }
    }
    resetDrag()
    await onMoveProject(updates)
  }

  function resetDrag() { setDragProjId(null); setDragOver(null) }

  // ── Bar drag handlers (right panel) ──────────────────────
  const makeDragHandlers = useCallback((p: GanttProject, dragType: 'move' | 'resize-left' | 'resize-right') => {
    return (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (!p.start_month || !p.end_month) return

      const origStart = monthOffset(viewStart, p.start_month)
      const origEnd   = monthOffset(viewStart, p.end_month)
      const startX    = e.clientX
      let previewStart = origStart, previewEnd = origEnd

      const overlay = document.createElement('div')
      overlay.style.cssText = `position:fixed;inset:0;cursor:${dragType === 'move' ? 'grabbing' : 'ew-resize'};z-index:9999;user-select:none;`
      document.body.appendChild(overlay)

      const barEl = (e.currentTarget as HTMLElement).closest('[data-bar-id]') as HTMLElement | null

      function onMouseMove(me: MouseEvent) {
        const delta = Math.round((me.clientX - startX) / COL_WIDTH)
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
          barEl.style.left  = `${previewStart * COL_WIDTH + 2}px`
          barEl.style.width = `${(previewEnd - previewStart + 1) * COL_WIDTH - 4}px`
        }
      }

      async function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        overlay.remove()
        if (previewStart !== origStart || previewEnd !== origEnd)
          await onUpdateProjectDates(p.id, indexToYM(viewStart, previewStart), indexToYM(viewStart, previewEnd))
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
  }, [viewStart, totalCols, onUpdateProjectDates])

  const totalWidth = COL_WIDTH * totalCols

  // Shared row renderer helper
  const renderCategoryRows = (cat: GanttCategory, catIdx: number, forPanel: 'left' | 'right') => {
    const barColor  = PASTEL_COLORS[catIdx % PASTEL_COLORS.length]
    const catProjs  = projectsOf(cat.id)
    const isCatOver = dragOver?.type === 'category' && dragOver.id === cat.id

    if (forPanel === 'left') {
      return (
        <div key={cat.id}>
          {/* Category header — left */}
          <div
            className="flex items-center group border-b"
            style={{ height: CAT_ROW_H, backgroundColor: isCatOver ? '#eef2ff' : '#f8f9fa', borderLeft: `3px solid ${cat.color}` }}
            onDragOver={e => handleDragOverCategory(e, cat.id)}
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
                <span className="text-xs font-bold text-gray-700 cursor-text hover:text-indigo-600 truncate" onClick={e => startEditCat(cat, e)}>
                  {cat.name}
                </span>
              )}
              <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">{catProjs.length}</span>
              <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100">
                <button onClick={() => onAddProject(cat.id)} className="p-0.5 text-gray-400 hover:text-indigo-500"><Plus size={12} /></button>
                <button onClick={() => onDeleteCategory(cat.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
              </div>
            </div>
          </div>

          {/* Project rows — left */}
          {catProjs.map(project => {
            const isBacklog  = project.status === 'backlog'
            const isDragging = dragProjId === project.id
            const isProjOver = dragOver?.type === 'project' && dragOver.id === project.id
            const sm         = STATUS_META[project.status]

            return (
              <div
                key={project.id}
                draggable
                onDragStart={e => handleProjDragStart(e, project.id)}
                onDragOver={e => handleDragOverProject(e, project.id)}
                onDragEnd={resetDrag}
                onDrop={handleDrop}
                className="relative"
                style={{ opacity: isDragging ? 0.4 : 1 }}
              >
                {isProjOver && dragOver?.pos === 'top' && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-400 z-30 pointer-events-none" />
                )}
                <div
                  className="flex items-center gap-1.5 group border-b px-2"
                  style={{ height: PROJ_ROW_H, backgroundColor: isBacklog ? '#f3f4f6' : 'white' }}
                >
                  <GripVertical size={13} className="text-gray-300 group-hover:text-gray-400 shrink-0 cursor-grab" />
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
                      onClick={e => startEditProj(project, e)}
                      title={project.name}
                    >
                      {project.name}
                    </span>
                  )}
                  <button
                    onClick={() => cycleStatus(project)}
                    className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: sm.bg, color: sm.color }}
                    title="클릭하여 상태 변경"
                  >
                    {sm.label}
                  </button>
                  <div className="flex items-center ml-auto shrink-0 opacity-0 group-hover:opacity-100">
                    <button onClick={() => onEditProject(project)} className="p-0.5 text-gray-400 hover:text-blue-500"><CalendarDays size={11} /></button>
                    <button onClick={() => onDeleteProject(project.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                  </div>
                </div>
                {isProjOver && dragOver?.pos === 'bottom' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400 z-30 pointer-events-none" />
                )}
              </div>
            )
          })}

          {/* Add project row — left */}
          <div className="border-b border-gray-50" style={{ height: ADD_ROW_H }} onDragOver={e => handleDragOverCategory(e, cat.id)}>
            <button
              onClick={() => onAddProject(cat.id)}
              className="h-full flex items-center gap-0.5 pl-3 text-xs text-gray-300 hover:text-gray-500"
            >
              <Plus size={10} /> 프로젝트
            </button>
          </div>
        </div>
      )
    }

    // right panel
    return (
      <div key={cat.id}>
        {/* Category header — right (empty bar area) */}
        <div
          className="border-b"
          style={{ height: CAT_ROW_H, backgroundColor: isCatOver ? '#eef2ff' : '#f8f9fa' }}
          onDragOver={e => handleDragOverCategory(e, cat.id)}
        />

        {/* Project bar rows — right */}
        {catProjs.map(project => {
          const cols      = barCols(project)
          const isBacklog = project.status === 'backlog'

          return (
            <div
              key={project.id}
              className="relative border-b"
              style={{ height: PROJ_ROW_H, backgroundColor: isBacklog ? '#f3f4f6' : 'white' }}
            >
              {cols && (
                <>
                  <div
                    data-bar-id={project.id}
                    className="absolute top-1/2 -translate-y-1/2 rounded-full group/bar"
                    style={{ left: cols.start * COL_WIDTH + 4, width: (cols.end - cols.start) * COL_WIDTH - 8, height: 8, backgroundColor: barColor, cursor: 'grab' }}
                    onMouseDown={makeDragHandlers(project, 'move')}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-3 rounded-l-full cursor-ew-resize" onMouseDown={e => { e.stopPropagation(); makeDragHandlers(project, 'resize-left')(e) }} />
                    <div className="absolute right-0 top-0 bottom-0 w-3 rounded-r-full cursor-ew-resize" onMouseDown={e => { e.stopPropagation(); makeDragHandlers(project, 'resize-right')(e) }} />
                  </div>
                  {(project.team || project.pm) && (
                    <div className="absolute flex items-center gap-1 pointer-events-none" style={{ left: cols.end * COL_WIDTH + 8, top: '50%', transform: 'translateY(-50%)' }}>
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

        {/* Add project row — right */}
        <div className="border-b border-gray-50" style={{ height: ADD_ROW_H }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2 border-b shrink-0">
        <h1 className="text-base font-semibold text-gray-800">간트 차트</h1>
        <div className="flex items-center gap-3">
          {/* Team filter */}
          {allTeams.length > 0 && (
            <div className="relative" ref={teamFilterRef}>
              <button
                onClick={() => setShowTeamFilter(v => !v)}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 border rounded transition-colors ${excludedTeams.size > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                팀 필터
                {excludedTeams.size > 0 && (
                  <span className="bg-indigo-500 text-white rounded-full text-[9px] w-3.5 h-3.5 flex items-center justify-center">
                    {excludedTeams.size}
                  </span>
                )}
                <ChevronDown size={11} />
              </button>
              {showTeamFilter && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                  <div className="px-3 py-1.5 border-b flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-600">팀별 보기</span>
                    {excludedTeams.size > 0 && (
                      <button onClick={() => setExcludedTeams(new Set())} className="text-[10px] text-indigo-500 hover:text-indigo-700">전체 표시</button>
                    )}
                  </div>
                  {allTeams.map(team => (
                    <label key={team} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={!excludedTeams.has(team)} onChange={() => toggleTeam(team)} className="w-3 h-3 rounded accent-indigo-500" />
                      <span className="text-xs text-gray-700">{team || '팀 없음'}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sort */}
          <div className="flex items-center gap-0.5 border rounded overflow-hidden text-[11px]">
            {(['default', 'start-asc', 'end-desc'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`px-2 py-1 transition-colors ${sortMode === mode ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {mode === 'default' ? '기본' : mode === 'start-asc' ? '시작일↑' : '종료일↓'}
              </button>
            ))}
          </div>

          <button onClick={() => setAddingCat(true)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium">
            <Plus size={15} /> 카테고리
          </button>
          {sortedCats.length > 0 && (
            <button onClick={() => onAddProject(sortedCats[0].id)} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              <Plus size={15} /> 프로젝트
            </button>
          )}
        </div>
      </div>

      {/* Main area: left panel + right panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel (fixed, labels) ─────────────────── */}
        <div
          ref={leftRef}
          onWheel={onLeftWheel}
          className="shrink-0 flex flex-col border-r shadow-[2px_0_6px_rgba(0,0,0,0.06)]"
          style={{ width: LEFT_WIDTH, overflowY: 'hidden', overflowX: 'hidden', zIndex: 10 }}
        >
          {/* Header placeholder */}
          <div className="shrink-0 border-b bg-white flex items-end" style={{ height: HEADER_H }}>
            <span className="text-[11px] font-semibold text-gray-400 px-3 pb-2">프로젝트</span>
          </div>

          {/* Category + project rows */}
          <div className="flex-1 overflow-y-hidden" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
            {categories.length === 0 && !addingCat && (
              <div className="flex items-center justify-center h-20 text-gray-400 text-xs">카테고리를 추가해 보세요</div>
            )}
            {sortedCats.map((cat, catIdx) => renderCategoryRows(cat, catIdx, 'left'))}

            {/* Add category inline */}
            {addingCat && (
              <div className="border-b" style={{ height: 34 }}>
                <div className="h-full flex items-center gap-2 px-3 bg-white">
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
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel (timeline) ─────────────────────── */}
        <div
          ref={rightRef}
          onScroll={onRightScroll}
          className="flex-1 overflow-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          <div style={{ width: totalWidth, position: 'relative' }}>

            {/* Year header */}
            <div className="flex sticky top-0 z-20 bg-white border-b" style={{ height: YEAR_H }}>
              {yearGroups.map(({ year, count }) => (
                <div key={year} className="text-sm font-bold text-gray-700 px-3 flex items-center border-r" style={{ width: COL_WIDTH * count }}>
                  {year}
                </div>
              ))}
            </div>

            {/* Month header */}
            <div className="flex sticky z-20 bg-white border-b" style={{ top: YEAR_H, height: MONTH_H }}>
              {months.map(ym => (
                <div
                  key={ym}
                  className={`text-center text-xs border-r shrink-0 font-medium flex items-center justify-center ${ym === todayYM ? 'text-red-400' : 'text-gray-400'}`}
                  style={{ width: COL_WIDTH }}
                >
                  {MONTH_LABELS[parseInt(ym.split('-')[1]) - 1]}
                </div>
              ))}
            </div>

            {/* TODAY label */}
            <div className="sticky z-20 bg-white border-b" style={{ top: YEAR_H + MONTH_H, height: TODAY_H }}>
              {todayX !== null && (
                <div className="absolute text-[9px] font-bold text-red-400 tracking-widest" style={{ left: todayX, transform: 'translateX(-50%)', top: 2 }}>
                  TODAY
                </div>
              )}
            </div>

            {/* Bar rows */}
            <div className="relative">
              {todayX !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-red-200 z-10 pointer-events-none" style={{ left: todayX }} />
              )}
              {months.map((ym, i) => (
                <div key={ym} className="absolute top-0 bottom-0 border-r border-gray-100 pointer-events-none" style={{ left: i * COL_WIDTH, width: COL_WIDTH }} />
              ))}
              {sortedCats.map((cat, catIdx) => renderCategoryRows(cat, catIdx, 'right'))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky scrollbar */}
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
