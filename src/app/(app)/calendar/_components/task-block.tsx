'use client'

import { useRef, useState, useEffect } from 'react'
import { X, Check } from 'lucide-react'
import type { GanttTask } from '@/types'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { STATUS_COLOR, STATUS_BG_COLOR } from '@/app/(app)/tasks/_constants'
import { SNAP_MIN, HOUR_H, START_H, END_H } from '../_constants'
import { snapToGrid, clamp, pxToMinutes, buildIso, fmtTime, toMinutes } from '../_utils'
import { setActiveDragOffsetY } from './drag-state'

interface Props {
  task: GanttTask
  top: number
  height: number
  date: string
  colIndex?: number
  totalCols?: number
  highlight?: boolean
  onHighlightClear?: () => void
  onResize: (taskId: string, durationMinutes: number) => void
  onUnschedule: (taskId: string) => void
  onStatusChange: (taskId: string, status: string) => void
  onClick: () => void
}

export function TaskBlock({
  task, top, height, date,
  colIndex = 0, totalCols = 1,
  highlight = false, onHighlightClear,
  onResize, onUnschedule, onStatusChange, onClick,
}: Props) {
  const [prevStatus, setPrevStatus] = useState<string | null>(null)
  const dragOffsetY  = useRef(0)
  const startY       = useRef(0)
  const startHeight  = useRef(0)
  const isDragging   = useRef(false)
  const blockRef     = useRef<HTMLDivElement>(null)

  /* ── 하이라이트 처리 ── */
  useEffect(() => {
    if (!highlight || !blockRef.current) return
    blockRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => onHighlightClear?.(), 3000)
    return () => clearTimeout(timer)
  }, [highlight, onHighlightClear])

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

  const leftPct  = (colIndex / totalCols) * 100
  const widthPct = (1 / totalCols) * 100

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            ref={blockRef}
            draggable
            onDragStart={handleDragStart}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            className={`absolute rounded px-1.5 py-0.5 overflow-hidden cursor-grab active:cursor-grabbing group z-10 flex flex-col gap-0 ${
              highlight ? 'ring-2 ring-lilac-400 animate-pulse' : ''
            }`}
            style={{
              top,
              height: height - 2,
              left: `calc(${leftPct}% + ${colIndex > 0 ? 1 : 0}px)`,
              width: `calc(${widthPct}% - ${colIndex === totalCols - 1 ? 4 : 2}px)`,
              backgroundColor: bg,
              borderLeft: `3px solid ${color}`,
            }}
          />
        }
      >
        {/* 1행: 체크 + 태스크명 */}
        <div className="flex items-center gap-1 leading-tight pr-5">
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={handleToggleDone}
            className="shrink-0 w-2.5 h-2.5 rounded-full border-[1.5px] flex items-center justify-center transition-colors hover:opacity-80"
            style={{ borderColor: color, backgroundColor: isDone ? color : 'transparent' }}
          >
            {isDone && <Check size={6} className="text-white stroke-[3]" />}
          </button>
          <p className={`text-2xs font-medium truncate flex-1 ${isDone ? 'line-through opacity-60' : 'text-foreground'}`}>
            {task.title}
          </p>
        </div>

        {/* 스케줄 해제 버튼 */}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onUnschedule(task.id) }}
          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
        >
          <X size={10} />
        </button>

        {/* 리사이즈 핸들 */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
        />
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="font-medium">{task.title}</p>
        {task.scheduled_at && (
          <p className="text-xs text-muted-foreground">
            {fmtTime(task.scheduled_at)}
            {task.duration_minutes
              ? ` – ${fmtTime(buildIso(date, toMinutes(task.scheduled_at) + task.duration_minutes))}`
              : ''}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
