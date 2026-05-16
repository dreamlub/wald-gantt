'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayStrKST } from '@/lib/gantt-utils'
import type { GanttTask, TaskStatus } from '@/types'
import { STATUS_COLOR, STATUS_BG_COLOR } from '../_constants'
import { isOverdue } from '../_utils'

interface Props {
  tasks: GanttTask[]
  onEdit: (t: GanttTask) => void
  onStatusChange: (id: string, s: TaskStatus) => void
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export function CalendarView({ tasks, onEdit }: Props) {
  const [cur, setCur] = useState(() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() }
  })
  const todayKST = todayStrKST()
  const [cty, ctm, ctd] = todayKST.split('-').map(Number)

  const firstDay    = new Date(cur.year, cur.month, 1).getDay()
  const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const rows = Math.ceil(cells.length / 7)

  function toKey(d: number) {
    return `${cur.year}-${String(cur.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function tasksForDay(key: string) {
    return tasks.filter(t => t.due_date && t.due_date.startsWith(key))
  }

  function goPrev() {
    setCur(c => {
      const d = new Date(c.year, c.month - 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  function goNext() {
    setCur(c => {
      const d = new Date(c.year, c.month + 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  function goToday() {
    setCur({ year: cty, month: ctm - 1 })
  }

  const isThisMonth = cty === cur.year && (ctm - 1) === cur.month

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">

      {/* 헤더 */}
      <div className="h-12 flex items-center justify-between px-5 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={goPrev} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs font-semibold text-foreground w-24 text-center tabular-nums">
            {cur.year}년 {cur.month + 1}월
          </span>
          <button onClick={goNext} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ChevronRight size={15} />
          </button>
        </div>

        {!isThisMonth && (
          <button
            onClick={goToday}
            className="text-[11px] px-2.5 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors font-medium"
          >
            오늘
          </button>
        )}
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b bg-muted/50 shrink-0">
        {DOW_LABELS.map((d, i) => (
          <div
            key={d}
            className={`py-2 text-center text-[11px] font-semibold tracking-wide
              ${i === 0 ? 'text-status-late/80' : i === 6 ? 'text-lilac-400' : 'text-ink-400'}`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="grid grid-cols-7"
          style={{ gridAutoRows: `minmax(${rows <= 5 ? 100 : 84}px, 1fr)` }}
        >
          {cells.map((d, i) => {
            const dow    = i % 7
            const isLast = i >= cells.length - 7
            const isLastCol = dow === 6

            if (!d) return (
              <div
                key={i}
                className={`bg-muted/20 ${!isLast ? 'border-b' : ''} ${!isLastCol ? 'border-r' : ''} border-border`}
              />
            )

            const key     = toKey(d)
            const isToday = isThisMonth && ctd === d
            const dayTasks = tasksForDay(key)

            return (
              <div
                key={i}
                className={`flex flex-col min-h-0 ${!isLast ? 'border-b' : ''} ${!isLastCol ? 'border-r' : ''} border-border transition-colors
                  ${isToday ? 'bg-lilac-50/60 dark:bg-lilac-500/5' : 'bg-card hover:bg-muted/30'}`}
              >
                {/* 날짜 숫자 */}
                <div className="flex items-center justify-end px-2 pt-1.5 pb-1 shrink-0">
                  <span className={`text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full
                    ${isToday
                      ? 'bg-lilac-500 text-white font-semibold'
                      : dow === 0 ? 'text-status-late'
                      : dow === 6 ? 'text-lilac-400'
                      : 'text-ink-500'
                    }`}>
                    {d}
                  </span>
                </div>

                {/* 태스크 칩 */}
                <div className="flex flex-col gap-0.5 px-1 pb-1 overflow-hidden">
                  {dayTasks.slice(0, 3).map(task => {
                    const isDone      = task.status === 'done'
                    const overdue     = isOverdue(task.due_date, task.status)
                    const stripeColor = overdue ? 'var(--color-status-late)' : STATUS_COLOR[task.status]
                    const filledBg    = overdue ? 'var(--task-status-overdue-bg)' : STATUS_BG_COLOR[task.status]
                    return (
                      <button
                        key={task.id}
                        onClick={() => onEdit(task)}
                        title={task.title}
                        className={`flex items-center gap-1 text-left text-[10px] px-1.5 py-[3px] rounded truncate w-full
                          border-l-2 hover:brightness-95 transition-all ${isDone ? 'opacity-50' : ''}`}
                        style={{ backgroundColor: filledBg, borderLeftColor: stripeColor }}
                      >
                        <span className={`truncate flex-1 leading-tight ${
                          isDone           ? 'line-through text-ink-400' :
                          task.priority === 3 ? 'font-semibold text-rose-500' :
                          task.priority === 2 ? 'font-medium text-foreground' :
                          task.priority === 1 ? 'text-ink-600' :
                          'text-muted-foreground'
                        }`}>
                          {task.title}
                        </span>
                        {task.memo && <span className="w-1 h-1 rounded-full bg-lilac-400 shrink-0 opacity-70" />}
                      </button>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <span className="text-[9px] text-ink-400 px-1.5 py-0.5">+{dayTasks.length - 3}개 더</span>
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
