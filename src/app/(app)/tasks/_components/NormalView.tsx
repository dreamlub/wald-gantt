'use client'

import React from 'react'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import {
  DndContext, DragOverlay,
  type CollisionDetection, type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from '@dnd-kit/core'
import type { SensorDescriptor, SensorOptions } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { STATUS_GROUPS } from '../_constants'
import { TaskRow, DraggableTaskRow, DroppableGroup } from './TaskRow'
import type { GanttTask, TaskStatus } from '@/types'

interface NormalViewProps {
  filtered: GanttTask[]
  hasFilter: boolean
  // 상태 그룹
  collapsed: Set<string>
  toggleCollapse: (key: string) => void
  overdueGroup: GanttTask[]
  avgOverdueDays: number
  avgIPDays: number
  getGroup: (status: TaskStatus) => GanttTask[]
  getSubTasks: (parentId: string) => GanttTask[]
  // 드래그
  draggingTask: GanttTask | null
  sensors: SensorDescriptor<SensorOptions>[]
  collisionDetection: CollisionDetection
  onDragStart: (e: DragStartEvent) => void
  onDragOver: (e: DragOverEvent) => void
  onDragEnd: (e: DragEndEvent) => void
  onDragCancel: () => void
  getSortableIds: (groupKey: string, groupTasks: GanttTask[]) => string[]
  // 태스크 액션
  onEdit: (t: GanttTask) => void
  onEditMemo: (t: GanttTask) => void
  onDelete: (id: string) => Promise<void>
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>
  onAdd: (status: TaskStatus) => void
  // 하위 태스크
  expandedParents: Set<string>
  toggleExpanded: (parentId: string) => void
  openAddSubTask: (parentId: string) => void
  // 퀵 등록
  quickAddStatus: TaskStatus | null
  setQuickAddStatus: (s: TaskStatus | null) => void
  quickAddParentId: string | null
  setQuickAddParentId: (id: string | null) => void
  quickAddTitle: string
  setQuickAddTitle: (v: string) => void
  commitQuickAdd: (status: TaskStatus) => void
  cancelQuickAdd: () => void
  commitQuickAddSub: (parentId: string) => void
  cancelQuickAddSub: () => void
  // 선택
  selectionMode: boolean
  selectedIds: Set<string>
  onSelect: (id: string) => void
  // 담당자 색상
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  // 빠른 필터 이름(빈 상태 메시지용)
  quickFilter: string
}

function QuickAddRow({ autoFocus, value, onChange, onCommit, onCancel, placeholder, indent }: {
  autoFocus?: boolean
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  placeholder: string
  indent: string
}) {
  return (
    <div className={`flex items-center gap-1.5 ${indent} pr-4 py-1.5 border-b border-ink-150 bg-accent/30`}>
      <Plus size={indent === 'pl-12' ? 10 : 11} className="text-lilac-400 shrink-0" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit() }
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => { if (!value.trim()) onCancel() }}
        placeholder={placeholder}
        className="flex-1 text-[11px] outline-none placeholder:text-ink-300 bg-transparent text-foreground"
      />
      {indent === 'pl-10' && <span className="text-[10px] text-ink-300 shrink-0">상세 설정은 행 클릭</span>}
    </div>
  )
}

