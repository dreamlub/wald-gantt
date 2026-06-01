'use client'

import { useState } from 'react'
import {
  DndContext, closestCenter, DragOverlay,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDndSensors } from '@/lib/dnd-utils'
import { CSS } from '@dnd-kit/utilities'
import { LayoutDashboard, Plus, Trash2, Check, X, GripVertical } from 'lucide-react'
import type { GanttBoard } from '@/types'

interface Props {
  boards: GanttBoard[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (reordered: GanttBoard[]) => Promise<void>
  trashCount?: number
  onOpenTrash?: () => void
}

interface ItemProps {
  board: GanttBoard
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  editId: string | null
  editVal: string
  setEditVal: (v: string) => void
  onStartEdit: (board: GanttBoard, e: React.MouseEvent) => void
  onCommitEdit: (id: string) => void
  onCancelEdit: () => void
}

function SortableBoardItem(props: ItemProps) {
  const { board, selectedId, onSelect, onDelete, editId, editVal, setEditVal, onStartEdit, onCommitEdit, onCancelEdit } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
    >
      <div
        onClick={() => onSelect(board.id)}
        className={`group sidebar-btn cursor-pointer mb-0.5 ${selectedId === board.id ? 'sidebar-btn-active' : ''}`}
      >
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none p-0"
          onClick={e => e.stopPropagation()}
          tabIndex={-1}
          aria-label="드래그 핸들"
        >
          <GripVertical size={12} className="text-ink-300 group-hover:text-ink-400" />
        </button>
        <LayoutDashboard size={13} className="shrink-0 opacity-50" />

        {editId === board.id ? (
          <input
            autoFocus
            className="flex-1 text-sm bg-transparent border-b border-lilac-400 outline-none min-w-0"
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => onCommitEdit(board.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') onCommitEdit(board.id)
              if (e.key === 'Escape') onCancelEdit()
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 text-sm truncate"
            onDoubleClick={e => onStartEdit(board, e)}
            title={`더블클릭하여 이름 변경: ${board.name}`}
          >
            {board.name}
          </span>
        )}

        {editId !== board.id && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(board.id) }}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-ink-300 hover:text-status-late shrink-0 transition-opacity"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

export function BoardSidebar({
  boards, selectedId, onSelect, onAdd, onRename, onDelete, onReorder, trashCount = 0, onOpenTrash
}: Props) {
  const [editId, setEditId]     = useState<string | null>(null)
  const [editVal, setEditVal]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [newName, setNewName]   = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useDndSensors()

  function startEdit(board: GanttBoard, e: React.MouseEvent) {
    e.stopPropagation()
    setEditId(board.id)
    setEditVal(board.name)
  }

  async function commitEdit(id: string) {
    if (editVal.trim()) await onRename(id, editVal.trim())
    setEditId(null)
  }

  async function submitAdd() {
    const name = newName.trim()
    if (name) await onAdd(name)
    setNewName('')
    setAdding(false)
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const oldIndex = boards.findIndex(b => b.id === active.id)
    const newIndex = boards.findIndex(b => b.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    await onReorder(arrayMove(boards, oldIndex, newIndex))
  }

  const activeBoard = activeId ? boards.find(b => b.id === activeId) : null

  return (
    <div
      className="hidden sm:flex shrink-0 flex-col border-r bg-muted overflow-hidden"
      style={{ width: 'var(--sidebar-w)' }}
    >
      {/* 헤더 */}
      <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
        <span className="text-sm font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">프로젝트 관리</span>
      </div>

      {/* 보드 목록 */}
      <div className="flex-1 overflow-y-auto py-1.5 px-1.5 min-h-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={boards.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {boards.map(board => (
              <SortableBoardItem
                key={board.id}
                board={board}
                selectedId={selectedId}
                onSelect={onSelect}
                onDelete={onDelete}
                editId={editId}
                editVal={editVal}
                setEditVal={setEditVal}
                onStartEdit={startEdit}
                onCommitEdit={commitEdit}
                onCancelEdit={() => setEditId(null)}
              />
            ))}
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeBoard ? (
              <div className="flex items-center gap-1.5 px-1.5 py-2 rounded-md shadow-xl bg-card ring-1 ring-ink-200 cursor-grabbing">
                <GripVertical size={12} className="text-ink-400 shrink-0" />
                <LayoutDashboard size={13} className="shrink-0 opacity-50" />
                <span className="flex-1 text-sm truncate text-foreground">{activeBoard.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* 새 보드 추가 */}
        {adding ? (
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-md">
            <LayoutDashboard size={13} className="shrink-0 text-ink-400" />
            <input
              autoFocus
              className="flex-1 text-xs border-b border-lilac-400 outline-none bg-transparent min-w-0"
              placeholder="보드명"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitAdd()
                if (e.key === 'Escape') { setAdding(false); setNewName('') }
              }}
            />
            <button onClick={submitAdd} className="p-0.5 text-lilac-500 hover:text-lilac-600 shrink-0">
              <Check size={12} />
            </button>
            <button onClick={() => { setAdding(false); setNewName('') }} className="p-0.5 text-muted-foreground hover:text-foreground shrink-0">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md mt-0.5"
          >
            <Plus size={13} />
            새 보드
          </button>
        )}
      </div>

      {/* 하단: 휴지통 */}
      <div className="shrink-0 border-t px-1.5 py-1.5">
        <button
          onClick={onOpenTrash}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-ink-400 hover:text-muted-foreground hover:bg-muted rounded-md transition-colors"
        >
          <Trash2 size={13} className="shrink-0" />
          <span className="whitespace-nowrap">휴지통</span>
          {trashCount > 0 && (
            <span className="ml-auto text-3xs bg-status-late/15 text-status-late font-semibold px-1.5 py-0.5 rounded-full">
              {trashCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
