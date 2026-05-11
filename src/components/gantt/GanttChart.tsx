'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, CalendarDays, GripVertical } from 'lucide-react'
import { buildMonthRange, monthOffset, formatYearMonth, parseYearMonth, MONTH_LABELS } from '@/lib/gantt-utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GanttProject, GanttStatus } from '@/types'

interface Props {
  projects: GanttProject[]
  viewStart: string
  viewEnd: string
  onAddProject: (parentId?: string) => void
  onEditProject: (project: GanttProject) => void
  onDeleteProject: (id: string) => void
  onUpdateProjectDates: (id: string, startMonth: string, endMonth: string) => Promise<void>
  onUpdateProjectName: (id: string, name: string) => Promise<void>
  onUpdateProjectStatus: (id: string, status: GanttStatus) => Promise<void>
  onReorderProjects: (orderedIds: string[]) => Promise<void>
}

const COL_WIDTH = 72

const PALETTES = [
  { mid: '#fca5a5', strong: '#ef4444', text: '#7f1d1d' },
  { mid: '#c4b5fd', strong: '#8b5cf6', text: '#3b0764' },
  { mid: '#93c5fd', strong: '#3b82f6', text: '#1e3a5f' },
  { mid: '#86efac', strong: '#22c55e', text: '#14532d' },
  { mid: '#fdba74', strong: '#f97316', text: '#7c2d12' },
  { mid: '#fde047', strong: '#eab308', text: '#713f12' },
  { mid: '#f9a8d4', strong: '#ec4899', text: '#831843' },
  { mid: '#7dd3fc', strong: '#0ea5e9', text: '#0c4a6e' },
]

function paletteFor(id: string) {
  const n = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return PALETTES[n % PALETTES.length]
}

function indexToYM(viewStart: string, index: number): string {
  const { year, month } = parseYearMonth(viewStart)
  const total = year * 12 + (month - 1) + index
  return formatYearMonth(Math.floor(total / 12), (total % 12) + 1)
}

const STATUSES: { value: GanttStatus; label: string }[] = [
  { value: 'in-progress', label: 'In-Progress' },
  { value: 'pending',     label: 'Pending' },
  { value: 'backlog',     label: 'Backlog' },
  { value: 'to-do',       label: 'To-Do' },
]

