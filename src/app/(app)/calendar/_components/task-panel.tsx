'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, GripVertical, CalendarDays, ChevronDown } from 'lucide-react'
import type { GanttTask } from '@/types'
import { STATUS_COLOR, STATUS_LABEL } from '@/app/(app)/tasks/_constants'
import { STATUS_ORDER, SORT_LABELS, SORT_CYCLE, DRAG_OVER_BG } from '../_constants'
import type { SortKey } from '../_constants'
import { fmtDate, fmtScheduledAt } from '../_utils'
import { setActiveDragOffsetY } from './drag-state'
import { Switch } from '@/components/ui/switch'

interface Props {
  tasks: GanttTask[]
  onTaskClick?: (task: GanttTask) => void
  onUnschedule?: (taskId: string) => void
}

export function TaskPanel({ tasks, onTaskClick, onUnschedule }: Props) {
  const [q, setQ]               = useState('')
  const [sort, setSort]         = useState<SortKey>('deadline')
  const [showSort, setShowSort] = useState(false)
  const [hideDone, setHideDone] = useState(true)
  const [dragOver, setDragOver] = useState(false)

  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node))
        setShowSort(false)
    }
    if (showSort) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showSort])

  const candidates = tasks.filter(t => !t.deleted_at)

  const ql = q.toLowerCase()
  const filtered = candidates.filter(t =>
    q === '' ||
    t.title.toLowerCase().includes(ql) ||
    (t.labels ?? []).some(l => l.toLowerCase().includes(ql))
  )

  const sorted = [...filtered].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0
    const bDone = b.status === 'done' ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    if (sort === 'deadline') {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    }
    if (sort === 'priority') return (b.priority ?? 0) - (a.priority ?? 0)
    return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  })

  const handleDragStart = (e: React.DragEvent, task: GanttTask) => {
    setActiveDragOffsetY(0)
    e.dataTransfer.setData('taskId', task.id)
    e.dataTransfer.setData('offsetY', '0')
    e.dataTransfer.setData('source', 'panel')
    e.dataTransfer.setData('from-panel', '')
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('from-grid')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) onUnschedule?.(taskId)
  }

  const visible = hideDone ? sorted.filter(t => t.status !== 'done') : sorted
  const doneCount = sorted.filter(t => t.status === 'done').length

  const unscheduledPending = candidates.filter(t => !t.scheduled_at && t.status !== 'done').length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
        <h1 className="text-sm font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">업무시간 관리</h1>
      </div>

      {/* 검색 */}
      <div className="shrink-0 px-2 pt-2 pb-1.5">
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setQ('') }}
            placeholder="태스크 검색"
            className="w-full h-6 pl-5 pr-2 text-2xs border border-border rounded outline-none focus:ring-1 focus:ring-lilac-300 text-muted-foreground placeholder:text-ink-300 bg-background"
          />
        </div>
      </div>

      {/* 정렬 콤보박스 + 완료 토글 */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border">
        {/* 정렬 드롭다운 */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setShowSort(v => !v)}
            className="flex items-center gap-1 text-xs px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            {SORT_LABELS[sort]}
            <ChevronDown size={12} />
          </button>
          {showSort && (
            <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[100px] py-1">
              {SORT_CYCLE.map(key => (
                <button
                  key={key}
                  onClick={() => { setSort(key); setShowSort(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    sort === key
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* 완료 토글 */}
        <Switch
          checked={!hideDone}
          onCheckedChange={(show) => setHideDone(!show)}
          label={<span className="text-xs">완료 포함</span>}
          offClassName="bg-border"
          className="text-ink-400 flex-row-reverse"
        />
      </div>

      {/* 태스크 목록 — from-grid 드롭 시 스케줄 해제 */}
      <div
        className={`flex-1 overflow-y-auto py-1.5 transition-colors ${dragOver ? DRAG_OVER_BG : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="mx-2 mb-1.5 border-2 border-dashed border-lilac-400 rounded text-xs text-lilac-500 text-center py-2">
            여기에 놓으면 배치 해제
          </div>
        )}

        {visible.length === 0 ? (
          <p className="text-2xs text-ink-400 text-center py-10">
            {q ? '검색 결과 없음' : hideDone && doneCount > 0 ? '미완료 태스크 없음' : '태스크 없음'}
          </p>
        ) : (
          visible.map(task => {
            const isScheduled = !!task.scheduled_at
            const isDone      = task.status === 'done'
            const color       = STATUS_COLOR[task.status]

            if (isScheduled) {
              return (
                <div
                  key={task.id}
                  onClick={() => onTaskClick?.(task)}
                  className={`mx-2 my-1 rounded border border-border bg-card cursor-pointer select-none transition-colors hover:border-lilac-300 ${
                    isDone ? 'opacity-40' : 'opacity-70'
                  }`}
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <div className="px-2 py-1.5 flex items-start gap-1.5">
                    <CalendarDays size={11} className="shrink-0 mt-0.5 text-ink-300" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug line-clamp-2 ${isDone ? 'line-through text-ink-400' : 'text-foreground'}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-ink-400 mt-0.5">
                        {fmtScheduledAt(task.scheduled_at!)}
                        {task.due_date && <span> · 목표 {fmtDate(task.due_date)}</span>}
                      </p>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={task.id}
                draggable={!isDone}
                onDragStart={e => handleDragStart(e, task)}
                className={`mx-2 my-1 rounded border select-none transition-colors hover:border-lilac-300 ${
                  isDone ? 'opacity-50 border-border bg-card' : 'border-border'
                }`}
                style={{
                  borderLeft: `4px solid ${color}`,
                  backgroundColor: isDone ? undefined : `color-mix(in srgb, ${color} 8%, var(--color-background))`,
                }}
              >
                <div className="px-1.5 py-1.5 flex items-start gap-1">
                  <div
                    className={`shrink-0 pt-0.5 text-ink-200 hover:text-ink-400 transition-colors ${
                      isDone ? 'invisible' : 'cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    <GripVertical size={12} />
                  </div>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => onTaskClick?.(task)}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className={`text-xs leading-snug line-clamp-2 flex-1 ${isDone ? 'line-through text-ink-400' : 'text-foreground'}`}>
                        {task.title}
                      </p>
                      {task.due_date && (
                        <span className="text-2xs text-ink-400 shrink-0 mt-0.5">{fmtDate(task.due_date)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {!isDone && (
                        <span
                          className="text-4xs px-1 py-px rounded-full border leading-none"
                          style={{
                            color,
                            borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
                            backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
                          }}
                        >
                          {STATUS_LABEL[task.status]}
                        </span>
                      )}
                      {task.assignee && (
                        <span className="text-2xs text-ink-400 truncate">{task.assignee}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="shrink-0 px-3 py-2 border-t border-border">
        <p className="text-xs text-ink-400">미배치 {unscheduledPending}개</p>
      </div>
    </div>
  )
}
