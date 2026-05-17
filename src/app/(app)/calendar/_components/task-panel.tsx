'use client'

import { useState } from 'react'
import { Search, PanelLeftClose, Check, GripVertical } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { GanttTask } from '@/types'

const STATUS_COLOR: Record<string, string> = {
  'backlog':     'var(--task-status-backlog)',
  'to-do':       'var(--task-status-todo)',
  'in-progress': 'var(--task-status-in-progress)',
  'done':        'var(--task-status-done)',
  'pending':     'var(--task-status-pending)',
}

const STATUS_LABEL: Record<string, string> = {
  'backlog':     'Backlog',
  'to-do':       'To-Do',
  'in-progress': 'In Progress',
  'done':        'Done',
  'pending':     'Pending',
}

const STATUS_ORDER: Record<string, number> = {
  'in-progress': 0,
  'to-do':       1,
  'pending':     2,
  'backlog':     3,
  'done':        4,
}

type SortKey = 'deadline' | 'priority' | 'status'

const SORT_LABELS: Record<SortKey, string> = {
  deadline: '마감일',
  priority: '중요도',
  status:   '진행상황',
}

const SORT_CYCLE: SortKey[] = ['deadline', 'priority', 'status']

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  try { return format(parseISO(d), 'M/d') } catch { return '' }
}

interface Props {
  tasks: GanttTask[]
  onClose?: () => void
  onStatusChange?: (taskId: string, status: string) => void
  onTaskClick?: (task: GanttTask) => void
}

export function TaskPanel({ tasks, onClose, onStatusChange, onTaskClick }: Props) {
  const [q, setQ]       = useState('')
  const [sort, setSort] = useState<SortKey>('deadline')
  // done 토글 시 직전 상태 기억
  const [prevStatusMap, setPrevStatusMap] = useState<Record<string, string>>({})

  const candidates = tasks.filter(t => !t.scheduled_at && !t.deleted_at)

  const ql = q.toLowerCase()
  const filtered = candidates.filter(t =>
    q === '' ||
    t.title.toLowerCase().includes(ql) ||
    (t.labels ?? []).some(l => l.toLowerCase().includes(ql))
  )

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'deadline') {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    }
    if (sort === 'priority') return (b.priority ?? 0) - (a.priority ?? 0)
    // 진행상황: in-progress → to-do → pending → backlog → done
    return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
  })

  const handleDragStart = (e: React.DragEvent, task: GanttTask) => {
    e.dataTransfer.setData('taskId', task.id)
    e.dataTransfer.setData('offsetY', '0')
    e.dataTransfer.setData('source', 'panel')
    e.dataTransfer.effectAllowed = 'move'
  }

  const cycleSort = () => {
    const idx = SORT_CYCLE.indexOf(sort)
    setSort(SORT_CYCLE[(idx + 1) % SORT_CYCLE.length])
  }

  const handleToggleDone = (e: React.MouseEvent, task: GanttTask) => {
    e.stopPropagation()
    if (task.status === 'done') {
      const prev = prevStatusMap[task.id] ?? 'to-do'
      onStatusChange?.(task.id, prev)
      setPrevStatusMap(m => { const n = { ...m }; delete n[task.id]; return n })
    } else {
      setPrevStatusMap(m => ({ ...m, [task.id]: task.status }))
      onStatusChange?.(task.id, 'done')
    }
  }

  const pendingCount = candidates.filter(t => t.status !== 'done').length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="h-12 flex items-center px-4 border-b bg-card shrink-0 gap-2">
        <h1 className="flex-1 text-xs font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">Calendar</h1>
        <button
          onClick={onClose}
          className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors"
          title="사이드바 닫기"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* 검색 */}
      <div className="shrink-0 px-2 pt-2 pb-1.5">
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="태스크 검색"
            className="w-full pl-5 pr-2 py-1 text-[11px] border border-border rounded bg-card text-muted-foreground placeholder:text-ink-300 focus:outline-none focus:border-lilac-300"
          />
        </div>
      </div>

      {/* 정렬 */}
      <div className="shrink-0 flex items-center justify-end px-3 py-1 border-b border-border">
        <button
          onClick={cycleSort}
          className="text-[10px] text-ink-400 hover:text-foreground transition-colors"
        >
          정렬: {SORT_LABELS[sort]}
        </button>
      </div>

      {/* 태스크 목록 */}
      <div className="flex-1 overflow-y-auto py-1">
        {sorted.length === 0 ? (
          <p className="text-[11px] text-ink-400 text-center py-10">
            {q ? '검색 결과 없음' : '미배치 태스크 없음'}
          </p>
        ) : (
          sorted.map(task => {
            const isDone  = task.status === 'done'
            const color   = STATUS_COLOR[task.status]
            return (
              <div
                key={task.id}
                draggable={!isDone}
                onDragStart={e => handleDragStart(e, task)}
                className={`flex items-center gap-1.5 mx-1 my-0.5 pr-2.5 py-1.5 rounded select-none transition-colors hover:bg-card ${
                  isDone ? 'opacity-50' : ''
                }`}
              >
                {/* 핸들 — 이 영역에서만 드래그 가능 */}
                <div
                  className={`shrink-0 px-1.5 py-2 text-ink-200 hover:text-ink-400 transition-colors ${
                    isDone ? 'invisible' : 'cursor-grab active:cursor-grabbing'
                  }`}
                >
                  <GripVertical size={12} />
                </div>

                {/* 체크 원 */}
                <button
                  onClick={e => handleToggleDone(e, task)}
                  onMouseDown={e => e.stopPropagation()}
                  className="shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors hover:opacity-80"
                  style={{
                    borderColor: color,
                    backgroundColor: isDone ? color : 'transparent',
                  }}
                  title={isDone ? '완료 취소' : '완료로 표시'}
                >
                  {isDone && <Check size={9} className="text-white stroke-[3]" />}
                </button>

                {/* 태스크명 — 클릭 시 드로어 */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => onTaskClick?.(task)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-[11px] leading-snug truncate flex-1 ${isDone ? 'line-through text-ink-400' : 'text-foreground'}`}>
                      {task.title}
                    </p>
                    {task.due_date && (
                      <span className="text-[10px] text-ink-400 shrink-0">{fmtDate(task.due_date)}</span>
                    )}
                  </div>
                  {!isDone && (
                    <span
                      className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full border"
                      style={{
                        color,
                        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
                        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
                      }}
                    >
                      {STATUS_LABEL[task.status]}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="shrink-0 px-3 py-2 border-t border-border">
        <p className="text-[10px] text-ink-400">{pendingCount}개 미배치</p>
      </div>
    </div>
  )
}
