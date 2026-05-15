'use client'

import { useState } from 'react'
import { Plus, Paperclip, StickyNote } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { GanttTask, TaskStatus } from '@/types'
import { STATUS_GROUPS } from '../_constants'
import { fmtDate, isOverdue, overdueDays, isStartDelayed, startDelayedDays, daysDiff, clampTooltipPos, isLightColor } from '../_utils'
import { labelColor } from './TaskDetailDrawer'

interface Props {
  tasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  onEdit: (t: GanttTask) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  onQuickCreate?: (title: string, status: TaskStatus) => Promise<void>
}

// ── 카드 ──────────────────────────────────────────────────────
function KanbanCard({ task, assigneeColor, onEdit, isDragging, subTaskStats, onMemoHover, onMemoLeave }: {
  task: GanttTask
  assigneeColor?: string
  onEdit: (t: GanttTask) => void
  isDragging?: boolean
  subTaskStats?: { total: number; done: number }
  onMemoHover?: (e: React.MouseEvent) => void
  onMemoLeave?: () => void
}) {
  const overdue  = isOverdue(task.due_date, task.status)
  const startDelayed = !overdue && isStartDelayed(task.start_date, task.status)
  const isDone   = task.status === 'done'
  const noUpdate = daysDiff(task.updated_at) >= 7 && !isDone
  const color    = assigneeColor ?? '#9ca3af'
  const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')
  const labels   = task.labels ?? []

  return (
    <div
      className={`bg-white rounded-md ring-1 ring-gray-100 px-3.5 py-3 group
        hover:ring-gray-300 transition-all cursor-pointer
        ${isDone ? 'opacity-55' : ''}
        ${isDragging ? 'opacity-0' : ''}`}
      onClick={() => onEdit(task)}
    >
      {/* 제목 — 우선순위 강조 */}
      <div className={`text-xs leading-snug mb-2 break-words ${
        isDone ? 'line-through font-medium text-gray-400' :
        task.priority === 3 ? 'font-semibold text-rose-400' :
        task.priority === 2 ? 'font-medium text-gray-900' :
        task.priority === 1 ? 'font-normal text-gray-600' :
        'font-normal text-gray-400'
      }`}>
        {task.title}
      </div>

      {/* 지연 / 시작 지연 / 무응답 / 라벨 / 프로젝트 */}
      {(overdue || startDelayed || noUpdate || labels.length > 0 || (task.projects && task.projects.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          {overdue && (
            <span className="text-[9px] leading-none px-1.5 py-[3px] rounded bg-red-50 text-red-500 font-medium">
              지연 {overdueDays(task.due_date)}일
            </span>
          )}
          {startDelayed && (
            <span className="text-[9px] leading-none px-1.5 py-[3px] rounded bg-amber-50 text-amber-600 font-medium">
              시작 지연 {startDelayedDays(task.start_date)}일
            </span>
          )}
          {noUpdate && !overdue && !startDelayed && (
            <span className="text-[9px] leading-none px-1.5 py-[3px] rounded bg-orange-50 text-orange-500 font-medium">
              {daysDiff(task.updated_at)}일 무응답
            </span>
          )}
          {task.projects?.slice(0, 2).map(p => (
            <span key={p.id} className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <Paperclip size={8} className="shrink-0" />{p.name}
            </span>
          ))}
          {(task.projects?.length ?? 0) > 2 && (
            <span className="text-[10px] text-gray-400">+{(task.projects!.length) - 2}</span>
          )}
          {labels.slice(0, 3).map(l => {
            const bg = labelColor(l)
            return (
              <span
                key={l}
                className="text-[9px] leading-none px-1.5 py-[3px] rounded font-medium"
                style={{ backgroundColor: bg, color: isLightColor(bg) ? '#1f2937' : '#ffffff' }}
              >
                {l}
              </span>
            )
          })}
          {labels.length > 3 && <span className="text-[9px] text-gray-400">+{labels.length - 3}</span>}
        </div>
      )}

      {/* 하단: 담당자 아바타 + 메모 + 하위 + 마감일 */}
      <div className="flex items-center gap-1.5">
        {assigneeName ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-gray-500 truncate">{assigneeName}</span>
          </div>
        ) : <div className="flex-1" />}

        {task.memo && (
          <button
            onMouseEnter={onMemoHover}
            onMouseLeave={onMemoLeave}
            onClick={e => { e.stopPropagation(); onEdit(task) }}
            className="text-indigo-400 hover:text-indigo-600 transition-colors"
          >
            <StickyNote size={11} />
          </button>
        )}

        {subTaskStats && subTaskStats.total > 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap
            ${subTaskStats.done === subTaskStats.total
              ? 'bg-green-50 text-green-600'
              : 'bg-gray-50 text-gray-500'}`}
          >
            {subTaskStats.done}/{subTaskStats.total}
          </span>
        )}

        {task.due_date && !overdue && (
          <span className="text-[10px] tabular-nums text-gray-400 shrink-0">
            {fmtDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── 드래그 가능한 카드 ────────────────────────────────────────
function DraggableCard({ task, isDraggingId, ...props }: {
  task: GanttTask
  isDraggingId?: string
  assigneeColor?: string
  subTaskStats?: { total: number; done: number }
  onEdit: (t: GanttTask) => void
  onMemoHover?: (e: React.MouseEvent) => void
  onMemoLeave?: () => void
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
function KanbanColumn({
  status, label, color, tasks, allTasks, assigneeColorMap, getAssigneeKey, isDraggingId,
  onEdit, onMemoHover, onMemoLeave,
  quickAddOpen, quickAddTitle, onQuickAddStart, onQuickAddChange, onQuickAddCommit, onQuickAddCancel,
}: {
  status: TaskStatus
  label: string
  color: string
  tasks: GanttTask[]
  allTasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  isDraggingId?: string
  onEdit: (t: GanttTask) => void
  onMemoHover: (task: GanttTask, e: React.MouseEvent) => void
  onMemoLeave: () => void
  quickAddOpen: boolean
  quickAddTitle: string
  onQuickAddStart: (s: TaskStatus) => void
  onQuickAddChange: (v: string) => void
  onQuickAddCommit: (s: TaskStatus) => void
  onQuickAddCancel: () => void
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
        {tasks.map(task => {
          const subs = allTasks.filter(t => t.parent_id === task.id)
          const subTaskStats = subs.length > 0
            ? { total: subs.length, done: subs.filter(t => t.status === 'done').length }
            : undefined
          return (
            <DraggableCard
              key={task.id}
              task={task}
              isDraggingId={isDraggingId}
              assigneeColor={assigneeColorMap.get(getAssigneeKey(task))}
              subTaskStats={subTaskStats}
              onEdit={onEdit}
              onMemoHover={task.memo ? e => onMemoHover(task, e) : undefined}
              onMemoLeave={task.memo ? onMemoLeave : undefined}
            />
          )
        })}

        {/* 인라인 퀵 추가 */}
        {quickAddOpen ? (
          <div className="bg-white rounded-lg border border-indigo-200 shadow-sm px-3 py-2.5">
            <input
              autoFocus
              value={quickAddTitle}
              onChange={e => onQuickAddChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onQuickAddCommit(status) }
                if (e.key === 'Escape') onQuickAddCancel()
              }}
              onBlur={() => { if (!quickAddTitle.trim()) onQuickAddCancel() }}
              placeholder="제목 후 Enter, Esc 취소"
              className="w-full text-xs outline-none placeholder:text-gray-300 text-gray-800"
            />
          </div>
        ) : (
          <button
            onClick={() => onQuickAddStart(status)}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-gray-400 hover:text-gray-900 hover:bg-white rounded-md border border-dashed border-gray-200 hover:border-gray-400 transition-colors mt-0.5"
          >
            <Plus size={11} /> 태스크 추가
          </button>
        )}
      </div>
    </div>
  )
}

// ── KanbanView ────────────────────────────────────────────────
export function KanbanView({ tasks, assigneeColorMap, getAssigneeKey, onEdit, onStatusChange, onQuickCreate }: Props) {
  const [draggingTask,    setDraggingTask]    = useState<GanttTask | null>(null)
  const [quickAddStatus,  setQuickAddStatus]  = useState<TaskStatus | null>(null)
  const [quickAddTitle,   setQuickAddTitle]   = useState('')
  const [memoHover, setMemoHover] = useState<{ taskId: string; x: number; y: number } | null>(null)

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

  async function commitQuickAdd(status: TaskStatus) {
    if (!onQuickCreate) return
    const title = quickAddTitle.trim()
    if (!title) { setQuickAddStatus(null); setQuickAddTitle(''); return }
    await onQuickCreate(title, status)
    setQuickAddTitle('')
    // 입력창 유지 — 연속 등록
  }
  function cancelQuickAdd() { setQuickAddStatus(null); setQuickAddTitle('') }

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
              tasks={tasks.filter(t => t.status === status && !t.parent_id)}
              allTasks={tasks}
              assigneeColorMap={assigneeColorMap}
              getAssigneeKey={getAssigneeKey}
              isDraggingId={draggingTask?.id}
              onEdit={onEdit}
              onMemoHover={(task, e) => setMemoHover({ taskId: task.id, x: e.clientX, y: e.clientY })}
              onMemoLeave={() => setMemoHover(null)}
              quickAddOpen={quickAddStatus === status}
              quickAddTitle={quickAddTitle}
              onQuickAddStart={s => { setQuickAddStatus(s); setQuickAddTitle('') }}
              onQuickAddChange={setQuickAddTitle}
              onQuickAddCommit={commitQuickAdd}
              onQuickAddCancel={cancelQuickAdd}
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

      {/* 메모 hover 툴팁 — clampTooltipPos */}
      {memoHover && (() => {
        const t = tasks.find(x => x.id === memoHover.taskId)
        if (!t?.memo) return null
        const pos = clampTooltipPos(memoHover.x, memoHover.y)
        return (
          <div className="fixed z-[9999] pointer-events-none max-w-xs" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
            <div className="bg-gray-900 text-gray-100 text-[11px] rounded-lg shadow-xl px-3 py-2 leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-hidden">
              {t.memo}
            </div>
            <div className={`absolute ${pos.flipX ? '-right-1.5' : '-left-1.5'} ${pos.flipY ? 'bottom-3' : 'top-3'} w-3 h-3 bg-gray-900 rotate-45`} />
          </div>
        )
      })()}
    </DndContext>
  )
}
