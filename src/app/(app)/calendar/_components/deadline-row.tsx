'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'
import type { GanttTask } from '@/types'
import { STATUS_COLOR, STATUS_BG_COLOR } from '@/app/(app)/tasks/_constants'
import { isOverdue } from '@/app/(app)/tasks/_utils'
import { DEADLINE_ROW_H, STICKY_DEADLINE_TOP } from '../_constants'
import { fmtDate } from '../_utils'

interface Props {
  weekDates: string[]
  tasks: GanttTask[]
  onTaskClick: (task: GanttTask) => void
}

const MAX_VISIBLE = 2

function Chip({ task, onClick }: { task: GanttTask; onClick: () => void }) {
  const isDone  = task.status === 'done'
  const overdue = isOverdue(task.due_date, task.status)
  const stripe  = overdue ? 'var(--color-status-late)' : STATUS_COLOR[task.status]
  const bg      = overdue ? 'var(--task-status-overdue-bg)' : STATUS_BG_COLOR[task.status]
  return (
    <button
      onClick={onClick}
      title={task.title}
      className={`flex items-center gap-1 text-left text-2xs font-medium px-1.5 py-0.5 rounded truncate w-full border-l-2 hover:brightness-95 transition-all ${isDone ? 'opacity-50' : ''}`}
      style={{ backgroundColor: bg, borderLeftColor: stripe }}
    >
      {task.scheduled_at && <Clock size={8} className="shrink-0 text-ink-400" />}
      <span className={`truncate flex-1 leading-tight ${isDone ? 'line-through text-ink-400' : 'text-foreground'}`}>
        {task.title}
      </span>
    </button>
  )
}

export function DeadlineRow({ weekDates, tasks, onTaskClick }: Props) {
  const [overflow, setOverflow] = useState<{ date: string; x: number; y: number } | null>(null)

  const tasksForDay = (date: string) =>
    tasks.filter(t => t.due_date === date && !t.deleted_at)

  return (
    <div
      className="sticky z-30 flex border-b bg-card"
      style={{ top: STICKY_DEADLINE_TOP, height: DEADLINE_ROW_H }}
    >
      {/* 라벨 거터 */}
      <div className="w-12 shrink-0 flex items-start justify-end pt-1.5 pr-2">
        <span className="text-xs text-ink-400 whitespace-nowrap">마감</span>
      </div>

      {/* 요일 컬럼 */}
      {weekDates.map(date => {
        const dayTasks = tasksForDay(date)
        return (
          <div
            key={date}
            className="flex-1 min-w-0 border-l border-border px-1 py-1 flex flex-col gap-0.5 overflow-hidden"
          >
            {dayTasks.slice(0, MAX_VISIBLE).map(task => (
              <Chip key={task.id} task={task} onClick={() => onTaskClick(task)} />
            ))}
            {dayTasks.length > MAX_VISIBLE && (
              <button
                onClick={e => { e.stopPropagation(); setOverflow({ date, x: e.clientX, y: e.clientY }) }}
                className="text-4xs text-ink-400 hover:text-foreground px-1.5 text-left hover:bg-muted rounded transition-colors"
              >
                +{dayTasks.length - MAX_VISIBLE}개 더
              </button>
            )}
          </div>
        )
      })}

      {/* 오버플로우 팝오버 — sticky 스택 컨텍스트를 벗어나도록 body에 portal */}
      {overflow && createPortal((() => {
        const popTasks = tasksForDay(overflow.date)
        const left = Math.min(overflow.x, window.innerWidth - 220)
        const top  = overflow.y + 8 + (window.innerHeight - overflow.y < 260 ? -260 : 0)
        return (
          <>
            <div className="fixed inset-0" style={{ zIndex: 'var(--z-overlay)' }} onClick={() => setOverflow(null)} />
            <div
              className="fixed w-52 bg-card border border-border rounded-xl shadow-lg py-2 overflow-hidden"
              style={{ left, top, zIndex: 'var(--z-dialog)' }}
            >
              <div className="flex items-center justify-between px-3 pb-1.5 border-b border-border mb-1">
                <span className="text-sm font-semibold text-foreground">{fmtDate(overflow.date)} 마감</span>
                <span className="text-sm text-muted-foreground">{popTasks.length}개</span>
              </div>
              <div className="flex flex-col gap-0.5 px-2 max-h-52 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {popTasks.map(task => (
                  <Chip key={task.id} task={task} onClick={() => { setOverflow(null); onTaskClick(task) }} />
                ))}
              </div>
            </div>
          </>
        )
      })(), document.body)}
    </div>
  )
}
