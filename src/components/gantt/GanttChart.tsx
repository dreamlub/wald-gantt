'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, CalendarDays } from 'lucide-react'
import { buildMonthRange, monthOffset, formatYearMonth, parseYearMonth, MONTH_LABELS } from '@/lib/gantt-utils'
import { StatusBadge } from './StatusBadge'
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
}

const COL_WIDTH = 56
const LABEL_WIDTH = 300

const STATUSES: { value: GanttStatus; label: string }[] = [
  { value: 'in-progress', label: 'In-Progress' },
  { value: 'pending',     label: 'Pending' },
  { value: 'backlog',     label: 'Backlog' },
  { value: 'to-do',       label: 'To-Do' },
]

function indexToYM(viewStart: string, index: number): string {
  const { year, month } = parseYearMonth(viewStart)
  const total = year * 12 + (month - 1) + index
  return formatYearMonth(Math.floor(total / 12), (total % 12) + 1)
}

// Bar colors per project (deterministic from id)
const COLORS = ['#6366f1','#3b82f6','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#64748b']
function colorFor(id: string) {
  const n = id.charCodeAt(0) + id.charCodeAt(id.length - 1)
  return COLORS[n % COLORS.length]
}

export function GanttChart({
  projects, viewStart, viewEnd,
  onAddProject, onEditProject, onDeleteProject,
  onUpdateProjectDates, onUpdateProjectName, onUpdateProjectStatus,
}: Props) {
  const months    = buildMonthRange(viewStart, viewEnd)
  const totalCols = months.length
  const scrollRef       = useRef<HTMLDivElement>(null)
  const stickyScrollRef = useRef<HTMLDivElement>(null)

  function onContentScroll() {
    if (stickyScrollRef.current && scrollRef.current)
      stickyScrollRef.current.scrollLeft = scrollRef.current.scrollLeft
  }
  function onStickyScroll() {
    if (scrollRef.current && stickyScrollRef.current)
      scrollRef.current.scrollLeft = stickyScrollRef.current.scrollLeft
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingVal, setEditingVal] = useState('')

  const topLevel = projects.filter(p => !p.parent_id).sort((a, b) => a.sort_order - b.sort_order)
  const subtasksOf = (pid: string) =>
    projects.filter(p => p.parent_id === pid).sort((a, b) => a.sort_order - b.sort_order)

  function toggleCollapse(id: string) {
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function barCols(p: GanttProject) {
    if (!p.start_month || !p.end_month) return null
    const s = monthOffset(viewStart, p.start_month)
    const e = monthOffset(viewStart, p.end_month) + 1
    if (s >= totalCols || e <= 0) return null
    return { start: Math.max(0, s), end: Math.min(totalCols, e) }
  }

  // Inline edit
  function startEdit(p: GanttProject, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(p.id)
    setEditingVal(p.name)
  }

  async function commitEdit(id: string) {
    if (editingVal.trim()) await onUpdateProjectName(id, editingVal.trim())
    setEditingId(null)
  }

  // Year groups for header
  const yearGroups: { year: number; count: number }[] = []
  for (const ym of months) {
    const y = parseInt(ym.split('-')[0])
    if (!yearGroups.length || yearGroups[yearGroups.length - 1].year !== y)
      yearGroups.push({ year: y, count: 1 })
    else yearGroups[yearGroups.length - 1].count++
  }

  const today = new Date()
  const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  // Scroll to current month on mount
  useEffect(() => {
    const col = monthOffset(viewStart, currentYM)
    if (scrollRef.current && col > 0) {
      scrollRef.current.scrollLeft = Math.max(0, col * COL_WIDTH - 150)
    }
  }, [])

  // Drag handlers
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
          barEl.style.left  = `${previewStart * COL_WIDTH}px`
          barEl.style.width = `${(previewEnd - previewStart + 1) * COL_WIDTH}px`
        }
      }

      async function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        overlay.remove()
        if (previewStart !== origStart || previewEnd !== origEnd) {
          await onUpdateProjectDates(p.id, indexToYM(viewStart, previewStart), indexToYM(viewStart, previewEnd))
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
  }, [viewStart, totalCols, onUpdateProjectDates])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-white shrink-0">
        <h1 className="text-base font-semibold text-gray-900">간트 차트</h1>
        <button
          onClick={() => onAddProject()}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          <Plus size={15} />
          프로젝트 추가
        </button>
      </div>

      {/* Chart */}
      <div className="flex-1 overflow-auto" ref={scrollRef} onScroll={onContentScroll}>
        <div style={{ minWidth: LABEL_WIDTH + COL_WIDTH * totalCols }}>

          {/* Year header */}
          <div className="flex sticky top-0 z-20 bg-gray-50 border-b">
            <div className="shrink-0 border-r bg-gray-50 sticky left-0 z-30" style={{ width: LABEL_WIDTH }} />
            {yearGroups.map(({ year, count }) => (
              <div key={year} className="border-r text-center text-xs font-semibold text-gray-500 py-1.5" style={{ width: COL_WIDTH * count }}>
                {year}
              </div>
            ))}
          </div>

          {/* Month header */}
          <div className="flex sticky top-[26px] z-20 bg-gray-50 border-b">
            <div className="shrink-0 border-r bg-gray-50 sticky left-0 z-30" style={{ width: LABEL_WIDTH }} />
            {months.map(ym => {
              const isNow = ym === currentYM
              return (
                <div
                  key={ym}
                  className={`text-center text-xs py-1.5 border-r shrink-0 ${isNow ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-400'}`}
                  style={{ width: COL_WIDTH }}
                >
                  {MONTH_LABELS[parseInt(ym.split('-')[1]) - 1]}
                </div>
              )
            })}
          </div>

          {/* Project rows */}
          {topLevel.map(project => {
            const subtasks = subtasksOf(project.id)
            const cols = barCols(project)
            const color = colorFor(project.id)
            const isOpen = !collapsed.has(project.id)

            return (
              <div key={project.id}>
                {/* Project row */}
                <div className="flex border-b hover:bg-gray-50/60 group" style={{ minHeight: 38 }}>
                  {/* Label */}
                  <div
                    className="shrink-0 sticky left-0 z-10 bg-white group-hover:bg-gray-50/60 border-r flex items-center px-2 gap-1"
                    style={{ width: LABEL_WIDTH }}
                  >
                    <button onClick={() => toggleCollapse(project.id)} className="text-gray-300 hover:text-gray-500 shrink-0">
                      {subtasks.length > 0
                        ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
                        : <span className="w-3.5 inline-block" />
                      }
                    </button>

                    {/* Inline name edit */}
                    {editingId === project.id ? (
                      <input
                        autoFocus
                        className="text-sm font-semibold text-gray-800 flex-1 min-w-0 border-b border-indigo-400 outline-none bg-transparent"
                        value={editingVal}
                        onChange={e => setEditingVal(e.target.value)}
                        onBlur={() => commitEdit(project.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(project.id); if (e.key === 'Escape') setEditingId(null) }}
                      />
                    ) : (
                      <span
                        className="text-sm font-semibold text-gray-800 truncate flex-1 cursor-text hover:text-indigo-600"
                        onClick={e => startEdit(project, e)}
                        title="클릭하여 편집"
                      >
                        {project.name}
                      </span>
                    )}

                    {/* Status select */}
                    <Select value={project.status} onValueChange={v => onUpdateProjectStatus(project.id, v as GanttStatus)}>
                      <SelectTrigger className="h-5 text-xs border-0 px-1 w-auto gap-0.5 shadow-none focus:ring-0 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                      <button onClick={() => onAddProject(project.id)} className="p-1 text-gray-400 hover:text-indigo-500" title="서브태스크 추가">
                        <Plus size={13} />
                      </button>
                      <button onClick={() => onEditProject(project)} className="p-1 text-gray-400 hover:text-blue-500" title="날짜 수정">
                        <CalendarDays size={12} />
                      </button>
                      <button onClick={() => onDeleteProject(project.id)} className="p-1 text-gray-400 hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Grid + bar */}
                  <div className="flex flex-1 relative items-center" style={{ minHeight: 38 }}>
                    {months.map(ym => (
                      <div key={ym} className={`shrink-0 h-full border-r ${ym === currentYM ? 'bg-indigo-50/30' : ''}`} style={{ width: COL_WIDTH }} />
                    ))}
                    {cols && (
                      <GanttBar
                        id={project.id}
                        left={cols.start * COL_WIDTH}
                        width={(cols.end - cols.start) * COL_WIDTH}
                        color={color}
                        label={project.name}
                        height={22}
                        onDragMove={makeDragHandlers(project, 'move')}
                        onDragLeft={makeDragHandlers(project, 'resize-left')}
                        onDragRight={makeDragHandlers(project, 'resize-right')}
                      />
                    )}
                  </div>
                </div>

                {/* Subtask rows */}
                {isOpen && subtasks.map(sub => {
                  const subCols = barCols(sub)
                  return (
                    <div key={sub.id} className="flex border-b hover:bg-gray-50/40 group" style={{ minHeight: 32 }}>
                      <div
                        className="shrink-0 sticky left-0 z-10 bg-white group-hover:bg-gray-50/40 border-r flex items-center pl-7 pr-2 gap-1"
                        style={{ width: LABEL_WIDTH }}
                      >
                        <span className="text-gray-300 text-xs shrink-0">└</span>

                        {editingId === sub.id ? (
                          <input
                            autoFocus
                            className="text-xs text-gray-700 flex-1 min-w-0 border-b border-indigo-400 outline-none bg-transparent"
                            value={editingVal}
                            onChange={e => setEditingVal(e.target.value)}
                            onBlur={() => commitEdit(sub.id)}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(sub.id); if (e.key === 'Escape') setEditingId(null) }}
                          />
                        ) : (
                          <span
                            className="text-xs text-gray-600 truncate flex-1 cursor-text hover:text-indigo-600"
                            onClick={e => startEdit(sub, e)}
                            title="클릭하여 편집"
                          >
                            {sub.name}
                          </span>
                        )}

                        <Select value={sub.status} onValueChange={v => onUpdateProjectStatus(sub.id, v as GanttStatus)}>
                          <SelectTrigger className="h-5 text-xs border-0 px-1 w-auto gap-0.5 shadow-none focus:ring-0 shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>

                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                          <button onClick={() => onEditProject(sub)} className="p-1 text-gray-400 hover:text-blue-500" title="날짜 수정">
                            <CalendarDays size={12} />
                          </button>
                          <button onClick={() => onDeleteProject(sub.id)} className="p-1 text-gray-400 hover:text-red-500">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-1 relative items-center" style={{ minHeight: 32 }}>
                        {months.map(ym => (
                          <div key={ym} className={`shrink-0 h-full border-r ${ym === currentYM ? 'bg-indigo-50/30' : ''}`} style={{ width: COL_WIDTH }} />
                        ))}
                        {subCols && (
                          <GanttBar
                            id={sub.id}
                            left={subCols.start * COL_WIDTH}
                            width={(subCols.end - subCols.start) * COL_WIDTH}
                            color={color}
                            label={sub.name}
                            height={16}
                            opacity={0.6}
                            onDragMove={makeDragHandlers(sub, 'move')}
                            onDragLeft={makeDragHandlers(sub, 'resize-left')}
                            onDragRight={makeDragHandlers(sub, 'resize-right')}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Empty state */}
          {topLevel.length === 0 && (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              프로젝트를 추가해 보세요
            </div>
          )}
        </div>
      </div>

      {/* Sticky horizontal scrollbar always visible at bottom */}
      <div
        ref={stickyScrollRef}
        className="shrink-0 overflow-x-auto overflow-y-hidden border-t bg-white"
        style={{ height: 14 }}
        onScroll={onStickyScroll}
      >
        <div style={{ width: LABEL_WIDTH + COL_WIDTH * totalCols, height: 1 }} />
      </div>
    </div>
  )
}

interface GanttBarProps {
  id: string
  left: number
  width: number
  color: string
  label: string
  height: number
  opacity?: number
  onDragMove: (e: React.MouseEvent) => void
  onDragLeft: (e: React.MouseEvent) => void
  onDragRight: (e: React.MouseEvent) => void
}

function GanttBar({ id, left, width, color, label, height, opacity = 1, onDragMove, onDragLeft, onDragRight }: GanttBarProps) {
  return (
    <div
      data-bar-id={id}
      className="absolute top-1/2 -translate-y-1/2 rounded flex items-center group/bar select-none"
      style={{ left, width, height, backgroundColor: color, opacity, cursor: 'grab' }}
      onMouseDown={onDragMove}
      title={label}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2 rounded-l cursor-ew-resize opacity-0 group-hover/bar:opacity-100 bg-black/25"
        onMouseDown={onDragLeft}
      />
      <span className="px-2 text-white text-xs font-medium truncate flex-1 pointer-events-none">
        {width > COL_WIDTH && label}
      </span>
      <div
        className="absolute right-0 top-0 bottom-0 w-2 rounded-r cursor-ew-resize opacity-0 group-hover/bar:opacity-100 bg-black/25"
        onMouseDown={onDragRight}
      />
    </div>
  )
}