function TaskGroup({ task, subs, isExp, onEdit, onEditMemo, onDelete, onStatusChange, draggingId, assigneeColorMap, getAssigneeKey, openAddSubTask, toggleExpanded, quickAddParentId, quickAddTitle, setQuickAddTitle, commitQuickAddSub, cancelQuickAddSub, selectionMode, selectedIds, onSelect }: {
  task: GanttTask
  subs: GanttTask[]
  isExp: boolean
  onEdit: (t: GanttTask) => void
  onEditMemo: (t: GanttTask) => void
  onDelete: (id: string) => Promise<void>
  onStatusChange: (id: string, s: TaskStatus) => Promise<void>
  draggingId?: string
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  openAddSubTask: (parentId: string) => void
  toggleExpanded: (parentId: string) => void
  quickAddParentId: string | null
  quickAddTitle: string
  setQuickAddTitle: (v: string) => void
  commitQuickAddSub: (parentId: string) => void
  cancelQuickAddSub: () => void
  selectionMode: boolean
  selectedIds: Set<string>
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <DraggableTaskRow task={task}
        onEdit={onEdit} onEditMemo={onEditMemo} onDelete={onDelete} onStatusChange={onStatusChange}
        isDraggingId={draggingId}
        assigneeColor={assigneeColorMap.get(getAssigneeKey(task))}
        subTaskStats={subs.length > 0 ? { total: subs.length, done: subs.filter(s => s.status === 'done').length } : undefined}
        onAddSubTask={() => openAddSubTask(task.id)}
        onToggleExpand={() => toggleExpanded(task.id)}
        selectionMode={selectionMode}
        selected={selectedIds.has(task.id)}
        onSelect={onSelect}
      />
      {isExp && subs.map(sub => (
        <TaskRow key={sub.id} task={sub} isSubTask
          onEdit={onEdit} onEditMemo={onEditMemo} onDelete={onDelete} onStatusChange={onStatusChange}
          assigneeColor={assigneeColorMap.get(getAssigneeKey(sub))}
          selectionMode={selectionMode}
          selected={selectedIds.has(sub.id)}
          onSelect={onSelect}
        />
      ))}
      {isExp && quickAddParentId === task.id ? (
        <QuickAddRow
          autoFocus
          value={quickAddTitle}
          onChange={setQuickAddTitle}
          onCommit={() => commitQuickAddSub(task.id)}
          onCancel={cancelQuickAddSub}
          placeholder="하위 태스크 제목 후 Enter, Esc 취소"
          indent="pl-12"
        />
      ) : isExp && subs.length > 0 && (
        <button
          onClick={() => openAddSubTask(task.id)}
          className="flex items-center gap-1.5 pl-12 pr-4 py-1.5 w-full text-left text-[11px] text-ink-300 hover:text-foreground hover:bg-muted transition-colors border-b border-ink-150"
        >
          <Plus size={10} /> 하위 태스크 추가
        </button>
      )}
    </div>
  )
}

