'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateTask } from '@/lib/task-service'
import type { GanttTask } from '@/types'
import { STATUS_COLOR } from './tasks/_constants'
import { toShortDate } from '@/lib/date-utils'

type Tone = 'late' | 'today' | 'soon' | 'week'

const TONE_LABEL: Record<Tone, string> = {
  late: '지연', today: '오늘', soon: '내일', week: '이번 주',
}
const TONE_COLOR: Record<Tone, string> = {
  late:  'text-status-late',
  today: 'text-lilac-600',
  soon:  'text-ink-500',
  week:  'text-ink-400',
}

interface Props {
  overdueTasks: GanttTask[]
  dueToday:     GanttTask[]
  dueTomorrow:  GanttTask[]
  dueRestWeek:  GanttTask[]
  today: string
}

export function TodayTasksPanel({ overdueTasks, dueToday, dueTomorrow, dueRestWeek, today }: Props) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  const handleComplete = useCallback(async (id: string) => {
    setDoneIds(prev => new Set([...prev, id]))
    try {
      await updateTask(id, { status: 'done' })
    } catch {
      setDoneIds(prev => { const n = new Set(prev); n.delete(id); return n })
      toast.error('완료 처리에 실패했습니다')
    }
  }, [])

  const vis = (tasks: GanttTask[]) => tasks.filter(t => !doneIds.has(t.id))

  const sections = [
    { tone: 'late'  as Tone, tasks: vis(overdueTasks) },
    { tone: 'today' as Tone, tasks: vis(dueToday) },
    { tone: 'soon'  as Tone, tasks: vis(dueTomorrow) },
    { tone: 'week'  as Tone, tasks: vis(dueRestWeek) },
  ].filter(s => s.tasks.length > 0)

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="h-10 flex items-center gap-2 px-4 border-b bg-muted">
        <h2 className="text-sm font-semibold text-foreground">내 실행 큐</h2>
        <Link href="/tasks" className="ml-auto inline-flex items-center gap-1 text-sm text-ink-400 hover:text-foreground transition-colors">
          열기 <ArrowRight size={11} />
        </Link>
      </div>
      <div className="p-4">
        {sections.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-sm text-ink-400">
            오늘 처리할 태스크가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map(({ tone, tasks }) => (
              <div key={tone}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`text-xs font-semibold ${TONE_COLOR[tone]}`}>{TONE_LABEL[tone]}</span>
                  <span className="text-xs text-ink-300">{tasks.length}</span>
                </div>
                <div className="space-y-1">
                  {tasks.map(task => (
                    <TaskRow key={task.id} task={task} today={today} tone={tone} onComplete={handleComplete} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function TaskRow({ task, today, tone, onComplete }: {
  task: GanttTask
  today: string
  tone: Tone
  onComplete: (id: string) => void
}) {
  const href = task.scheduled_at
    ? `/calendar?date=${task.scheduled_at.slice(0, 10)}&highlight=${task.id}`
    : tone === 'late'  ? '/tasks?quick=overdue'
    : tone === 'today' ? '/tasks?quick=due-today'
    : '/tasks?quick=due-this-week'

  const dueLabel = !task.due_date ? null
    : tone === 'late'  ? `${Math.round((new Date(today + 'T00:00:00').getTime() - new Date(task.due_date + 'T00:00:00').getTime()) / 86_400_000)}일 지연`
    : tone === 'today' ? '오늘'
    : tone === 'soon'  ? '내일'
    : toShortDate(task.due_date)

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 group hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <button
        onClick={() => onComplete(task.id)}
        title="완료"
        className="shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center hover:bg-muted transition-colors"
        style={{ borderColor: STATUS_COLOR[task.status] }}
      >
        <Check size={8} className="opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: STATUS_COLOR[task.status] }} />
      </button>
      <Link href={href} className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
        {task.type === 'delegated' && task.assignee && (
          <span className="text-xs text-ink-300 shrink-0 hidden xl:block">{task.assignee}</span>
        )}
      </Link>
      {dueLabel && (
        <span className={`text-xs shrink-0 tabular-nums ${tone === 'late' ? 'text-status-late font-semibold' : 'text-ink-400'}`}>
          {dueLabel}
        </span>
      )}
    </div>
  )
}
