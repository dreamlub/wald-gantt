'use client'

import { useRef, useState } from 'react'
import { X, Check } from 'lucide-react'
import type { GanttTask } from '@/types'
import { STATUS_COLOR, STATUS_BG_COLOR } from '@/app/(app)/tasks/_constants'
import { setActiveDragOffsetY } from './drag-state'

const SNAP_MIN  = 15
const HOUR_H    = 60
const START_H   = 7
const END_H     = 23

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function pxToMinutes(px: number): number {
  return (px / HOUR_H) * 60
}

interface Props {
  task: GanttTask
  top: number
  height: number
  getMinutesFromY: (clientY: number) => number
  date: string
  colIndex?: number
  totalCols?: number
  onMove: (taskId: string, scheduledAt: string) => void
  onResize: (taskId: string, durationMinutes: number) => void
  onUnschedule: (taskId: string) => void
  onStatusChange: (taskId: string, status: string) => void
  onClick: () => void
}

function buildIso(date: string, totalMinutes: number): string {
  const [y, mo, d] = date.split('-').map(Number)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return new Date(y, mo - 1, d, h, m).toISOString()
}

export function TaskBlock({
  task, top, height, getMinutesFromY, date,
  colIndex = 0, totalCols = 1,
  onMove, onResize, onUnschedule, onStatusChange, onClick,
}: Props) {
  const [prevStatus, setPrevStatus] = useState<string | null>(null)
  const dragOffsetY  = useRef(0)
  const startY       = useRef(0)
  const startHeight  = useRef(0)
  const isDragging   = useRef(false)
  const blockRef     = useRef<HTMLDivElement>(null)

  const color  = STATUS_COLOR[task.status] ?? 'var(--color-ink-400)'
  const bg     = STATUS_BG_COLOR[task.status] ?? 'var(--color-ink-100)'
  const isDone = task.status === 'done'

  const handleToggleDone = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDone) {
      onStatusChange(task.id, prevStatus ?? 'to-do')
      setPrevStatus(null)
    } else {
      setPrevStatus(task.status)
      onStatusChange(task.id, 'done')
    }
  }

  /* ── 블록 중앙 드래그 (이동) ── */
  const handleDragStart = (e: React.DragEvent) => {
    if (!blockRef.current) return
    const rect = blockRef.current.getBoundingClientRect()
    dragOffsetY.current = e.clientY - rect.top
    setActiveDragOffsetY(dragOffsetY.current)
    e.dataTransfer.setData('taskId', task.id)
    e.dataTransfer.setData('offsetY', String(dragOffsetY.current))
    e.dataTransfer.setData('source', 'grid')
    e.dataTransfer.setData('from-grid', '')
    e.dataTransfer.effectAllowed = 'move'
  }

  /* ── 하단 핸들 마우스 드래그 (리사이즈) ── */
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startY.current      = e.clientY
    startHeight.current = height
    isDragging.current  = false

    const onMouseMove = (me: MouseEvent) => {
      isDragging.current = true
      const dy    = me.clientY - startY.current
      const newPx = Math.max(startHeight.current + dy, HOUR_H / 4) // min 15min
      const rawMin = pxToMinutes(newPx)
      const snapped = clamp(snapToGrid(rawMin), SNAP_MIN, (END_H - START_H) * 60)
      if (blockRef.current) {
        blockRef.current.style.height = `${(snapped / 60) * HOUR_H}px`
      }
    }

    const onMouseUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (!isDragging.current) return
      const dy    = me.clientY - startY.current
      const newPx = Math.max(startHeight.current + dy, HOUR_H / 4)
      const rawMin = pxToMinutes(newPx)
      const snapped = clamp(snapToGrid(rawMin), SNAP_MIN, (END_H - START_H) * 60)
      onResize(task.id, snapped)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  /* ── 클릭 vs 드래그 구분 ── */
  const clickStart = useRef<{ x: number; y: number } | null>(null)
  const handleMouseDown = (e: React.MouseEvent) => {
    clickStart.current = { x: e.clientX, y: e.clientY }
  }
  const handleMouseUp = (e: React.MouseEvent) => {
    if (!clickStart.current) return
    const dx = Math.abs(e.clientX - clickStart.current.x)
    const dy = Math.abs(e.clientY - clickStart.current.y)
    if (dx < 4 && dy < 4) onClick()
    clickStart.current = null
  }

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const leftPct  = (colIndex / totalCols) * 100
  const widthPct = (1 / totalCols) * 100
  const isOverlapping = totalCols > 1

  return (
    <div
      ref={blockRef}
      draggable
      onDragStart={handleDragStart}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      className="absolute rounded px-2 py-2 overflow-hidden cursor-grab active:cursor-grabbing group z-10 flex flex-col gap-1"
      style={{
        top,
        height,
        left: `calc(${leftPct}% + ${colIndex > 0 ? 1 : 0}px)`,
        width: `calc(${widthPct}% - ${colIndex === totalCols - 1 ? 4 : 2}px)`,
        backgroundColor: bg,
        borderLeft: `3px solid ${color}`,
      }}
    >
      {/* 1행: 체크 원 + 시간 */}
      <div className="flex items-center gap-1 pr-5">
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={handleToggleDone}
          className="shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors hover:opacity-80"
          style={{ borderColor: color, backgroundColor: isDone ? color : 'transparent' }}
          title={isDone ? '완료 취소' : '완료로 표시'}
        >
          {isDone && <Check size={7} className="text-white stroke-[3]" />}
        </button>
        {task.scheduled_at && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0">
            {fmtTime(task.scheduled_at)}
            {task.duration_minutes ? ` · ${task.duration_minutes}분` : ''}
            {isOverlapping && (
              <span className="inline-block text-[10px] px-1 py-px rounded bg-status-warn/15 text-status-warn border border-status-warn/25 leading-none shrink-0">
                중복
              </span>
            )}
          </span>
        )}
      </div>
      {/* 2행: 태스크명 */}
      <p className={`text-[10px] font-medium line-clamp-2 leading-tight ${isDone ? 'line-through opacity-60' : 'text-foreground'}`}>
        {task.title}
      </p>

      {/* 스케줄 해제 버튼 */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onUnschedule(task.id) }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
      >
        <X size={10} />
      </button>

      {/* 리사이즈 핸들 */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
      />
    </div>
  )
}
