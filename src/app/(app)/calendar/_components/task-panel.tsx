'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import type { GanttTask } from '@/types'

const STATUS_COLOR: Record<string, string> = {
  'backlog':     'var(--task-status-backlog)',
  'to-do':       'var(--task-status-todo)',
  'in-progress': 'var(--task-status-in-progress)',
  'done':        'var(--task-status-done)',
  'pending':     'var(--task-status-pending)',
}

interface Props {
  tasks: GanttTask[]
  hideHeader?: boolean
}

export function TaskPanel({ tasks, hideHeader }: Props) {
  const [q, setQ] = useState('')

  const unscheduled = tasks.filter(t =>
    !t.scheduled_at &&
    t.status !== 'done' &&
    (q === '' || t.title.toLowerCase().includes(q.toLowerCase()))
  )

  const handleDragStart = (e: React.DragEvent, task: GanttTask) => {
    e.dataTransfer.setData('taskId', task.id)
    e.dataTransfer.setData('offsetY', '0')
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 검색 */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        {!hideHeader && (
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Tasks</p>
        )}
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="검색..."
            className="w-full pl-6 pr-2 py-1 text-[11px] bg-background border border-border rounded outline-none focus:border-lilac-400"
          />
        </div>
      </div>

      {/* 태스크 목록 */}
      <div className="flex-1 overflow-y-auto py-1">
        {unscheduled.length === 0 ? (
          <p className="text-[11px] text-ink-400 text-center py-8">
            {q ? '검색 결과 없음' : '스케줄할 태스크 없음'}
          </p>
        ) : (
          unscheduled.map(task => (
            <div
              key={task.id}
              draggable
              onDragStart={e => handleDragStart(e, task)}
              className="flex items-start gap-1.5 mx-2 my-0.5 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing hover:bg-accent select-none"
            >
              <div
                className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLOR[task.status] }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-foreground leading-tight line-clamp-2">{task.title}</p>
                {task.due_date && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{task.due_date}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-ink-400">{unscheduled.length}개 미배치</p>
      </div>
    </div>
  )
}
