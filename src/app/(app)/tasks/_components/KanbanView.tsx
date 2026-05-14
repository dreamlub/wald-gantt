'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Paperclip, MessageSquare } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { GanttTask, TaskStatus } from '@/types'
import { STATUS_GROUPS, STATUS_COLOR, STATUS_LABEL } from '../_constants'
import { fmtDate, isOverdue, overdueDays } from '../_utils'

interface Props {
  tasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  onAddTask: (status: TaskStatus) => void
}

// ── 카드 ──────────────────────────────────────────────────────
function KanbanCard({ task, assigneeColor, onEdit, onDelete, isDragging }: {
  task: GanttTask
  assigneeColor?: string
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  isDragging?: boolean
}) {
  const [showMemo, setShowMemo] = useState(false)
  const overdue = isOverdue(task.due_date, task.status)
  const isDone  = task.status === 'done'
  const color   = assigneeColor ?? '#9ca3af'
  const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')

  return (
    <div
      className={`bg-white rounded-lg border border-gray-100 shadow-sm px-3 py-2.5 group
        hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer
        ${isDone ? 'opacity-60' : ''}
        ${isDragging ? 'opacity-0' : ''}`}
      onClick={() => onEdit(task)}
    >
      {/* 제목 */}
      <div className={`text-xs font-medium leading-snug mb-2 ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {task.title}
      </div>

      {/* 프로젝트 태그 */}
      {task.projects && task.projects.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.projects.slice(0, 2).map(p => (
            <span
              key={p.id}
              className="flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded"
            >
              <Paperclip size={8} className="shrink-0" />{p.name}
            </span>
          ))}
          {task.projects.length > 2 && (
            <span className="text-[10px] text-gray-400">+{task.projects.length - 2}</span>
          )}
        </div>
      )}

      {/* 하단: 담당자 + 마감일 + 액션 */}
      <div className="flex items-center gap-1.5 mt-1">
        {assigneeName && (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-gray-400 truncate">{assigneeName}</span>
          </div>
        )}
        {!assigneeName && <div className="flex-1" />}

        {/* 메모 */}
        {task.memo && (
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onMouseEnter={() => setShowMemo(true)}
              onMouseLeave={() => setShowMemo(false)}
              className="text-gray-300 hover:text-indigo-400 transition-colors"
            >
              <MessageSquare size={10} />
            </button>
            {showMemo && (
              <div className="absolute bottom-5 right-0 z-50 w-52 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-[11px] text-gray-600 whitespace-pre-wrap pointer-events-none">
                {task.memo}
              </div>
            )}
          </div>
        )}

        {/* 마감일 */}
        {task.due_date && (
          <span className={`text-[10px] tabular-nums font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
            {overdue ? `지연 ${overdueDays(task.due_date)}일` : fmtDate(task.due_date)}
          </span>
        )}

        {/* 편집/삭제 */}
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => onEdit(task)}
            className="p-0.5 text-gray-300 hover:text-indigo-500 rounded"
          >
            <Pencil size={10} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-0.5 text-gray-300 hover:text-red-400 rounded"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 드래그 가능한 카드 ────────────────────────────────────────
function DraggableCard({ task, isDraggingId, ...props }: {
  task: GanttTask
  isDraggingId?: string
  assigneeColor?: string
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard task={task} isDragging={isDraggingId === task.id} {...props} />
    </div>
  )
}

// ── 드롭 가능한 컬럼 ─────────────────────────────────────────
function KanbanColumn({ status, label, color, tasks, assigneeColorMap, getAssigneeKey, isDraggingId, onEdit, onDelete, onAddTask }: {
  status: TaskStatus
  label: string
  color: string
  tasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  isDraggingId?: string
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onAddTask: (s: TaskStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex flex-col shrink-0 w-64">
      {/* 컬럼 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2.5 sticky top-0 bg-gray-50 z-10">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-0.5"
          style={{ backgroundColor: color + '20', color }}
        >
          {tasks.length}
        </span>
      </div>

      {/* 카드 목록 */}
      <div
        ref={setNodeRef}
        className={`flex-1 flex flex-col gap-2 px-2 py-2 rounded-lg min-h-[120px] transition-colors
          ${isOver ? 'bg-indigo-50/60 ring-1 ring-indigo-200 ring-inset' : ''}`}
      >
        {tasks.map(task => (
          <DraggableCard
            key={task.id}
            task={task}
            isDraggingId={isDraggingId}
            assigneeColor={assigneeColorMap.get(getAssigneeKey(task))}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}

        {/* 추가 버튼 */}
        <button
          onClick={() => onAddTask(status)}
          className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-gray-400 hover:text-indigo-500 hover:bg-white rounded-md border border-dashed border-gray-200 hover:border-indigo-300 transition-colors mt-0.5"
        >
          <Plus size={11} /> 태스크 추가
        </button>
      </div>
    </div>
  )
}

// ── KanbanView ────────────────────────────────────────────────
export function KanbanView({ tasks, assigneeColorMap, getAssigneeKey, onEdit, onDelete, onStatusChange, onAddTask }: Props) {
  const [draggingTask, setDraggingTask] = useState<GanttTask | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragStart(e: DragStartEvent) {
    const task = tasks.find(t => t.id === e.active.id)
    if (task) setDraggingTask(task)
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggingTask(null)
    const { active, over } = e
    if (!over) return
    const newStatus = over.id as TaskStatus
    const task = tasks.find(t => t.id === active.id)
    if (!task || task.status === newStatus) return
    onStatusChange(task.id, newStatus)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 px-4 py-3 h-full min-h-0" style={{ minWidth: STATUS_GROUPS.length * 272 }}>
          {STATUS_GROUPS.map(({ status, label, color }) => (
            <KanbanColumn
              key={status}
              status={status}
              label={label}
              color={color}
              tasks={tasks.filter(t => t.status === status)}
              assigneeColorMap={assigneeColorMap}
              getAssigneeKey={getAssigneeKey}
              isDraggingId={draggingTask?.id}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddTask={onAddTask}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {draggingTask && (
          <div className="bg-white border border-indigo-200 rounded-lg shadow-xl px-3 py-2.5 text-xs text-gray-700 font-medium w-60 opacity-95">
            {draggingTask.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
