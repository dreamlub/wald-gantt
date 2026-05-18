'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Circle, CheckCircle2, GripVertical, Paperclip, StickyNote, Check, CalendarDays, Trash2,
} from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { GanttTask, TaskStatus } from '@/types'
import { fmtRange, isOverdue, overdueDays, isStartDelayed, startDelayedDays, daysDiff, isLightColor, clampTooltipPos } from '../_utils'
import { labelColor } from './TaskDetailDrawer'

function fmtHHMM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface TaskRowProps {
  task: GanttTask
  onEdit: (t: GanttTask) => void
  onEditMemo?: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  dragHandleProps?: Record<string, unknown>
  isDragging?: boolean
  assigneeColor?: string
  isSubTask?: boolean
  subTaskStats?: { total: number; done: number }
  onAddSubTask?: () => void
  onToggleExpand?: () => void
  selectionMode?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
}

export function TaskRow({ task, onEdit, onEditMemo, onDelete, onStatusChange, dragHandleProps, isDragging, assigneeColor, isSubTask, subTaskStats, onAddSubTask, onToggleExpand, selectionMode, selected, onSelect }: TaskRowProps) {
  const [memoPos, setMemoPos] = useState<{ x: number; y: number } | null>(null)
  const memoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  const overdue  = isOverdue(task.due_date, task.status)
  const startDelayed = !overdue && isStartDelayed(task.start_date, task.status)
  const isDone   = task.status === 'done'
  const noUpdate = daysDiff(task.updated_at) >= 7 && !isDone
  const odDays   = overdueDays(task.due_date)
  const sdDays   = startDelayedDays(task.start_date)
  const color    = assigneeColor ?? 'var(--color-ink-300)'
  const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')
  const labels = task.labels ?? []

  return (
    <div className={`group flex items-center px-4 py-2 border-b border-ink-150 hover:bg-muted transition-colors ${isDone ? 'opacity-55' : ''} ${isDragging ? 'opacity-0' : ''} ${isSubTask ? 'bg-muted/40' : ''}`}>
      {/* 들여쓰기 / 체크박스 / 그립 */}
      {isSubTask ? (
        selectionMode ? (
          <div className="shrink-0 w-6 flex items-center justify-center mr-1">
            <button
              onClick={e => { e.stopPropagation(); onSelect?.(task.id) }}
              className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${selected ? 'bg-lilac-500 border-lilac-500' : 'border-border hover:border-lilac-400'}`}
            >
              {selected && <Check size={8} className="text-white" strokeWidth={3} />}
            </button>
          </div>
        ) : (
          <div className="shrink-0 w-6 flex items-center justify-center mr-1"><div className="w-px h-4 bg-ink-200 ml-3" /></div>
        )
      ) : selectionMode ? (
        <div className="shrink-0 mr-1 w-[18px] flex items-center justify-center">
          <button
            onClick={e => { e.stopPropagation(); onSelect?.(task.id) }}
            className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${selected ? 'bg-lilac-500 border-lilac-500' : 'border-border hover:border-lilac-400'}`}
          >
            {selected && <Check size={8} className="text-white" strokeWidth={3} />}
          </button>
        </div>
      ) : (
        <div className="shrink-0 mr-1 cursor-grab text-ink-200 hover:text-ink-400 opacity-0 group-hover:opacity-100 transition-opacity" {...(dragHandleProps ?? {})}>
          <GripVertical size={13} />
        </div>
      )}
      <button
        onClick={() => onStatusChange(task.id, task.status === 'done' ? 'to-do' : 'done')}
        className="shrink-0 mr-2"
        title={isDone ? '완료 취소' : '완료 처리'}
      >
        {isDone
          ? <CheckCircle2 size={16} className="text-mint-500" />
          : <Circle size={16} className="text-ink-300 hover:text-lilac-400 transition-colors" />}
      </button>

      {/* 제목 + 뱃지 영역 */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-4 overflow-hidden">
        {/* 제목 — 클릭 시 드로어 */}
        <button
          onClick={() => onEdit(task)}
          className={`text-xs min-w-0 truncate text-left hover:text-accent-foreground transition-colors ${
            isDone ? 'line-through font-medium text-ink-400' :
            task.priority === 3 ? 'font-semibold text-rose-500' :
            task.priority === 2 ? 'font-medium text-foreground' :
            task.priority === 1 ? 'font-normal text-muted-foreground' :
            'font-normal text-ink-400'
          }`}
        >
          {task.title}
        </button>

        {overdue && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-status-late/10 text-status-late font-medium border border-status-late/15 whitespace-nowrap">
            지연 {odDays}일
          </span>
        )}
        {startDelayed && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-status-warn/10 text-status-warn font-medium border border-status-warn/15 whitespace-nowrap">
            시작 지연 {sdDays}일
          </span>
        )}
        {noUpdate && !overdue && !startDelayed && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-coral-100 text-coral-500 font-medium border border-coral-100 whitespace-nowrap">
            {daysDiff(task.updated_at)}일 무응답
          </span>
        )}

        {/* 연결 프로젝트 */}
        {task.projects && task.projects.length > 0 && (
          <>
            <span className="text-ink-200 text-[10px] shrink-0">·</span>
            {task.projects.slice(0, 2).map(p => (
              <span key={p.id} className="flex items-center gap-0.5 text-[10px] bg-muted text-ink-400 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                <Paperclip size={8} className="shrink-0" />{p.name}
              </span>
            ))}
            {task.projects.length > 2 && <span className="text-[10px] text-ink-400 shrink-0">+{task.projects.length - 2}</span>}
          </>
        )}

        {/* 라벨 */}
        {labels.slice(0, 4).map(l => {
          const bg = labelColor(l)
          return (
            <span
              key={l}
              className="shrink-0 text-[9px] leading-none px-1 py-[3px] rounded font-medium whitespace-nowrap"
              style={{ backgroundColor: bg, color: isLightColor(bg) ? '#1f2937' : '#ffffff' }}
            >
              {l}
            </span>
          )
        })}
        {labels.length > 4 && <span className="text-[9px] text-ink-400 shrink-0">+{labels.length - 4}</span>}

        {/* 캘린더 배치 뱃지 */}
        {task.scheduled_at && (() => {
          const d = new Date(task.scheduled_at)
          const isAllDay = d.getHours() === 0 && d.getMinutes() === 0
          const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`
          const label = isAllDay
            ? `${dateLabel} 종일`
            : (() => {
                const from = fmtHHMM(task.scheduled_at)
                if (!task.duration_minutes) return `${dateLabel} ${from}`
                const endMs = d.getTime() + task.duration_minutes * 60000
                const to = fmtHHMM(new Date(endMs).toISOString())
                return `${dateLabel} ${from} → ${to}`
              })()
          return (
            <button
              onClick={e => {
                e.stopPropagation()
                const dateStr = new Date(task.scheduled_at!).toISOString().slice(0, 10)
                router.push(`/calendar?highlight=${task.id}&date=${dateStr}`)
              }}
              className="shrink-0 flex items-center gap-0.5 text-[10px] text-lilac-500 bg-lilac-100/60 border border-lilac-200 px-1.5 py-0.5 rounded whitespace-nowrap hover:bg-lilac-100 transition-colors"
            >
              <CalendarDays size={9} className="shrink-0" />
              {label}
            </button>
          )
        })()}

        {/* 하위 태스크 진행 뱃지 */}
        {subTaskStats && subTaskStats.total > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onToggleExpand?.() }}
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium border whitespace-nowrap transition-colors
              ${subTaskStats.done === subTaskStats.total
                ? 'bg-mint-100 text-mint-500 border-mint-100 hover:bg-mint-100'
                : 'bg-muted text-muted-foreground border-border hover:bg-muted'}`}
            title="하위 태스크 펼치기/접기"
          >
            {subTaskStats.done}/{subTaskStats.total}
          </button>
        )}

        {/* 하위 태스크 추가 — 호버 시 표시 */}
        {!isSubTask && onAddSubTask && (
          <button
            onClick={e => { e.stopPropagation(); onAddSubTask() }}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded border border-dashed border-ink-300 text-muted-foreground hover:text-foreground hover:border-ink-400 hover:bg-muted transition-all whitespace-nowrap"
            title="하위 태스크 추가"
          >
            sub +
          </button>
        )}

        {/* 삭제 — 호버 시 표시 */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(task.id) }}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-ink-300 hover:text-status-late transition-all"
          title="삭제"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 메모 컬럼 */}
      <div className="w-10 shrink-0 flex items-center justify-start relative">
        <button
          onClick={() => onEditMemo ? onEditMemo(task) : onEdit(task)}
          onMouseEnter={task.memo ? e => {
            if (memoTimerRef.current) clearTimeout(memoTimerRef.current)
            setMemoPos({ x: e.clientX, y: e.clientY })
          } : undefined}
          onMouseLeave={task.memo ? () => {
            memoTimerRef.current = setTimeout(() => setMemoPos(null), 100)
          } : undefined}
          className={task.memo
            ? 'text-lilac-400 hover:text-accent-foreground transition-colors'
            : 'text-ink-300 opacity-0 group-hover:opacity-100 hover:text-lilac-500 transition-colors'}
        >
          <StickyNote size={12} />
        </button>
        {memoPos && task.memo && (() => {
          const pos = clampTooltipPos(memoPos.x, memoPos.y)
          return (
            <div
              className="fixed z-[9999] pointer-events-none max-w-xs"
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
            >
              <div className="bg-foreground text-background text-[11px] rounded-lg shadow-xl px-3 py-2 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-hidden">
                {task.memo}
              </div>
              <div className={`absolute ${pos.flipX ? '-right-1.5' : '-left-1.5'} ${pos.flipY ? 'bottom-3' : 'top-3'} w-3 h-3 bg-foreground rotate-45`} />
            </div>
          )
        })()}
      </div>

      <button onClick={() => onEdit(task)} className="w-28 shrink-0 flex items-center gap-1.5 text-left hover:text-lilac-500 transition-colors">
        {assigneeName && (
          <>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[11px] text-muted-foreground truncate">{assigneeName}</span>
          </>
        )}
      </button>
      <button onClick={() => onEdit(task)} className={`w-24 shrink-0 text-[11px] tabular-nums text-left hover:text-lilac-500 transition-colors ${overdue ? 'text-status-late' : 'text-ink-400'}`}>
        {fmtRange(task.start_date ?? null, task.due_date)}
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
  onEditMemo?: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  selectionMode?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
}

export function DraggableTaskRow({ task, isDraggingId, assigneeColor, subTaskStats, onAddSubTask, onToggleExpand, selectionMode, selected, onSelect, ...props }: DraggableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <TaskRow
        task={task}
        dragHandleProps={selectionMode ? undefined : { ...attributes, ...listeners }}
        isDragging={isDraggingId === task.id}
        assigneeColor={assigneeColor}
        subTaskStats={subTaskStats}
        onAddSubTask={onAddSubTask}
        onToggleExpand={onToggleExpand}
        selectionMode={selectionMode}
        selected={selected}
        onSelect={onSelect}
        {...props}
      />
    </div>
  )
}

export function DroppableGroup({ status, children }: { status: TaskStatus; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className={isOver ? 'ring-1 ring-inset ring-lilac-300 rounded bg-accent/30' : ''}>
      {children}
    </div>
  )
}
