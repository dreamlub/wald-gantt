'use client'

import { useRef, useCallback, useState, useMemo } from 'react'
import type { CalendarEvent, GanttTask } from '@/types'
import { HOUR_H, START_H, END_H, TOTAL_H, SNAP_MIN, DRAG_OVER_BG } from '../_constants'
import {
  toMinutes, localDateStr, buildIso, snapToGrid, minutesToPx,
  pxToMinutes, clamp, calcLayout,
} from '../_utils'
import { TaskBlock } from './task-block'
import { EventBlock } from './event-block'
import { getActiveDragOffsetY } from './drag-state'

interface DayColumnProps {
  date: string
  isToday: boolean
  events: CalendarEvent[]
  tasks: GanttTask[]
  getMinutesFromY: (clientY: number) => number
  highlightTaskId?: string | null
  onHighlightClear?: () => void
  onDrop: (taskId: string, scheduledAt: string, durationMinutes: number) => void
  onMove: (taskId: string, scheduledAt: string) => void
  onResize: (taskId: string, durationMinutes: number) => void
  onUnschedule: (taskId: string) => void
  onStatusChange: (taskId: string, status: string) => void
  onTaskClick: (task: GanttTask) => void
}

function DayColumn({ date, isToday, events, tasks, getMinutesFromY, highlightTaskId, onHighlightClear, onDrop, onMove, onResize, onUnschedule, onStatusChange, onTaskClick }: DayColumnProps) {
  const [dragOver, setDragOver]       = useState(false)
  const [snapMinutes, setSnapMinutes] = useState<number | null>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
    setSnapMinutes(getMinutesFromY(e.clientY - getActiveDragOffsetY()))
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
    setSnapMinutes(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    setSnapMinutes(null)
    const taskId  = e.dataTransfer.getData('taskId')
    const offsetY = Number(e.dataTransfer.getData('offsetY') || '0')
    const source  = e.dataTransfer.getData('source')
    if (!taskId) return
    const minutes = getMinutesFromY(e.clientY - offsetY)
    const iso = buildIso(date, minutes)
    if (source === 'grid') {
      onMove(taskId, iso)
    } else {
      onDrop(taskId, iso, 30)
    }
  }

  const hours = Array.from({ length: TOTAL_H }, (_, i) => START_H + i)

  const layoutData = useMemo(() => {
    const timedEvents    = events.filter(e => !e.isAllDay)
    const scheduledTasks = tasks.filter(t => !!t.scheduled_at)

    const allBlocks = [
      ...timedEvents.map(e => ({ startMin: toMinutes(e.start), endMin: toMinutes(e.end) })),
      ...scheduledTasks.map(t => ({ startMin: toMinutes(t.scheduled_at!), endMin: toMinutes(t.scheduled_at!) + (t.duration_minutes ?? 30) })),
    ]

    const layout      = calcLayout(allBlocks)
    const eventLayout = layout.slice(0, timedEvents.length)
    const taskLayout  = layout.slice(timedEvents.length)

    const eventBlocks = timedEvents.map((event, i) => {
      const startMin = toMinutes(event.start)
      const endMin   = toMinutes(event.end)
      return {
        event,
        top:    minutesToPx(startMin - START_H * 60),
        height: Math.max(minutesToPx(endMin - startMin), 20),
        ...eventLayout[i],
      }
    })

    const taskBlocks = scheduledTasks.map((task, i) => {
      const startMin = toMinutes(task.scheduled_at!)
      const dur      = task.duration_minutes ?? 30
      return {
        task,
        top:    minutesToPx(startMin - START_H * 60),
        height: Math.max(minutesToPx(dur), 20),
        ...taskLayout[i],
      }
    })

    return { eventBlocks, taskBlocks }
  }, [events, tasks])

  return (
    <div
      className={`flex-1 relative border-l border-border transition-colors ${dragOver ? DRAG_OVER_BG : ''}`}
      style={{ height: TOTAL_H * HOUR_H }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 시간 가이드 라인 */}
      {hours.map(h => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-border"
          style={{ top: minutesToPx((h - START_H) * 60) }}
        />
      ))}
      {/* 30분 점선 */}
      {hours.map(h => (
        <div
          key={`${h}-30`}
          className="absolute left-0 right-0 border-t border-dashed border-border/40"
          style={{ top: minutesToPx((h - START_H) * 60 + 30) }}
        />
      ))}

      {/* 현재 시각 라인 (오늘 컬럼에만) */}
      {(() => {
        if (!isToday) return null
        const now = new Date()
        const nowMin = now.getHours() * 60 + now.getMinutes()
        if (nowMin < START_H * 60 || nowMin > END_H * 60) return null
        const nowTop = minutesToPx(nowMin - START_H * 60)
        return (
          <div
            className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
            style={{ top: nowTop }}
          >
            <div className="w-2 h-2 rounded-full bg-status-late -ml-1 shrink-0" />
            <div className="flex-1 border-t-2 border-status-late" />
          </div>
        )
      })()}

      {/* 드래그 스냅 가이드라인 */}
      {dragOver && snapMinutes !== null && (
        <div
          className="absolute left-0 right-0 flex items-center pointer-events-none z-30"
          style={{ top: minutesToPx(snapMinutes - START_H * 60) }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-lilac-500 -ml-0.5 shrink-0" />
          <div className="flex-1 border-t-2 border-lilac-400 border-dashed" />
          <span className="text-3xs text-lilac-500 font-medium pr-1 shrink-0 bg-white/80 rounded px-0.5">
            {String(Math.floor(snapMinutes / 60)).padStart(2, '0')}:{String(snapMinutes % 60).padStart(2, '0')}
          </span>
        </div>
      )}

      {/* 겹침 레이아웃 계산 (메모이제이션) */}
      {layoutData.eventBlocks.map(({ event, top, height, colIndex, totalCols }) => (
        <EventBlock
          key={event.id}
          event={event}
          top={top}
          height={height}
          colIndex={colIndex}
          totalCols={totalCols}
        />
      ))}

      {layoutData.taskBlocks.map(({ task, top, height, colIndex, totalCols }) => (
        <TaskBlock
          key={task.id}
          task={task}
          top={top}
          height={height}
          colIndex={colIndex}
          totalCols={totalCols}
          highlight={highlightTaskId === task.id}
          onHighlightClear={onHighlightClear}
          date={date}
          onResize={onResize}
          onUnschedule={onUnschedule}
          onStatusChange={onStatusChange}
          onClick={() => onTaskClick(task)}
        />
      ))}
    </div>
  )
}