export function NormalView(props: NormalViewProps) {
  const {
    filtered, hasFilter,
    collapsed, toggleCollapse,
    overdueGroup, avgOverdueDays, avgIPDays,
    getGroup, getSubTasks,
    draggingTask, sensors, collisionDetection,
    onDragStart, onDragOver, onDragEnd, onDragCancel, getSortableIds,
    onEdit, onEditMemo, onDelete, onStatusChange, onAdd,
    expandedParents, toggleExpanded, openAddSubTask,
    quickAddStatus, setQuickAddStatus, quickAddParentId, setQuickAddParentId,
    quickAddTitle, setQuickAddTitle,
    commitQuickAdd, cancelQuickAdd, commitQuickAddSub, cancelQuickAddSub,
    selectionMode, selectedIds, onSelect,
    assigneeColorMap, getAssigneeKey,
    quickFilter,
  } = props

  const emptyMsg = quickFilter === 'overdue'       ? '지연된 태스크가 없어요 👍'
                 : quickFilter === 'start-delayed' ? '시작 지연 태스크가 없어요 👍'
                 : quickFilter === 'due-today'     ? '오늘 마감 태스크가 없어요'
                 : quickFilter === 'due-this-week' ? '이번 주 마감 태스크가 없어요'
                 : quickFilter === 'due-next-week' ? '다음 주 마감 태스크가 없어요'
                 : hasFilter                       ? '조건에 맞는 태스크가 없어요'
                 : '태스크가 없어요'

  const groupProps = {
    onEdit, onEditMemo, onDelete, onStatusChange,
    draggingId: draggingTask?.id,
    assigneeColorMap, getAssigneeKey,
    openAddSubTask, toggleExpanded,
    quickAddParentId, quickAddTitle, setQuickAddTitle,
    commitQuickAddSub, cancelQuickAddSub,
    selectionMode, selectedIds, onSelect,
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center px-4 py-2 border-b bg-muted shrink-0 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <div className="w-5 shrink-0 mr-3" />
        <div className="flex-1 mr-4">태스크</div>
        <div className="w-10 shrink-0">메모</div>
        <div className="w-28 shrink-0">담당자</div>
        <div className="w-24 shrink-0">일정</div>
      </div>
      <div data-scrolltop className="flex-1 overflow-y-auto [scrollbar-gutter:stable] bg-card">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-ink-400 gap-2">
            <p className="text-xs">{emptyMsg}</p>
            {!hasFilter && (
              <button onClick={() => onAdd('to-do')} className="text-xs text-foreground hover:text-black">+ 첫 번째 태스크 추가</button>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
            {overdueGroup.length > 0 && (
              <div>
                <button
                  onClick={() => toggleCollapse('__overdue__')}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-muted border-b hover:bg-accent/40 transition-colors"
                >
                  {collapsed.has('__overdue__')
                    ? <ChevronRight size={12} className="text-ink-400 shrink-0" />
                    : <ChevronDown  size={12} className="text-ink-400 shrink-0" />}
                  <span className="w-2 h-2 rounded-full shrink-0 bg-status-late" />
                  <span className="text-xs font-semibold text-status-late">지연</span>
                  <span className="text-[10px] text-ink-400">{overdueGroup.length}</span>
                  {avgOverdueDays > 0 && (
                    <span className="ml-auto text-[10px] text-ink-400">평균 지연 {avgOverdueDays}일</span>
                  )}
                </button>
                {!collapsed.has('__overdue__') && (
                  <SortableContext items={getSortableIds('__overdue__', overdueGroup)} strategy={verticalListSortingStrategy}>
                    {overdueGroup.map(task => {
                      const subs = getSubTasks(task.id)
                      const isExp = expandedParents.has(task.id) || quickAddParentId === task.id
                      return <TaskGroup key={task.id} task={task} subs={subs} isExp={isExp} {...groupProps} />
                    })}
                  </SortableContext>
                )}
              </div>
            )}

            {STATUS_GROUPS.map(({ status, label, color }) => {
              const group = getGroup(status)
              const isCollapsed = collapsed.has(status)
              return (
                <DroppableGroup key={status} status={status}>
                  <button
                    onClick={() => toggleCollapse(status)}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-muted border-b hover:bg-accent/40 transition-colors"
                  >
                    {isCollapsed
                      ? <ChevronRight size={12} className="text-ink-400 shrink-0" />
                      : <ChevronDown  size={12} className="text-ink-400 shrink-0" />}
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
                    <span className="text-[10px] text-ink-400">{group.length}</span>
                    {status === 'in-progress' && avgIPDays > 0 && (
                      <span className="ml-auto text-[10px] text-ink-400">평균 진행 {avgIPDays}일</span>
                    )}
                  </button>
                  {!isCollapsed && (
                    <>
                      <SortableContext items={getSortableIds(status, group)} strategy={verticalListSortingStrategy}>
                        {group.map(task => {
                          const subs = getSubTasks(task.id)
                          const isExp = expandedParents.has(task.id) || quickAddParentId === task.id
                          return <TaskGroup key={task.id} task={task} subs={subs} isExp={isExp} {...groupProps} />
                        })}
                      </SortableContext>
                      {quickAddStatus === status ? (
                        <QuickAddRow
                          autoFocus
                          value={quickAddTitle}
                          onChange={setQuickAddTitle}
                          onCommit={() => commitQuickAdd(status)}
                          onCancel={cancelQuickAdd}
                          placeholder="제목 입력 후 Enter, Esc로 취소"
                          indent="pl-10"
                        />
                      ) : (
                        <button
                          onClick={() => { setQuickAddStatus(status); setQuickAddParentId(null); setQuickAddTitle('') }}
                          className="flex items-center gap-1.5 pl-10 pr-4 py-2 w-full text-left text-xs text-ink-400 hover:text-foreground hover:bg-muted transition-colors border-b border-ink-150"
                        >
                          <Plus size={11} /> 태스크 추가
                        </button>
                      )}
                    </>
                  )}
                </DroppableGroup>
              )
            })}

            <DragOverlay>
              {draggingTask && (
                <div className="bg-card border border-lilac-200 rounded shadow-lg px-4 py-2 text-xs text-ink-700 font-medium opacity-95">
                  {draggingTask.title}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  )
}
