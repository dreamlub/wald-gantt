'use client'

import { useRef, useCallback, useState } from 'react'
import type { CalendarEvent, GanttTask } from '@/types'
import { TaskBlock } from './task-block'
import { EventBlock } from './event-block'

const HOUR_H   = 60
const START_H  = 7
const END_H    = 23
const TOTAL_H  = END_H - START_H
const SNAP_MIN = 15

function toMinutes(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function snapToGrid(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN
}

function minutesToPx(minutes: number): number {
  return (minutes / 60) * HOUR_H
}

function pxToMinutes(px: number): number {
  return (px / HOUR_H) * 60
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

interface Props {
  date: string
  events: CalendarEvent[]
  tasks: GanttTask[]
  onDrop: (taskId: string, scheduledAt: string, durationMinutes: number) => void
  onMove: (taskId: string, scheduledAt: string) => void
  onResize: (taskId: string, durationMinutes: number) => void
  onUnschedule: (taskId: string) => void
  onTaskClick: (task: GanttTask) => void
}

export function TimeGrid({ date, events, tasks, onDrop, onMove, onResize, onUnschedule, onTaskClick }: Props) {
  const gridRef      = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const getMinutesFromY = useCallback((clientY: number): number => {
    if (!gridRef.current) return START_H * 60
    const rect   = gridRef.current.getBoundingClientRect()
    const relY   = clientY - rect.top
    const rawMin = pxToMinutes(relY) + START_H * 60
    return clamp(snapToGrid(rawMin), START_H * 60, END_H * 60 - SNAP_MIN)
  }, [])

  const buildIso = useCallback((totalMinutes: number): string => {
    const [y, mo, d] = date.split('-').map(Number)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return new Date(y, mo - 1, d, h, m).toISOString()
  }, [date])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // 자식 요소로 이동할 때는 무시
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const taskId  = e.dataTransfer.getData('taskId')
    const offsetY = Number(e.dataTransfer.getData('offsetY') || '0')
    if (!taskId) return
    const minutes = getMinutesFromY(e.clientY - offsetY)
    onDrop(taskId, buildIso(minutes), 60)
  }

  const hours = Array.from({ length: TOTAL_H + 1 }, (_, i) => START_H + i)

  const now    = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const isToday = date === now.toISOString().slice(0, 10)
  const nowTop  = minutesToPx(nowMin - START_H * 60)

  return (
    <div
      className={`relative w-full transition-colors ${dragOver ? 'bg-lilac-100/30' : ''}`}
      style={{ height: TOTAL_H * HOUR_H }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div ref={gridRef} className="absolute inset-0">
        {/* 시간 레이블 + 가이드 라인 */}
        {hours.map(h => (
          <div
            key={h}
            className="absolute left-0 right-0 flex items-start"
            style={{ top: minutesToPx((h - START_H) * 60) }}
          >
            <span className="w-12 shrink-0 text-right pr-3 text-[10px] text-ink-400 leading-none -mt-[6px] select-none">
              {h === START_H ? '' : `${String(h).padStart(2, '0')}:00`}
            </span>
            <div className="flex-1 border-t border-border" />
          </div>
        ))}

        {/* 30분 점선 */}
        {hours.slice(0, -1).map(h => (
          <div
            key={`${h}-30`}
            className="absolute left-12 right-0 border-t border-dashed border-border/40"
            style={{ top: minutesToPx((h - START_H) * 60 + 30) }}
          />
        ))}

        {/* 현재 시각 */}
        {isToday && nowMin >= START_H * 60 && nowMin <= END_H * 60 && (
          <div
            className="absolute left-12 right-0 flex items-center pointer-events-none z-20"
            style={{ top: nowTop }}
          >
            <div className="w-2 h-2 rounded-full bg-status-late -ml-1 shrink-0" />
            <div className="flex-1 border-t border-status-late" />
          </div>
        )}

        {/* Google Calendar 이벤트 */}
        {events.filter(e => !e.isAllDay).map(event => {
          const startMin = toMinutes(event.start)
          const endMin   = toMinutes(event.end)
          const top      = minutesToPx(startMin - START_H * 60)
          const height   = Math.max(minutesToPx(endMin - startMin), 20)
          return (
            <EventBlock key={event.id} event={event} top={top} height={height} />
          )
        })}

        {/* Task 블록 */}
        {tasks.map(task => {
          if (!task.scheduled_at) return null
          const startMin = toMinutes(task.scheduled_at)
          const dur      = task.duration_minutes ?? 60
          const top      = minutesToPx(startMin - START_H * 60)
          const height   = Math.max(minutesToPx(dur), 20)
          return (
            <TaskBlock
              key={task.id}
              task={task}
              top={top}
              height={height}
              gridRef={gridRef}
              getMinutesFromY={getMinutesFromY}
              date={date}
              onMove={onMove}
              onResize={onResize}
              onUnschedule={onUnschedule}
              onClick={() => onTaskClick(task)}
            />
          )
        })}

        {/* 드래그 중 힌트 */}
        {dragOver && (
          <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
            <span className="text-[11px] text-lilac-400 bg-background/80 px-3 py-1.5 rounded-full border border-lilac-200">
              여기에 놓으면 블록 생성
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