interface Props {
  dates: string[]
  events: CalendarEvent[]
  tasks: GanttTask[]
  highlightTaskId?: string | null
  onHighlightClear?: () => void
  onDrop: (taskId: string, scheduledAt: string, durationMinutes: number) => void
  onMove: (taskId: string, scheduledAt: string) => void
  onResize: (taskId: string, durationMinutes: number) => void
  onUnschedule: (taskId: string) => void
  onStatusChange: (taskId: string, status: string) => void
  onTaskClick: (task: GanttTask) => void
}

export function TimeGrid({ dates, events, tasks, highlightTaskId, onHighlightClear, onDrop, onMove, onResize, onUnschedule, onStatusChange, onTaskClick }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)

  const getMinutesFromY = useCallback((clientY: number): number => {
    if (!gridRef.current) return START_H * 60
    const rect   = gridRef.current.getBoundingClientRect()
    const relY   = clientY - rect.top
    const rawMin = pxToMinutes(relY) + START_H * 60
    return clamp(snapToGrid(rawMin), START_H * 60, END_H * 60 - SNAP_MIN)
  }, [])

  const hours = Array.from({ length: TOTAL_H + 1 }, (_, i) => START_H + i)
  const today = localDateStr(new Date().toISOString())


  return (
    <div ref={gridRef} className="relative flex w-full">
      {/* 시간 레이블 */}
      <div className="w-12 shrink-0 relative" style={{ height: TOTAL_H * HOUR_H }}>
        {hours.map(h => (
          <div
            key={h}
            className="absolute right-0 pr-2 text-3xs text-ink-400 leading-none select-none text-right"
            style={{ top: minutesToPx((h - START_H) * 60) - 6 }}
          >
            {h === START_H ? '' : `${String(h).padStart(2, '0')}:00`}
          </div>
        ))}
      </div>

      {/* 요일 컬럼 */}
      {dates.map(date => (
        <DayColumn
          key={date}
          date={date}
          isToday={date === today}
          events={events.filter(e => localDateStr(e.start) === date)}
          tasks={tasks.filter(t => !!t.scheduled_at && localDateStr(t.scheduled_at) === date)}
          getMinutesFromY={getMinutesFromY}
          highlightTaskId={highlightTaskId}
          onHighlightClear={onHighlightClear}
          onDrop={onDrop}
          onMove={onMove}
          onResize={onResize}
          onUnschedule={onUnschedule}
          onStatusChange={onStatusChange}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  )
}
