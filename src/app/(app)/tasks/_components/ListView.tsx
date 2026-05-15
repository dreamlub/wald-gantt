'use client'

import { useState } from 'react'
import { Circle, CheckCircle2, Pencil, Trash2 } from 'lucide-react'
import type { GanttTask, TaskStatus } from '@/types'
import { fmtDate, isOverdue, overdueDays } from '../_utils'
import { STATUS_COLOR, STATUS_LABEL, PriorityBars } from '../_constants'

export type SortKey = 'title' | 'status' | 'priority' | 'assignee' | 'due_date' | 'start_date' | 'created_at' | 'updated_at'

const STATUS_ORDER: Record<TaskStatus, number> = { backlog: 0, 'to-do': 1, 'in-progress': 2, done: 3, pending: 4 }

interface Props {
  tasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
}

export function ListView({ tasks, assigneeColorMap, getAssigneeKey, onEdit, onDelete, onStatusChange }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('due_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = [...tasks].sort((a, b) => {
    let va: string | number = 0, vb: string | number = 0
    if (sortKey === 'status') { va = STATUS_ORDER[a.status]; vb = STATUS_ORDER[b.status] }
    else if (sortKey === 'priority') { va = a.priority ?? 0; vb = b.priority ?? 0 }
    else if (sortKey === 'assignee') {
      va = a.type === 'mine' ? '내 할일' : (a.assignee ?? '')
      vb = b.type === 'mine' ? '내 할일' : (b.assignee ?? '')
    }
    else { va = (a[sortKey] as string) ?? ''; vb = (b[sortKey] as string) ?? '' }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  function SortBtn({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col
    return (
      <button
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider hover:text-gray-600 transition-colors
          ${active ? 'text-indigo-600' : 'text-gray-400'}`}
      >
        {label}
        {active && <span className="text-[8px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-center px-4 py-2 border-b bg-gray-50 shrink-0 sticky top-0 z-10">
        <div className="w-6 shrink-0 mr-2" />
        <div className="flex-1 mr-4"><SortBtn col="title" label="태스크" /></div>
        <div className="w-16 shrink-0"><SortBtn col="priority" label="우선순위" /></div>
        <div className="w-24 shrink-0"><SortBtn col="status" label="상태" /></div>
        <div className="w-28 shrink-0"><SortBtn col="assignee" label="담당자" /></div>
        <div className="w-14 shrink-0"><SortBtn col="start_date" label="시작일" /></div>
        <div className="w-14 shrink-0"><SortBtn col="due_date" label="마감일" /></div>
        <div className="w-14 shrink-0"><SortBtn col="created_at" label="지시일" /></div>
        <div className="w-12 shrink-0" />
      </div>

      {sorted.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-xs">태스크가 없어요</div>
      ) : sorted.map(task => {
        const overdue = isOverdue(task.due_date, task.status)
        const isDone  = task.status === 'done'
        const color   = assigneeColorMap.get(getAssigneeKey(task)) ?? '#9ca3af'
        const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')
        return (
          <div
            key={task.id}
            className={`group flex items-center px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isDone ? 'opacity-55' : ''}`}
          >
            <div className="w-6 shrink-0 mr-2">
              <button onClick={() => onStatusChange(task.id, task.status === 'done' ? 'to-do' : 'done')}>
                {isDone
                  ? <CheckCircle2 size={16} className="text-green-400" />
                  : <Circle size={16} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-4 overflow-hidden">
              <span className={`text-xs truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</span>
              {overdue && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium border border-red-100 whitespace-nowrap">
                  지연 {overdueDays(task.due_date)}일
                </span>
              )}
            </div>
            <div className="w-16 shrink-0">
              <PriorityBars priority={task.priority} showLabel />
            </div>
            <div className="w-24 shrink-0">
              <span
                className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: STATUS_COLOR[task.status] + '20', color: STATUS_COLOR[task.status] }}
              >
                {STATUS_LABEL[task.status]}
              </span>
            </div>
            <div className="w-28 shrink-0 flex items-center gap-1.5">
              {assigneeName && (
                <>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[11px] text-gray-500 truncate">{assigneeName}</span>
                </>
              )}
            </div>
            <div className="w-14 shrink-0 text-[11px] text-gray-400 tabular-nums">{fmtDate(task.start_date ?? null)}</div>
            <div className={`w-14 shrink-0 text-[11px] tabular-nums font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>{fmtDate(task.due_date)}</div>
            <div className="w-14 shrink-0 text-[10px] text-gray-300 tabular-nums">{fmtDate(task.created_at)}</div>
            <div className="w-12 shrink-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(task)} className="p-1 text-gray-300 hover:text-indigo-500 rounded"><Pencil size={11} /></button>
              <button onClick={() => onDelete(task.id)} className="p-1 text-gray-300 hover:text-red-400 rounded"><Trash2 size={11} /></button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
