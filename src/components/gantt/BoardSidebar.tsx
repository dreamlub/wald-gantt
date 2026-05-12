'use client'

import { useState } from 'react'
import { FileText, Plus, Trash2, Check, X } from 'lucide-react'
import type { GanttBoard } from '@/types'

interface Props {
  open: boolean
  boards: GanttBoard[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  trashCount?: number
  onOpenTrash?: () => void
}

export function BoardSidebar({ open, boards, selectedId, onSelect, onAdd, onRename, onDelete, trashCount = 0, onOpenTrash }: Props) {
  const [editId, setEditId]   = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [adding, setAdding]   = useState(false)
  const [newName, setNewName] = useState('')

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

  return (
    <div
      className="shrink-0 flex flex-col border-r bg-gray-50 overflow-hidden transition-all duration-200"
      style={{ width: open ? 200 : 0 }}
    >
      {/* 헤더 */}
      <div className="h-12 flex items-center px-4 border-b bg-white shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">파일</span>
      </div>

      {/* 보드 목록 */}
      <div className="flex-1 overflow-y-auto py-1.5 px-1.5 min-h-0">
        {boards.map(board => (
          <div
            key={board.id}
            onClick={() => onSelect(board.id)}
            className={`group flex items-center gap-2 px-2.5 py-2 cursor-pointer rounded-md mb-0.5 ${
              selectedId === board.id
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <FileText size={13} className="shrink-0 opacity-50" />

            {editId === board.id ? (
              <input
                autoFocus
                className="flex-1 text-xs bg-transparent border-b border-indigo-400 outline-none min-w-0"
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={() => commitEdit(board.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(board.id)
                  if (e.key === 'Escape') setEditId(null)
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className="flex-1 text-xs truncate"
                onDoubleClick={e => startEdit(board, e)}
                title={`더블클릭하여 이름 변경: ${board.name}`}
              >
                {board.name}
              </span>
            )}

            {editId !== board.id && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(board.id) }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-400 shrink-0 transition-opacity"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}

        {/* 새 파일 추가 */}
        {adding ? (
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-md">
            <FileText size={13} className="shrink-0 text-gray-400" />
            <input
              autoFocus
              className="flex-1 text-xs border-b border-indigo-400 outline-none bg-transparent min-w-0"
              placeholder="파일명"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitAdd()
                if (e.key === 'Escape') { setAdding(false); setNewName('') }
              }}
            />
            <button onClick={submitAdd} className="p-0.5 text-indigo-500 hover:text-indigo-700 shrink-0">
              <Check size={12} />
            </button>
            <button onClick={() => { setAdding(false); setNewName('') }} className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md mt-0.5"
          >
            <Plus size={13} />
            새 파일
          </button>
        )}
      </div>

      {/* 하단: 휴지통 */}
      <div className="shrink-0 border-t px-1.5 py-1.5">
        <button
          onClick={onOpenTrash}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
        >
          <Trash2 size={13} className="shrink-0" />
          <span className="whitespace-nowrap">휴지통</span>
          {trashCount > 0 && (
            <span className="ml-auto text-[10px] bg-red-100 text-red-400 font-semibold px-1.5 py-0.5 rounded-full">
              {trashCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
