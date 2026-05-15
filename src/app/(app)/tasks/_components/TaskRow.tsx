'use client'

import { useState, useRef } from 'react'
import {
  Circle, CheckCircle2, GripVertical, Trash2, Paperclip, StickyNote,
} from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { GanttTask, TaskStatus } from '@/types'
import { fmtDate, isOverdue, overdueDays, daysDiff } from '../_utils'
import { labelColor } from './TaskDetailDrawer'
import { PriorityBars } from '../_constants'

interface TaskRowProps {
  task: GanttTask
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  dragHandleProps?: Record<string, unknown>
  isDragging?: boolean
  assigneeColor?: string
  isSubTask?: boolean
  subTaskStats?: { total: number; done: number }
  onAddSubTask?: () => void
  onToggleExpand?: () => void
}

export function TaskRow({ task, onEdit, onDelete, onStatusChange, dragHandleProps, isDragging, assigneeColor, isSubTask, subTaskStats, onAddSubTask, onToggleExpand }: TaskRowProps) {
  const [memoPos, setMemoPos] = useState<{ x: number; y: number } | null>(null)
  const memoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const overdue  = isOverdue(task.due_date, task.status)
  const isDone   = task.status === 'done'
  const noUpdate = daysDiff(task.updated_at) >= 7 && !isDone
  const odDays   = overdueDays(task.due_date)
  const color    = assigneeColor ?? '#9ca3af'
  const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')
  const labels = task.labels ?? []

  return (
    <div className={`group flex items-center px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isDone ? 'opacity-55' : ''} ${isDragging ? 'opacity-40' : ''} ${isSubTask ? 'bg-gray-50/40' : ''}`}>
      {/* 들여쓰기 (하위 태스크) */}
      {isSubTask && <div className="shrink-0 w-6 flex items-center justify-center mr-1"><div className="w-px h-4 bg-gray-200 ml-3" /></div>}
      {!isSubTask && (
        <div className="shrink-0 mr-1 cursor-grab text-gray-200 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" {...(dragHandleProps ?? {})}>
          <GripVertical size={13} />
        </div>
      )}
      <button
        onClick={() => onStatusChange(task.id, task.status === 'done' ? 'to-do' : 'done')}
        className="shrink-0 mr-2"
        title={isDone ? '완료 취소' : '완료 처리'}
      >
        {isDone
          ? <CheckCircle2 size={16} className="text-green-400" />
          : <Circle size={16} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
      </button>

      {/* 제목 + 뱃지 영역 */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-4 overflow-hidden">
        {/* 제목 — 클릭 시 드로어 */}
        <button
          onClick={() => onEdit(task)}
          className={`text-xs font-medium shrink-0 truncate max-w-[40%] text-left hover:text-indigo-600 transition-colors ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}
        >
          {task.title}
        </button>

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

        {/* 연결 프로젝트 */}
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

        {/* 라벨 */}
        {labels.slice(0, 4).map(l => (
          <span
            key={l}
            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium whitespace-nowrap"
            style={{ backgroundColor: labelColor(l) }}
          >
            {l}
          </span>
        ))}
        {labels.length > 4 && <span className="text-[10px] text-gray-400 shrink-0">+{labels.length - 4}</span>}

        {/* 하위 태스크 진행 뱃지 */}
        {subTaskStats && subTaskStats.total > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onToggleExpand?.() }}
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium border whitespace-nowrap transition-colors
              ${subTaskStats.done === subTaskStats.total
                ? 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'
                : 'bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100'}`}
            title="하위 태스크 펼치기/접기"
          >
            {subTaskStats.done}/{subTaskStats.total}
          </button>
        )}

        {/* sub + 버튼 */}
        {onAddSubTask && !isSubTask && (
          <button
            onClick={e => { e.stopPropagation(); onAddSubTask() }}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-500 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all whitespace-nowrap"
          >
            sub +
          </button>
        )}

        {/* 인라인 삭제 버튼 */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(task.id) }}
          className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-400 rounded transition-all"
          title="삭제"
        >
          <Trash2 size={11} />
        </button>

      </div>

      {/* 우선순위 컬럼 */}
      <div className="w-16 shrink-0 flex items-center">
        <PriorityBars priority={task.priority} showLabel />
      </div>

      {/* 메모 컬럼 */}
      <div className="w-10 shrink-0 flex items-center justify-start relative">
        <button
          onClick={() => onEdit(task)}
          onMouseEnter={task.memo ? e => {
            if (memoTimerRef.current) clearTimeout(memoTimerRef.current)
            setMemoPos({ x: e.clientX, y: e.clientY })
          } : undefined}
          onMouseLeave={task.memo ? () => {
            memoTimerRef.current = setTimeout(() => setMemoPos(null), 100)
          } : undefined}
          className={task.memo
            ? 'text-indigo-400 hover:text-indigo-600 transition-colors'
            : 'text-gray-200 opacity-0 group-hover:opacity-100 hover:text-indigo-400 transition-colors'}
        >
          <StickyNote size={12} />
        </button>
        {memoPos && task.memo && (
          <div
            className="fixed z-[9999] pointer-events-none max-w-xs"
            style={{ left: memoPos.x + 14, top: memoPos.y - 8 }}
          >
            <div className="bg-gray-900 text-gray-100 text-[11px] rounded-lg shadow-xl px-3 py-2 leading-relaxed whitespace-pre-wrap break-words">
              {task.memo}
            </div>
            <div className="absolute -left-1.5 top-3 w-3 h-3 bg-gray-900 rotate-45" />
          </div>
        )}
      </div>

      <button onClick={() => onEdit(task)} className="w-28 shrink-0 flex items-center gap-1.5 text-left hover:text-indigo-500 transition-colors">
        {assigneeName && (
          <>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[11px] text-gray-500 truncate">{assigneeName}</span>
          </>
        )}
      </button>
      <button onClick={() => onEdit(task)} className="w-14 shrink-0 text-[11px] text-gray-400 tabular-nums text-left hover:text-indigo-500 transition-colors">
        {fmtDate(task.start_date ?? null)}
      </button>
      <button onClick={() => onEdit(task)} className={`w-14 shrink-0 text-[11px] tabular-nums text-left hover:text-indigo-500 transition-colors ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
        {fmtDate(task.due_date)}
      </button>
      <button onClick={() => onEdit(task)} className="w-14 shrink-0 text-[11px] text-gray-400 tabular-nums text-left hover:text-indigo-500 transition-colors">
        {fmtDate(task.created_at)}
      </button>
    </div>
  )
}

interface DraggableTaskRowProps {
  task: GanttTask
  isDraggingId?: string
  assigneeColor?: string
  subTaskStats?: { total: number; done: number }
  onAddSubTask?: () => void
  onToggleExpand?: () => void
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
}

export function DraggableTaskRow({ task, isDraggingId, assigneeColor, subTaskStats, onAddSubTask, onToggleExpand, ...props }: DraggableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  return (
    <div ref={setNodeRef} style={style}>
      <TaskRow
        task={task}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDraggingId === task.id}
        assigneeColor={assigneeColor}
        subTaskStats={subTaskStats}
        onAddSubTask={onAddSubTask}
        onToggleExpand={onToggleExpand}
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
