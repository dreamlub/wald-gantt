'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, CalendarDays, GripVertical, Check, X } from 'lucide-react'
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

const COL_WIDTH = 72

const PASTEL_COLORS = [
  '#a5b4fc', // indigo
  '#fdba74', // orange
  '#86efac', // green
  '#93c5fd', // blue
  '#f9a8d4', // pink
  '#fde047', // yellow
  '#c4b5fd', // violet
  '#7dd3fc', // sky
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
  const scrollRef       = useRef<HTMLDivElement>(null)
  const stickyScrollRef = useRef<HTMLDivElement>(null)

  const [editProjId, setEditProjId]   = useState<string | null>(null)
  const [editProjVal, setEditProjVal] = useState('')
  const [editCatId, setEditCatId]     = useState<string | null>(null)
  const [editCatVal, setEditCatVal]   = useState('')
  const [addingCat, setAddingCat]     = useState(false)
  const [newCatName, setNewCatName]   = useState('')
  const [dragProjId, setDragProjId]   = useState<string | null>(null)
  const [dragOver, setDragOver]       = useState<DragOver>(null)
  const [sortMode, setSortMode]       = useState<'default' | 'start-asc' | 'end-desc'>('default')

  const sortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order)
  const projectsOf = (catId: string) => {
    const base = projects.filter(p => p.category_id === catId)
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

  function onContentScroll() {
    if (stickyScrollRef.current && scrollRef.current)
      stickyScrollRef.current.scrollLeft = scrollRef.current.scrollLeft
  }
  function onStickyScroll() {
    if (scrollRef.current && stickyScrollRef.current)
      scrollRef.current.scrollLeft = stickyScrollRef.current.scrollLeft
  }

  useEffect(() => {
    if (scrollRef.current && todayCol > 0)
      scrollRef.current.scrollLeft = Math.max(0, todayCol * COL_WIDTH - 200)
  }, [])

  function startEditProj(p: GanttProject, e: React.MouseEvent) {
    e.stopPropagation(); setEditProjId(p.id); setEditProjVal(p.name)
  }
  async function commitEditProj(id: string) {
    if (editProjVal.trim()) await onUpdateProjectName(id, editProjVal.trim())
    setEditProjId(null)
  }

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

  // ── Project drag-and-drop ─────────────────────────────────
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
    const pos = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
    setDragOver({ type: 'project', id, pos })
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

  // ── Bar drag handlers ─────────────────────────────────────
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

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2 border-b shrink-0">
        <h1 className="text-base font-semibold text-gray-800">간트 차트</h1>
        <div className="flex items-center gap-3">
          {/* Sort controls */}
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

          <button
            onClick={() => setAddingCat(true)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            <Plus size={15} /> 카테고리
          </button>
          {sortedCats.length > 0 && (
            <button
              onClick={() => onAddProject(sortedCats[0].id)}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <Plus size={15} /> 프로젝트
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div
        className="flex-1 overflow-auto"
        ref={scrollRef}
        onScroll={onContentScroll}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      >
        <div style={{ width: totalWidth, position: 'relative' }}>

          {/* Year header */}
          <div className="flex sticky top-0 z-20 bg-white border-b">
            {yearGroups.map(({ year, count }) => (
              <div key={year} className="text-sm font-bold text-gray-700 px-3 py-1.5 border-r" style={{ width: COL_WIDTH * count }}>
                {year}
              </div>
            ))}
          </div>

          {/* Month header */}
          <div className="flex sticky top-[34px] z-20 bg-white border-b">
            {months.map(ym => (
              <div
                key={ym}
                className={`text-center text-xs py-1 border-r shrink-0 font-medium ${ym === todayYM ? 'text-red-400' : 'text-gray-400'}`}
                style={{ width: COL_WIDTH }}
              >
                {MONTH_LABELS[parseInt(ym.split('-')[1]) - 1]}
              </div>
            ))}
          </div>

          {/* TODAY label */}
          <div className="sticky z-20 bg-white border-b" style={{ top: 62, height: 18 }}>
            {todayX !== null && (
              <div className="absolute text-[9px] font-bold text-red-400 tracking-widest" style={{ left: todayX, transform: 'translateX(-50%)' }}>
                TODAY
              </div>
            )}
          </div>

          {/* Rows */}
          <div
            className="relative"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            {todayX !== null && (
              <div className="absolute top-0 bottom-0 w-px bg-red-200 z-10 pointer-events-none" style={{ left: todayX }} />
            )}
            {months.map((ym, i) => (
              <div key={ym} className="absolute top-0 bottom-0 border-r border-gray-100 pointer-events-none" style={{ left: i * COL_WIDTH, width: COL_WIDTH }} />
            ))}

            {categories.length === 0 && !addingCat && (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                카테고리를 추가해 보세요
              </div>
            )}

            {sortedCats.map((cat, catIdx) => {
              const barColor  = PASTEL_COLORS[catIdx % PASTEL_COLORS.length]
              const catProjs  = projectsOf(cat.id)
              const isCatOver = dragOver?.type === 'category' && dragOver.id === cat.id

              return (
                <div key={cat.id}>
                  {/* Category header */}
                  <div
                    className="relative flex items-center group border-b"
                    style={{
                      height: 32,
                      backgroundColor: isCatOver ? '#eef2ff' : '#f8f9fa',
                      borderLeft: `3px solid ${cat.color}`,
                    }}
                    onDragOver={e => handleDragOverCategory(e, cat.id)}
                  >
                    <div
                      className="sticky left-0 z-10 flex items-center gap-2 pl-3 pr-2"
                      style={{ backgroundColor: isCatOver ? '#eef2ff' : '#f8f9fa' }}
                    >
                      {editCatId === cat.id ? (
                        <input
                          autoFocus
                          className="text-xs font-bold text-gray-800 border-b border-indigo-400 outline-none bg-transparent w-36"
                          value={editCatVal}
                          onChange={e => setEditCatVal(e.target.value)}
                          onBlur={() => commitEditCat(cat.id)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEditCat(cat.id); if (e.key === 'Escape') setEditCatId(null) }}
                        />
                      ) : (
                        <span
                          className="text-xs font-bold text-gray-700 cursor-text hover:text-indigo-600"
                          onClick={e => startEditCat(cat, e)}
                        >
                          {cat.name}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 tabular-nums">{catProjs.length}</span>
                      <div className="flex items-center opacity-0 group-hover:opacity-100">
                        <button onClick={() => onAddProject(cat.id)} className="p-0.5 text-gray-400 hover:text-indigo-500" title="프로젝트 추가"><Plus size={12} /></button>
                        <button onClick={() => onDeleteCategory(cat.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  </div>

                  {/* Project rows */}
                  {catProjs.map(project => {
                    const cols       = barCols(project)
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
                        className="relative"
                        style={{ opacity: isDragging ? 0.4 : 1 }}
                      >
                        {isProjOver && dragOver?.pos === 'top' && (
                          <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-400 z-30 pointer-events-none" />
                        )}

                        <div
                          className="relative flex items-center group border-b"
                          style={{ height: 36, backgroundColor: isBacklog ? '#f3f4f6' : 'white' }}
                        >
                          {/* Gantt bar */}
                          {cols && (
                            <>
                              <div
                                data-bar-id={project.id}
                                className="absolute top-1/2 -translate-y-1/2 rounded-full group/bar"
                                style={{
                                  left: cols.start * COL_WIDTH + 4,
                                  width: (cols.end - cols.start) * COL_WIDTH - 8,
                                  height: 8,
                                  backgroundColor: barColor,
                                  cursor: 'grab',
                                }}
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

                          {/* Sticky label */}
                          <div
                            className="sticky left-0 z-10 flex items-center gap-1.5 pl-5"
                            style={{ backgroundColor: isBacklog ? '#f3f4f6' : 'white' }}
                          >
                            <GripVertical size={13} className="text-gray-300 group-hover:text-gray-400 shrink-0 cursor-grab" />

                            {editProjId === project.id ? (
                              <input
                                autoFocus
                                className="text-xs font-medium text-gray-800 border-b border-indigo-400 outline-none bg-transparent w-28"
                                value={editProjVal}
                                onChange={e => setEditProjVal(e.target.value)}
                                onBlur={() => commitEditProj(project.id)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEditProj(project.id); if (e.key === 'Escape') setEditProjId(null) }}
                              />
                            ) : (
                              <span
                                className="text-xs font-medium text-gray-800 truncate max-w-[110px] cursor-text hover:text-indigo-600"
                                onClick={e => startEditProj(project, e)}
                                title={project.name}
                              >
                                {project.name}
                              </span>
                            )}

                            {/* Status badge */}
                            <button
                              onClick={() => cycleStatus(project)}
                              className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: sm.bg, color: sm.color }}
                              title="클릭하여 상태 변경"
                            >
                              {sm.label}
                            </button>

                            <div className="flex items-center opacity-0 group-hover:opacity-100">
                              <button onClick={() => onEditProject(project)} className="p-0.5 text-gray-400 hover:text-blue-500" title="수정"><CalendarDays size={11} /></button>
                              <button onClick={() => onDeleteProject(project.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                            </div>
                          </div>
                        </div>

                        {isProjOver && dragOver?.pos === 'bottom' && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400 z-30 pointer-events-none" />
                        )}
                      </div>
                    )
                  })}

                  {/* Add project row */}
                  <div
                    className="border-b border-gray-50"
                    style={{ height: 24 }}
                    onDragOver={e => handleDragOverCategory(e, cat.id)}
                  >
                    <button
                      onClick={() => onAddProject(cat.id)}
                      className="sticky left-5 h-full flex items-center gap-0.5 text-xs text-gray-300 hover:text-gray-500"
                    >
                      <Plus size={10} /> 프로젝트
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Add category inline */}
            {addingCat && (
              <div className="border-b" style={{ height: 34 }}>
                <div className="sticky left-0 z-10 h-full flex items-center gap-2 px-4 bg-white">
                  <input
                    autoFocus
                    className="text-xs font-bold border-b border-indigo-400 outline-none bg-transparent w-40"
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
      </div>

      {/* Sticky scrollbar */}
      <div
        ref={stickyScrollRef}
        className="shrink-0 overflow-x-auto overflow-y-hidden border-t bg-white"
        style={{ height: 14 }}
        onScroll={onStickyScroll}
      >
        <div style={{ width: totalWidth, height: 1 }} />
      </div>
    </div>
  )
}