export function GanttChart({
  projects, viewStart, viewEnd,
  onAddProject, onEditProject, onDeleteProject,
  onUpdateProjectDates, onUpdateProjectName, onUpdateProjectStatus,
  onReorderProjects,
}: Props) {
  const months    = buildMonthRange(viewStart, viewEnd)
  const totalCols = months.length
  const scrollRef       = useRef<HTMLDivElement>(null)
  const stickyScrollRef = useRef<HTMLDivElement>(null)

  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editingVal, setEditingVal]   = useState('')
  const [dragId, setDragId]           = useState<string | null>(null)
  const [dragOverId, setDragOverId]   = useState<string | null>(null)
  const [dragOverPos, setDragOverPos] = useState<'top' | 'bottom'>('bottom')

  const topLevel   = projects.filter(p => !p.parent_id).sort((a, b) => a.sort_order - b.sort_order)
  const subtasksOf = (pid: string) =>
    projects.filter(p => p.parent_id === pid).sort((a, b) => a.sort_order - b.sort_order)

  function barCols(p: GanttProject) {
    if (!p.start_month || !p.end_month) return null
    const s = monthOffset(viewStart, p.start_month)
    const e = monthOffset(viewStart, p.end_month) + 1
    if (s >= totalCols || e <= 0) return null
    return { start: Math.max(0, s), end: Math.min(totalCols, e) }
  }

  const today   = new Date()
  const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
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

  function startEdit(p: GanttProject, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(p.id)
    setEditingVal(p.name)
  }
  async function commitEdit(id: string) {
    if (editingVal.trim()) await onUpdateProjectName(id, editingVal.trim())
    setEditingId(null)
  }

  // ── Row drag-to-reorder ───────────────────────────────────
  function handleRowDragStart(e: React.DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    // transparent drag image
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-9999px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => ghost.remove(), 0)
  }

  function handleRowDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pos = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
    setDragOverId(id)
    setDragOverPos(pos)
  }

  async function handleRowDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (!dragId || dragId === targetId) { resetDrag(); return }

    const ids = topLevel.map(p => p.id)
    const fromIdx = ids.indexOf(dragId)
    let toIdx = ids.indexOf(targetId)
    if (dragOverPos === 'bottom') toIdx += 1
    if (fromIdx < toIdx) toIdx -= 1

    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, dragId)

    resetDrag()
    await onReorderProjects(ids)
  }

  function resetDrag() {
    setDragId(null)
    setDragOverId(null)
  }

  // ── Bar drag handlers ─────────────────────────────────────
  const makeDragHandlers = useCallback((p: GanttProject, dragType: 'move' | 'resize-left' | 'resize-right') => {
    return (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      const container = scrollRef.current
      if (!container || !p.start_month || !p.end_month) return

      const origStart = monthOffset(viewStart, p.start_month)
      const origEnd   = monthOffset(viewStart, p.end_month)
      const startX    = e.clientX
      let previewStart = origStart
      let previewEnd   = origEnd

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
          previewStart = Math.max(0, Math.min(origStart + delta, origEnd))
          previewEnd = origEnd
        } else {
          previewStart = origStart
          previewEnd = Math.max(origStart, Math.min(origEnd + delta, totalCols - 1))
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
        <button
          onClick={() => onAddProject()}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          <Plus size={15} />
          프로젝트 추가
        </button>
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
          <div className="relative">
            {todayX !== null && (
              <div className="absolute top-0 bottom-0 w-px bg-red-200 z-10 pointer-events-none" style={{ left: todayX }} />
            )}
            {months.map((ym, i) => (
              <div key={ym} className="absolute top-0 bottom-0 border-r border-gray-100 pointer-events-none" style={{ left: i * COL_WIDTH, width: COL_WIDTH }} />
            ))}

            {topLevel.length === 0 && (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">프로젝트를 추가해 보세요</div>
            )}

            {topLevel.map((project, idx) => {
              const palette  = paletteFor(project.id)
              const subtasks = subtasksOf(project.id)
              const cols     = barCols(project)
              const isBacklog = project.status === 'backlog'
              const isDragging = dragId === project.id
              const isDragOver = dragOverId === project.id

              return (
                <div
                  key={project.id}
                  draggable
                  onDragStart={e => handleRowDragStart(e, project.id)}
                  onDragOver={e => handleRowDragOver(e, project.id)}
                  onDrop={e => handleRowDrop(e, project.id)}
                  onDragEnd={resetDrag}
                  className="relative"
                  style={{ opacity: isDragging ? 0.4 : 1 }}
                >
                  {/* Drop indicator */}
                  {isDragOver && dragOverPos === 'top' && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-400 z-30 pointer-events-none" />
                  )}

                  {/* Group header row */}
                  <div
                    className="relative flex items-center group border-b"
                    style={{
                      height: 36,
                      backgroundColor: isBacklog ? '#f3f4f6' : 'white',
                    }}
                  >
                    {/* Bar */}
                    {cols && (
                      <>
                        <div
                          data-bar-id={project.id}
                          className="absolute top-1/2 -translate-y-1/2 rounded-full group/bar"
                          style={{
                            left: cols.start * COL_WIDTH + 4,
                            width: (cols.end - cols.start) * COL_WIDTH - 8,
                            height: 8,
                            backgroundColor: palette.mid,
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
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: palette.mid + '40', color: palette.text }}>
                                {project.team}
                              </span>
                            )}
                            {project.pm && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap border" style={{ borderColor: palette.mid, color: palette.text }}>
                                👤 {project.pm}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Sticky label area */}
                    <div className="sticky left-0 z-10 flex items-center gap-1 pl-2" style={{ backgroundColor: isBacklog ? '#f3f4f6' : 'white' }}>
                      {/* Drag handle */}
                      <GripVertical size={13} className="text-gray-300 group-hover:text-gray-400 shrink-0 cursor-grab" />

                      {/* Name */}
                      {editingId === project.id ? (
                        <input
                          autoFocus
                          className="text-xs font-semibold text-gray-800 border-b border-indigo-400 outline-none bg-transparent w-28"
                          value={editingVal}
                          onChange={e => setEditingVal(e.target.value)}
                          onBlur={() => commitEdit(project.id)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEdit(project.id); if (e.key === 'Escape') setEditingId(null) }}
                        />
                      ) : (
                        <span
                          className="text-xs font-semibold text-gray-800 truncate max-w-[140px] cursor-text hover:text-indigo-600"
                          onClick={e => startEdit(project, e)}
                          title="클릭하여 편집"
                        >
                          {project.name}
                        </span>
                      )}

                      {/* Status */}
                      <Select value={project.status} onValueChange={v => onUpdateProjectStatus(project.id, v as GanttStatus)}>
                        <SelectTrigger className="h-4 text-[10px] border-0 px-0.5 w-auto gap-0 shadow-none focus:ring-0 text-gray-400">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      {/* Actions */}
                      <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100">
                        <button onClick={() => onAddProject(project.id)} className="p-0.5 text-gray-400 hover:text-indigo-500" title="서브태스크 추가"><Plus size={12} /></button>
                        <button onClick={() => onEditProject(project)} className="p-0.5 text-gray-400 hover:text-blue-500" title="날짜/정보 수정"><CalendarDays size={11} /></button>
                        <button onClick={() => onDeleteProject(project.id)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  </div>

                  {/* Subtask rows */}
                  {subtasks.map(sub => {
                    const subCols = barCols(sub)
                    const subBacklog = sub.status === 'backlog'
                    return (
                      <div
                        key={sub.id}
                        className="relative flex items-center group border-b border-gray-50"
                        style={{ height: 32, backgroundColor: subBacklog ? '#f9fafb' : 'white' }}
                      >
                        {subCols && (
                          <TaskBar
                            id={sub.id}
                            left={subCols.start * COL_WIDTH + 2}
                            width={(subCols.end - subCols.start) * COL_WIDTH - 4}
                            barEnd={subCols.end * COL_WIDTH}
                            color={palette.strong}
                            label={sub.name}
                            team={sub.team}
                            pm={sub.pm}
                            palette={palette}
                            isEditing={editingId === sub.id}
                            editingVal={editingVal}
                            onEditStart={e => startEdit(sub, e)}
                            onEditChange={setEditingVal}
                            onEditCommit={() => commitEdit(sub.id)}
                            onEditCancel={() => setEditingId(null)}
                            onDragMove={makeDragHandlers(sub, 'move')}
                            onDragLeft={makeDragHandlers(sub, 'resize-left')}
                            onDragRight={makeDragHandlers(sub, 'resize-right')}
                            onEdit={() => onEditProject(sub)}
                            onDelete={() => onDeleteProject(sub.id)}
                            onStatusChange={v => onUpdateProjectStatus(sub.id, v)}
                            status={sub.status}
                          />
                        )}
                        {!subCols && (
                          <button onClick={() => onEditProject(sub)} className="sticky left-3 text-xs text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 whitespace-nowrap">
                            {sub.name} — 날짜 설정
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Add subtask */}
                  <div className="border-b border-gray-50" style={{ height: 22 }}>
                    <button
                      onClick={() => onAddProject(project.id)}
                      className="sticky left-3 h-full flex items-center gap-0.5 text-xs text-gray-300 hover:text-gray-500"
                    >
                      <Plus size={10} /> 서브태스크
                    </button>
                  </div>

                  {/* Drop indicator bottom */}
                  {isDragOver && dragOverPos === 'bottom' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400 z-30 pointer-events-none" />
                  )}
                </div>
              )
            })}
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

// ── TaskBar ────────────────────────────────────────────────────────────────────

interface TaskBarProps {
  id: string
  left: number
  width: number
  barEnd: number
  color: string
  label: string
  team?: string | null
  pm?: string | null
  palette: typeof PALETTES[0]
  isEditing: boolean
  editingVal: string
  status: GanttStatus
  onEditStart: (e: React.MouseEvent) => void
  onEditChange: (v: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  onDragMove: (e: React.MouseEvent) => void
  onDragLeft: (e: React.MouseEvent) => void
  onDragRight: (e: React.MouseEvent) => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (v: GanttStatus) => void
}

const STATUSES2 = STATUSES

function TaskBar({
  id, left, width, barEnd, color, label, team, pm, palette,
  isEditing, editingVal, status,
  onEditStart, onEditChange, onEditCommit, onEditCancel,
  onDragMove, onDragLeft, onDragRight,
  onEdit, onDelete, onStatusChange,
}: TaskBarProps) {
  return (
    <>
      <div
        data-bar-id={id}
        className="absolute top-1/2 -translate-y-1/2 rounded-full flex items-center group/bar select-none"
        style={{ left, width, height: 24, backgroundColor: color, cursor: 'grab', minWidth: 8 }}
        onMouseDown={onDragMove}
      >
        {/* Resize left */}
        <div
          className="absolute left-0 top-0 bottom-0 w-3 rounded-l-full cursor-ew-resize z-10 flex items-center justify-center opacity-0 group-hover/bar:opacity-100"
          onMouseDown={e => { e.stopPropagation(); onDragLeft(e) }}
        >
          <div className="w-0.5 h-3 bg-white/60 rounded-full" />
        </div>

        {/* Label */}
        <div className="flex-1 px-4 overflow-hidden">
          {isEditing ? (
            <input
              autoFocus
              className="text-xs font-medium w-full bg-white/30 text-white outline-none rounded px-1"
              value={editingVal}
              onChange={e => onEditChange(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onBlur={onEditCommit}
              onKeyDown={e => { if (e.key === 'Enter') onEditCommit(); if (e.key === 'Escape') onEditCancel() }}
            />
          ) : (
            <span
              className="text-xs font-medium text-white truncate cursor-text block"
              onMouseDown={e => e.stopPropagation()}
              onClick={onEditStart}
            >
              {width > 50 ? label : ''}
            </span>
          )}
        </div>

        {/* Hover popup */}
        <div
          className="absolute -top-6 right-0 flex items-center gap-0.5 bg-white border shadow-sm rounded px-1 py-0.5 opacity-0 group-hover/bar:opacity-100 z-20 whitespace-nowrap"
          onMouseDown={e => e.stopPropagation()}
        >
          <Select value={status} onValueChange={v => onStatusChange(v as GanttStatus)}>
            <SelectTrigger className="h-4 text-[10px] border-0 px-1 w-auto gap-0 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES2.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={onEdit} className="p-0.5 text-gray-400 hover:text-blue-500"><CalendarDays size={10} /></button>
          <button onClick={onDelete} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={10} /></button>
        </div>

        {/* Resize right */}
        <div
          className="absolute right-0 top-0 bottom-0 w-3 rounded-r-full cursor-ew-resize z-10 flex items-center justify-center opacity-0 group-hover/bar:opacity-100"
          onMouseDown={e => { e.stopPropagation(); onDragRight(e) }}
        >
          <div className="w-0.5 h-3 bg-white/60 rounded-full" />
        </div>
      </div>

      {/* Floating team/PM tags */}
      {(team || pm) && (
        <div className="absolute flex items-center gap-1 pointer-events-none" style={{ left: barEnd + 8, top: '50%', transform: 'translateY(-50%)' }}>
          {team && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: palette.mid + '30', color: palette.text }}>
              {team}
            </span>
          )}
          {pm && (
            <span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap border" style={{ borderColor: palette.mid, color: palette.text }}>
              👤 {pm}
            </span>
          )}
        </div>
      )}
    </>
  )
}
