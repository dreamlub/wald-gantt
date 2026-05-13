'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown } from 'lucide-react'
import type { GanttTask, TaskStatus, TaskType } from '@/types'

interface ProjectOption {
  id: string
  name: string
  board_name: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSave: (
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; due_date: string | null; memo: string | null },
    projectIds: string[]
  ) => Promise<void>
  editTask?: GanttTask | null
  onSearchProjects: (query: string) => Promise<ProjectOption[]>
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog',     label: 'Backlog' },
  { value: 'to-do',      label: 'To-Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done',       label: 'Done' },
]

export function TaskFormDialog({ open, onClose, onSave, editTask, onSearchProjects }: Props) {
  const [title, setTitle]           = useState('')
  const [status, setStatus]         = useState<TaskStatus>('to-do')
  const [type, setType]             = useState<TaskType>('mine')
  const [assignee, setAssignee]     = useState('')
  const [dueDate, setDueDate]       = useState('')
  const [memo, setMemo]             = useState('')
  const [saving, setSaving]         = useState(false)

  // 프로젝트 연결
  const [linkedProjects, setLinkedProjects] = useState<ProjectOption[]>([])
  const [projSearch, setProjSearch]         = useState('')
  const [projResults, setProjResults]       = useState<ProjectOption[]>([])
  const [showProjDrop, setShowProjDrop]     = useState(false)
  const projRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    if (editTask) {
      setTitle(editTask.title)
      setStatus(editTask.status)
      setType(editTask.type)
      setAssignee(editTask.assignee ?? '')
      setDueDate(editTask.due_date ?? '')
      setMemo(editTask.memo ?? '')
      setLinkedProjects(editTask.projects ?? [])
    } else {
      setTitle(''); setStatus('to-do'); setType('mine')
      setAssignee(''); setDueDate(''); setMemo('')
      setLinkedProjects([])
    }
    setProjSearch(''); setProjResults([]); setShowProjDrop(false)
  }, [open, editTask])

  useEffect(() => {
    if (!projSearch.trim()) { setProjResults([]); return }
    const timer = setTimeout(async () => {
      const results = await onSearchProjects(projSearch)
      setProjResults(results.filter(r => !linkedProjects.some(l => l.id === r.id)))
    }, 200)
    return () => clearTimeout(timer)
  }, [projSearch, linkedProjects, onSearchProjects])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (projRef.current && !projRef.current.contains(e.target as Node))
        setShowProjDrop(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!open) return null

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave(
        {
          title: title.trim(),
          status,
          type,
          assignee: type === 'delegated' && assignee.trim() ? assignee.trim() : null,
          due_date: dueDate || null,
          memo: memo.trim() || null,
        },
        linkedProjects.map(p => p.id)
      )
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function linkProject(p: ProjectOption) {
    setLinkedProjects(prev => [...prev, p])
    setProjSearch(''); setProjResults([]); setShowProjDrop(false)
  }

  function unlinkProject(id: string) {
    setLinkedProjects(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center px-5 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-800 flex-1">
            {editTask ? '태스크 수정' : '새 태스크'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* 폼 */}
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* 제목 */}
          <div>
            <input
              autoFocus
              className="w-full text-sm font-medium text-gray-800 border-b border-gray-200 focus:border-indigo-400 outline-none pb-1 placeholder:text-gray-300"
              placeholder="태스크 제목"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* 구분 + 상태 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">구분</label>
              <div className="flex gap-1.5 mt-1.5">
                {(['mine', 'delegated'] as TaskType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded border transition-colors ${
                      type === t
                        ? t === 'mine'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {t === 'mine' ? '내 할일' : '업무지시'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as TaskStatus)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-indigo-300 appearance-none bg-white text-gray-700"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 담당자 (업무지시일 때만) */}
          {type === 'delegated' && (
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">담당자</label>
              <input
                className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-indigo-300 placeholder:text-gray-300"
                placeholder="담당자 이름"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
              />
            </div>
          )}

          {/* 마감일 */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">마감일</label>
            <input
              type="date"
              className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-indigo-300 text-gray-700"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          {/* 프로젝트 연결 */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">연결 프로젝트</label>
            {/* 연결된 프로젝트 태그 */}
            {linkedProjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                {linkedProjects.map(p => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full"
                  >
                    <span className="text-indigo-400 text-[9px]">{p.board_name}</span>
                    <span>/</span>
                    {p.name}
                    <button onClick={() => unlinkProject(p.id)} className="ml-0.5 text-indigo-300 hover:text-indigo-600">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* 프로젝트 검색 */}
            <div className="relative mt-1.5" ref={projRef}>
              <div className="flex items-center border border-gray-200 rounded px-2.5 gap-1.5 focus-within:border-indigo-300">
                <Search size={11} className="text-gray-300 shrink-0" />
                <input
                  className="flex-1 text-xs py-1.5 outline-none placeholder:text-gray-300"
                  placeholder="프로젝트 검색..."
                  value={projSearch}
                  onChange={e => { setProjSearch(e.target.value); setShowProjDrop(true) }}
                  onFocus={() => projSearch && setShowProjDrop(true)}
                />
              </div>
              {showProjDrop && projResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 py-1 max-h-48 overflow-y-auto">
                  {projResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => linkProject(p)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left"
                    >
                      <span className="text-gray-400 shrink-0">{p.board_name}</span>
                      <span className="text-gray-300">/</span>
                      <span className="text-gray-700">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">메모</label>
            <textarea
              className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-2 outline-none focus:border-indigo-300 placeholder:text-gray-300 resize-none"
              placeholder="메모"
              rows={3}
              value={memo}
              onChange={e => setMemo(e.target.value)}
            />
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : editTask ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}
