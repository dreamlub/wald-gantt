'use client'

import { useState } from 'react'
import { todayStrKST } from '@/lib/gantt-utils'
import type { GanttTask, TaskStatus } from '@/types'
import { STATUS_COLOR, STATUS_BG_COLOR } from '../_constants'
import { isOverdue } from '../_utils'

interface Props {
  tasks: GanttTask[]
  onEdit: (t: GanttTask) => void
  onStatusChange: (id: string, s: TaskStatus) => void
}

export function CalendarView({ tasks, onEdit }: Props) {
  const [cur, setCur] = useState(() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() }
  })
  const todayKST = todayStrKST()
  const [cty, ctm, ctd] = todayKST.split('-').map(Number)
  const firstDay = new Date(cur.year, cur.month, 1).getDay()
  const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length < 42) cells.push(null)

  function toKey(d: number) {
    return `${cur.year}-${String(cur.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function tasksForDay(key: string) {
    return tasks.filter(t => t.due_date && t.due_date.startsWith(key))
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
        <span className="text-sm font-semibold text-ink-700">{cur.year}년 {cur.month + 1}월</span>
        <div className="flex gap-2">
          <button
            onClick={() => setCur(c => { const d = new Date(c.year, c.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            className="px-2 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground"
          >‹ 이전</button>
          <button
            onClick={() => setCur({ year: cty, month: ctm - 1 })}
            className="px-2 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground"
          >오늘</button>
          <button
            onClick={() => setCur(c => { const d = new Date(c.year, c.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            className="px-2 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground"
          >다음 ›</button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b bg-muted shrink-0">
        {['일','월','화','수','목','금','토'].map((d, i) => (
          <div key={d} className={`py-1.5 text-center text-[11px] font-semibold ${i === 0 ? 'text-status-late' : i === 6 ? 'text-status-future' : 'text-muted-foreground'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7 h-full" style={{ gridAutoRows: 'minmax(80px, 1fr)' }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="border-b border-r bg-muted/50" />
            const key = toKey(d)
            const isToday = cty === cur.year && (ctm - 1) === cur.month && ctd === d
            const dayTasks = tasksForDay(key)
            const dow = i % 7
            return (
              <div
                key={i}
                className={`border-b border-r p-1 flex flex-col min-h-0 ${isToday ? 'bg-accent/30' : 'bg-card hover:bg-muted/50'} transition-colors`}
              >
                <span className={`text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full mb-0.5 self-end
                  ${isToday ? 'bg-accent-foreground text-white' : dow === 0 ? 'text-status-late' : dow === 6 ? 'text-status-future' : 'text-muted-foreground'}`}>
                  {d}
                </span>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayTasks.slice(0, 3).map(task => {
                    const isDone       = task.status === 'done'
                    const overdue      = isOverdue(task.due_date, task.status)
                    const stripeColor  = overdue ? 'var(--color-status-late)' : STATUS_COLOR[task.status]
                    const filledBg     = overdue ? 'var(--task-status-overdue-bg)' : STATUS_BG_COLOR[task.status]
                    return (
                      <button
                        key={task.id}
                        onClick={() => onEdit(task)}
                        className={`flex items-center gap-1 text-left text-[10px] px-1.5 py-0.5 rounded-r truncate transition-opacity hover:opacity-80 border-l-[3px] ${isDone ? 'opacity-55' : ''}`}
                        style={{ backgroundColor: filledBg, borderLeftColor: stripeColor }}
                        title={task.title}
                      >
                        <span className={`truncate flex-1 ${
                          isDone ? 'line-through font-medium text-ink-400' :
                          task.priority === 3 ? 'font-semibold text-rose-500' :
                          task.priority === 2 ? 'font-medium text-foreground' :
                          task.priority === 1 ? 'font-normal text-ink-700' :
                          'font-normal text-muted-foreground'
                        }`}>
                          {task.title}
                        </span>
                        {task.memo && <span className="w-1 h-1 rounded-full bg-lilac-400 shrink-0" />}
                      </button>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <span className="text-[9px] text-ink-400 px-1">+{dayTasks.length - 3}개 더</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
