'use client'

import { useState } from 'react'
import {
  Circle, CheckCircle2, GripVertical, Pencil, Trash2, Paperclip, MessageSquare,
} from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { GanttTask, TaskStatus } from '@/types'
import { fmtDate, relativeTime, isOverdue, overdueDays, daysDiff } from '../_utils'

interface TaskRowProps {
  task: GanttTask
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  dragHandleProps?: Record<string, unknown>
  isDragging?: boolean
  assigneeColor?: string
}

export function TaskRow({ task, onEdit, onDelete, onStatusChange, dragHandleProps, isDragging, assigneeColor }: TaskRowProps) {
  const [showMemo, setShowMemo] = useState(false)

  const overdue  = isOverdue(task.due_date, task.status)
  const isDone   = task.status === 'done'
  const noUpdate = daysDiff(task.updated_at) >= 7 && !isDone
  const odDays   = overdueDays(task.due_date)
  const color    = assigneeColor ?? '#9ca3af'
  const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')

  return (
    <div className={`group flex items-center px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isDone ? 'opacity-55' : ''} ${isDragging ? 'opacity-40' : ''}`}>
      <div className="shrink-0 mr-1 cursor-grab text-gray-200 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" {...(dragHandleProps ?? {})}>
        <GripVertical size={13} />
      </div>
      <button
        onClick={() => onStatusChange(task.id, task.status === 'done' ? 'to-do' : 'done')}
        className="shrink-0 mr-2"
        title={isDone ? '완료 취소' : '완료 처리'}
      >
        {isDone
          ? <CheckCircle2 size={16} className="text-green-400" />
          : <Circle size={16} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
      </button>
      <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-4 overflow-hidden">
        <span className={`text-xs shrink-0 truncate max-w-[45%] ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.title}
        </span>
        {overdue && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium border border-red-100 whitespace-nowrap">
            지연 {odDays}일
          </span>
        )}
        {noUpdate && !overdue && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-500 font-medium border border-orange-100 whitespace-nowrap">
            {daysDiff(task.updated_at)}일 무응답
          </span>
        )}
        {task.projects && task.projects.length > 0 && (
          <>
            <span className="text-gray-200 text-[10px] shrink-0">·</span>
            {task.projects.slice(0, 2).map(p => (
              <span key={p.id} className="flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                <Paperclip size={8} className="shrink-0" />{p.name}
              </span>
            ))}
            {task.projects.length > 2 && <span className="text-[10px] text-gray-400 shrink-0">+{task.projects.length - 2}</span>}
          </>
        )}
        {task.memo && (
          <div className="relative shrink-0">
            <button
              onMouseEnter={() => setShowMemo(true)}
              onMouseLeave={() => setShowMemo(false)}
              className="text-gray-300 hover:text-indigo-400 transition-colors"
            >
              <MessageSquare size={11} />
            </button>
            {showMemo && (
              <div className="absolute left-0 top-5 z-50 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-[11px] text-gray-600 whitespace-pre-wrap pointer-events-none">
                {task.memo}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="w-28 shrink-0 flex items-center gap-1.5">
        {assigneeName && (
          <>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[11px] text-gray-500 truncate">{assigneeName}</span>
          </>
        )}
      </div>
      <div className="w-20 shrink-0 text-[11px] text-gray-400 tabular-nums">{relativeTime(task.updated_at)}</div>
      <div className="w-14 shrink-0 text-[11px] text-gray-400 tabular-nums">{fmtDate(task.start_date ?? null)}</div>
      <div className={`w-14 shrink-0 text-[11px] tabular-nums font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
        {fmtDate(task.due_date)}
      </div>
      <div className="w-14 shrink-0 text-[10px] text-gray-300 tabular-nums">{fmtDate(task.created_at)}</div>
      <div className="w-12 shrink-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(task)} className="p-1 text-gray-300 hover:text-indigo-500 rounded"><Pencil size={11} /></button>
        <button onClick={() => onDelete(task.id)} className="p-1 text-gray-300 hover:text-red-400 rounded"><Trash2 size={11} /></button>
      </div>
    </div>
  )
}

interface DraggableTaskRowProps {
  task: GanttTask
  isDraggingId?: string
  assigneeColor?: string
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
}

export function DraggableTaskRow({ task, isDraggingId, assigneeColor, ...props }: DraggableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  return (
    <div ref={setNodeRef} style={style}>
      <TaskRow
        task={task}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDraggingId === task.id}
        assigneeColor={assigneeColor}
        {...props}
      />
    </div>
  )
}

export function DroppableGroup({ status, children }: { status: TaskStatus; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className={isOver ? 'ring-1 ring-inset ring-indigo-300 rounded bg-indigo-50/30' : ''}>
      {children}
    </div>
  )
}
