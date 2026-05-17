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

function localDateStr(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

interface LayoutItem { colIndex: number; totalCols: number }

function calcLayout(blocks: { startMin: number; endMin: number }[]): LayoutItem[] {
  const n = blocks.length
  if (n === 0) return []

  const sorted = blocks
    .map((b, i) => ({ ...b, origIdx: i }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  const cols: number[] = []       // cols[c] = endMin of last block in column c
  const assigned = new Array<number>(n)

  for (const b of sorted) {
    let col = cols.findIndex(end => end <= b.startMin)
    if (col === -1) col = cols.length
    cols[col] = b.endMin
    assigned[b.origIdx] = col
  }

  return blocks.map((b, i) => {
    let maxCol = assigned[i]
    for (let j = 0; j < n; j++) {
      if (i !== j && b.startMin < blocks[j].endMin && b.endMin > blocks[j].startMin) {
        maxCol = Math.max(maxCol, assigned[j])
      }
    }
    return { colIndex: assigned[i], totalCols: maxCol + 1 }
  })
}

function buildIso(date: string, totalMinutes: number): string {
  const [y, mo, d] = date.split('-').map(Number)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return new Date(y, mo - 1, d, h, m).toISOString()
}

interface DayColumnProps {
  date: string
  events: CalendarEvent[]
  tasks: GanttTask[]
  getMinutesFromY: (clientY: number) => number
  isToday: boolean
  onDrop: (taskId: string, scheduledAt: string, durationMinutes: number) => void
  onMove: (taskId: string, scheduledAt: string) => void
  onResize: (taskId: string, durationMinutes: number) => void
  onUnschedule: (taskId: string) => void
  onTaskClick: (task: GanttTask) => void
}

function DayColumn({ date, events, tasks, getMinutesFromY, isToday, onDrop, onMove, onResize, onUnschedule, onTaskClick }: DayColumnProps) {
  const [dragOver, setDragOver]       = useState(false)
  const [snapMinutes, setSnapMinutes] = useState<number | null>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
    const offsetY = Number(e.dataTransfer.getData('offsetY') || '0')
    setSnapMinutes(getMinutesFromY(e.clientY - offsetY))
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
      onDrop(taskId, iso, 60)
    }
  }

  const hours = Array.from({ length: TOTAL_H }, (_, i) => START_H + i)
  const now    = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowTop = minutesToPx(nowMin - START_H * 60)

  return (
    <div
      className={`flex-1 relative border-l border-border transition-colors ${dragOver ? 'bg-lilac-100/30' : ''}`}
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

      {/* 현재 시각 */}
      {isToday && nowMin >= START_H * 60 && nowMin <= END_H * 60 && (
        <div
          className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
          style={{ top: nowTop }}
        >
          <div className="w-2 h-2 rounded-full bg-status-late -ml-1 shrink-0" />
          <div className="flex-1 border-t border-status-late" />
        </div>
      )}

      {/* 드래그 스냅 가이드라인 */}
      {dragOver && snapMinutes !== null && (
        <div
          className="absolute left-0 right-0 flex items-center pointer-events-none z-30"
          style={{ top: minutesToPx(snapMinutes - START_H * 60) }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-lilac-500 -ml-0.5 shrink-0" />
          <div className="flex-1 border-t-2 border-lilac-400 border-dashed" />
          <span className="text-[9px] text-lilac-500 font-medium pr-1 shrink-0 bg-white/80 rounded px-0.5">
            {String(Math.floor(snapMinutes / 60)).padStart(2, '0')}:{String(snapMinutes % 60).padStart(2, '0')}
          </span>
        </div>
      )}

      {/* 겹침 레이아웃 계산 */}
      {(() => {
        const timedEvents = events.filter(e => !e.isAllDay)
        const scheduledTasks = tasks.filter(t => !!t.scheduled_at)

        const allBlocks = [
          ...timedEvents.map(e => ({
            startMin: toMinutes(e.start),
            endMin:   toMinutes(e.end),
          })),
          ...scheduledTasks.map(t => ({
            startMin: toMinutes(t.scheduled_at!),
            endMin:   toMinutes(t.scheduled_at!) + (t.duration_minutes ?? 60),
          })),
        ]

        const layout       = calcLayout(allBlocks)
        const eventLayout  = layout.slice(0, timedEvents.length)
        const taskLayout   = layout.slice(timedEvents.length)

        return (
          <>
            {timedEvents.map((event, i) => {
              const startMin = toMinutes(event.start)
              const endMin   = toMinutes(event.end)
              const top    = minutesToPx(startMin - START_H * 60)
              const height = Math.max(minutesToPx(endMin - startMin), 20)
              const { colIndex, totalCols } = eventLayout[i]
              return (
                <EventBlock
                  key={event.id}
                  event={event}
                  top={top}
                  height={height}
                  colIndex={colIndex}
                  totalCols={totalCols}
                />
              )
            })}

            {scheduledTasks.map((task, i) => {
              const startMin = toMinutes(task.scheduled_at!)
              const dur    = task.duration_minutes ?? 60
              const top    = minutesToPx(startMin - START_H * 60)
              const height = Math.max(minutesToPx(dur), 20)
              const { colIndex, totalCols } = taskLayout[i]
              return (
                <TaskBlock
                  key={task.id}
                  task={task}
                  top={top}
                  height={height}
                  colIndex={colIndex}
                  totalCols={totalCols}
                  getMinutesFromY={getMinutesFromY}
                  date={date}
                  onMove={onMove}
                  onResize={onResize}
                  onUnschedule={onUnschedule}
                  onClick={() => onTaskClick(task)}
                />
              )
            })}
          </>
        )
      })()}
    </div>
  )
}

interface Props {
  dates: string[]
  events: CalendarEvent[]
  tasks: GanttTask[]
  onDrop: (taskId: string, scheduledAt: string, durationMinutes: number) => void
  onMove: (taskId: string, scheduledAt: string) => void
  onResize: (taskId: string, durationMinutes: number) => void
  onUnschedule: (taskId: string) => void
  onTaskClick: (task: GanttTask) => void
}

export function TimeGrid({ dates, events, tasks, onDrop, onMove, onResize, onUnschedule, onTaskClick }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)

  const getMinutesFromY = useCallback((clientY: number): number => {
    if (!gridRef.current) return START_H * 60
    const rect   = gridRef.current.getBoundingClientRect()
    const relY   = clientY - rect.top
    const rawMin = pxToMinutes(relY) + START_H * 60
    return clamp(snapToGrid(rawMin), START_H * 60, END_H * 60 - SNAP_MIN)
  }, [])

  const hours = Array.from({ length: TOTAL_H + 1 }, (_, i) => START_H + i)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div ref={gridRef} className="flex w-full">
      {/* 시간 레이블 */}
      <div className="w-12 shrink-0 relative" style={{ height: TOTAL_H * HOUR_H }}>
        {hours.map(h => (
          <div
            key={h}
            className="absolute right-0 pr-2 text-[10px] text-ink-400 leading-none select-none text-right"
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
          events={events.filter(e => new Date(e.start).toISOString().slice(0, 10) === date)}
          tasks={tasks.filter(t => !!t.scheduled_at && localDateStr(t.scheduled_at) === date)}
          getMinutesFromY={getMinutesFromY}
          isToday={date === today}
          onDrop={onDrop}
          onMove={onMove}
          onResize={onResize}
          onUnschedule={onUnschedule}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  )
}
