'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Paperclip, StickyNote } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, useDroppable,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { GanttTask, TaskStatus } from '@/types'
import { STATUS_GROUPS } from '../_constants'
import { fmtDate, isOverdue, overdueDays, isStartDelayed, startDelayedDays, daysDiff, isLightColor } from '../_utils'
import { MemoTooltip } from '@/components/MemoTooltip'
import { labelColor } from './TaskDetailDrawer'

interface Props {
  tasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  onEdit: (t: GanttTask) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  onKanbanReorder?: (updates: { id: string; sort_order: number }[]) => void
  onQuickCreate?: (title: string, status: TaskStatus) => Promise<void>
}

function computeColumnOrder(tasks: GanttTask[]): Map<TaskStatus, string[]> {
  const taskIds = new Set(tasks.map(t => t.id))
  const map = new Map<TaskStatus, string[]>()
  for (const { status } of STATUS_GROUPS) {
    map.set(
      status,
      tasks
        .filter(t => t.status === status && (!t.parent_id || !taskIds.has(t.parent_id)))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(t => t.id)
    )
  }
  return map
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
  const color    = assigneeColor ?? 'var(--color-ink-300)'
  const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')
  const labels   = task.labels ?? []

  return (
    <div
      className={`bg-card rounded-md ring-1 ring-gray-100 px-3.5 py-3 group
        hover:ring-gray-300 transition-all cursor-pointer
        ${isDone ? 'opacity-55' : ''}
        ${isDragging ? 'opacity-0' : ''}`}
      onClick={() => onEdit(task)}
    >
      <div className={`text-xs leading-snug mb-2 break-words ${
        isDone ? 'line-through font-medium text-ink-400' :
        task.priority === 3 ? 'font-semibold text-rose-500' :
        task.priority === 2 ? 'font-medium text-foreground' :
        task.priority === 1 ? 'font-normal text-muted-foreground' :
        'font-normal text-ink-400'
      }`}>
        {task.title}
      </div>

      {(overdue || startDelayed || noUpdate || labels.length > 0 || (task.projects && task.projects.length > 0)) && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          {overdue && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-late/10 text-status-late font-medium border border-status-late/15 whitespace-nowrap">
              지연 {overdueDays(task.due_date)}일
            </span>
          )}
          {startDelayed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-warn/10 text-status-warn font-medium border border-status-warn/15 whitespace-nowrap">
              시작 지연 {startDelayedDays(task.start_date)}일
            </span>
          )}
          {noUpdate && !overdue && !startDelayed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-coral-100 text-coral-500 font-medium border border-coral-100 whitespace-nowrap">
              {daysDiff(task.updated_at)}일 무응답
            </span>
          )}
          {task.projects?.slice(0, 2).map(p => (
            <span key={p.id} className="flex items-center gap-0.5 text-[10px] text-ink-400">
              <Paperclip size={8} className="shrink-0" />{p.name}
            </span>
          ))}
          {(task.projects?.length ?? 0) > 2 && (
            <span className="text-[10px] text-ink-400">+{(task.projects!.length) - 2}</span>
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
          {labels.length > 3 && <span className="text-[9px] text-ink-400">+{labels.length - 3}</span>}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {assigneeName ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-muted-foreground truncate">{assigneeName}</span>
          </div>
        ) : <div className="flex-1" />}

        {task.memo && (
          <button
            onMouseEnter={onMemoHover}
            onMouseLeave={onMemoLeave}
            onClick={e => { e.stopPropagation(); onEdit(task) }}
            className="text-lilac-400 hover:text-accent-foreground transition-colors"
          >
            <StickyNote size={11} />
          </button>
        )}

        {subTaskStats && subTaskStats.total > 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap
            ${subTaskStats.done === subTaskStats.total
              ? 'bg-mint-100 text-mint-500'
              : 'bg-muted text-muted-foreground'}`}
          >
            {subTaskStats.done}/{subTaskStats.total}
          </span>
        )}

        {task.due_date && !overdue && (
          <span className="text-[10px] tabular-nums text-ink-400 shrink-0">
            {fmtDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── 정렬 가능한 카드 ──────────────────────────────────────────
function DraggableCard({ task, ...props }: {
  task: GanttTask
  assigneeColor?: string
  subTaskStats?: { total: number; done: number }
  onEdit: (t: GanttTask) => void
  onMemoHover?: (e: React.MouseEvent) => void
  onMemoLeave?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard task={task} isDragging={isDragging} {...props} />
    </div>
  )
}

// ── 컬럼 ─────────────────────────────────────────────────────
function KanbanColumn({
  status, label, color, bgColor, tasks, allTasks, assigneeColorMap, getAssigneeKey,
  orderedIds, onEdit, onMemoHover, onMemoLeave,
  quickAddOpen, quickAddTitle, onQuickAddStart, onQuickAddChange, onQuickAddCommit, onQuickAddCancel,
}: {
  status: TaskStatus
  label: string
  color: string
  bgColor: string
  tasks: GanttTask[]
  allTasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  orderedIds: string[]
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
      <div className="flex items-center gap-2 px-3 py-2.5 sticky top-0 bg-muted z-10">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-ink-700">{label}</span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-0.5"
          style={{ backgroundColor: bgColor, color }}
        >
          {tasks.length}
        </span>
      </div>

      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex-1 flex flex-col gap-2 px-2 py-2 rounded-lg min-h-[120px] transition-colors
            ${isOver ? 'bg-accent/60 ring-1 ring-lilac-200 ring-inset' : ''}`}
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
                assigneeColor={assigneeColorMap.get(getAssigneeKey(task))}
                subTaskStats={subTaskStats}
                onEdit={onEdit}
                onMemoHover={task.memo ? e => onMemoHover(task, e) : undefined}
                onMemoLeave={task.memo ? onMemoLeave : undefined}
              />
            )
          })}

          {quickAddOpen ? (
            <div className="bg-card rounded-lg border border-lilac-200 shadow-sm px-3 py-2.5">
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
                className="w-full text-xs outline-none placeholder:text-ink-300 text-foreground"
              />
            </div>
          ) : (
            <button
              onClick={() => onQuickAddStart(status)}
              className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-ink-400 hover:text-foreground hover:bg-card rounded-md border border-dashed border-border hover:border-ink-400 transition-colors mt-0.5"
            >
              <Plus size={11} /> 태스크 추가
            </button>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ── KanbanView ────────────────────────────────────────────────
export function KanbanView({ tasks, assigneeColorMap, getAssigneeKey, onEdit, onStatusChange, onKanbanReorder, onQuickCreate }: Props) {
  const [draggingTask,   setDraggingTask]   = useState<GanttTask | null>(null)
  const [quickAddStatus, setQuickAddStatus] = useState<TaskStatus | null>(null)
  const [quickAddTitle,  setQuickAddTitle]  = useState('')
  const [memoHover, setMemoHover] = useState<{ taskId: string; x: number; y: number } | null>(null)

  const [columnOrder, setColumnOrder] = useState<Map<TaskStatus, string[]>>(() => computeColumnOrder(tasks))
  // ref always mirrors latest state — safe to read in event handlers without stale closure risk
  const latestColOrder = useRef(columnOrder)
  latestColOrder.current = columnOrder

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Sync from props when not dragging (e.g. after server reload)
  useEffect(() => {
    if (!draggingTask) setColumnOrder(computeColumnOrder(tasks))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  function handleDragStart(e: DragStartEvent) {
    const task = tasks.find(t => t.id === e.active.id)
    if (task) setDraggingTask(task)
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const activeId = active.id as string
    const overId   = over.id as string
    const STATUS_SET = new Set(STATUS_GROUPS.map(g => g.status as string))
    // Only handle same-column visual reorder — cross-column handled in handleDragEnd
    if (STATUS_SET.has(overId)) return

    const order = latestColOrder.current
    let activeStatus: TaskStatus | undefined
    let overStatus: TaskStatus | undefined
    for (const [status, ids] of order) {
      if (ids.includes(activeId)) activeStatus = status
      if (ids.includes(overId))   overStatus   = status
    }
    if (!activeStatus || !overStatus || activeStatus !== overStatus) return

    const colOrder = order.get(activeStatus) ?? []
    const oldIdx = colOrder.indexOf(activeId)
    const newIdx = colOrder.indexOf(overId)
    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return

    setColumnOrder(new Map(order).set(activeStatus, arrayMove(colOrder, oldIdx, newIdx)))
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setDraggingTask(null)
    if (!over) return

    const activeId = active.id as string
    const overId   = over.id as string
    const STATUS_SET = new Set(STATUS_GROUPS.map(g => g.status))
    const activeTask = tasks.find(t => t.id === activeId)
    if (!activeTask) return

    let overStatus: TaskStatus
    if (STATUS_SET.has(overId as TaskStatus)) {
      overStatus = overId as TaskStatus
    } else {
      let found: TaskStatus | undefined
      for (const [status, ids] of latestColOrder.current) {
        if (ids.includes(overId)) { found = status; break }
      }
      if (!found) return
      overStatus = found
    }

    if (activeTask.status === overStatus) {
      // 같은 컬럼 — 현재 columnOrder를 sort_order로 persist
      const colOrder = latestColOrder.current.get(overStatus) ?? []
      onKanbanReorder?.(colOrder.map((id, i) => ({ id, sort_order: i * 100 })))
    } else {
      // 다른 컬럼 — 상태 변경
      onStatusChange(activeTask.id, overStatus)
    }
  }

  async function commitQuickAdd(status: TaskStatus) {
    if (!onQuickCreate) return
    const title = quickAddTitle.trim()
    if (!title) { setQuickAddStatus(null); setQuickAddTitle(''); return }
    await onQuickCreate(title, status)
    setQuickAddTitle('')
  }
  function cancelQuickAdd() { setQuickAddStatus(null); setQuickAddTitle('') }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-card">
        <div className="flex gap-3 px-4 py-3 h-full min-h-0" style={{ minWidth: STATUS_GROUPS.length * 272 }}>
          {STATUS_GROUPS.map(({ status, label, color, bgColor }) => {
            const orderedIds  = columnOrder.get(status) ?? []
            const taskIds     = new Set(tasks.map(t => t.id))
          const taskMap     = new Map(tasks.filter(t => t.status === status && (!t.parent_id || !taskIds.has(t.parent_id))).map(t => [t.id, t]))
            const columnTasks = orderedIds.map(id => taskMap.get(id)).filter(Boolean) as GanttTask[]
            return (
              <KanbanColumn
                key={status}
                status={status}
                label={label}
                color={color}
                bgColor={bgColor}
                tasks={columnTasks}
                allTasks={tasks}
                orderedIds={orderedIds}
                assigneeColorMap={assigneeColorMap}
                getAssigneeKey={getAssigneeKey}
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
            )
          })}
        </div>
      </div>

      <DragOverlay>
        {draggingTask && (
          <div className="bg-card border border-lilac-200 rounded-lg shadow-xl px-3 py-2.5 text-xs text-ink-700 font-medium w-60 opacity-95">
            {draggingTask.title}
          </div>
        )}
      </DragOverlay>

      {memoHover && (() => {
        const t = tasks.find(x => x.id === memoHover.taskId)
        if (!t?.memo) return null
        return <MemoTooltip memo={t.memo} x={memoHover.x} y={memoHover.y} />
      })()}
    </DndContext>
  )
}
