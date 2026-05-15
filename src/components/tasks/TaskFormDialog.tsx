'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Search, ChevronDown, CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { GanttTask, TaskStatus, TaskType, Priority } from '@/types'
import { PRIORITY_OPTIONS, PRIORITY_META, PriorityBars } from '@/app/(app)/tasks/_constants'

interface ProjectOption {
  id: string
  name: string
  board_name: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSave: (
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; priority: Priority },
    projectIds: string[]
  ) => Promise<void>
  editTask?: GanttTask | null
  defaultStatus?: TaskStatus
  defaultProjects?: ProjectOption[]
  onSearchProjects: (query: string) => Promise<ProjectOption[]>
  assigneeSuggestions?: string[]
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'backlog',      label: 'Backlog',      color: '#94a3b8' },
  { value: 'to-do',       label: 'To-Do',        color: '#6366f1' },
  { value: 'in-progress', label: 'In Progress',  color: '#f59e0b' },
  { value: 'done',        label: 'Done',         color: '#22c55e' },
  { value: 'pending',     label: 'Pending',      color: '#f97316' },
]

// ── 유틸 ─────────────────────────────────────────────────────
function toDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function toDateStr(d: Date | undefined): string | null {
  if (!d) return null
  return format(d, 'yyyy-MM-dd')
}

// ── AutocompleteInput ────────────────────────────────────────
function AutocompleteInput({ value, onChange, suggestions, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close])

  return (
    <div ref={containerRef} className="relative">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') close() }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-gray-200 rounded-md shadow-lg py-0.5 max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <li
              key={s}
              onPointerDown={e => { e.preventDefault(); onChange(s); close() }}
              className="px-2.5 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── DatePickerButton ─────────────────────────────────────────
function DatePickerButton({ value, onChange, placeholder, disabledDates }: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder: string
  disabledDates?: (date: Date) => boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs h-8 font-normal transition-colors hover:bg-gray-50 focus:outline-none focus:border-indigo-300">
        <CalendarIcon size={13} className="text-gray-400 shrink-0" />
        {value
          ? <span className="text-gray-700">{format(value, 'yyyy.MM.dd', { locale: ko })}</span>
          : <span className="text-gray-300">{placeholder}</span>
        }
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value}
          onSelect={d => { onChange(d); setOpen(false) }}
          locale={ko}
          disabled={disabledDates}
        />
      </PopoverContent>
    </Popover>
  )
}

// ── TaskFormDialog ────────────────────────────────────────────
export function TaskFormDialog({ open, onClose, onSave, editTask, defaultStatus = 'to-do', defaultProjects, onSearchProjects, assigneeSuggestions = [] }: Props) {
  const [title,     setTitle]     = useState('')
  const [status,    setStatus]    = useState<TaskStatus>('to-do')
  const [priority,  setPriority]  = useState<Priority>(2)
  const [assignee,  setAssignee]  = useState('')
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [dueDate,   setDueDate]   = useState<Date | undefined>(undefined)
  const [memo,      setMemo]      = useState('')
  const [saving,    setSaving]    = useState(false)

  const [linkedProjects, setLinkedProjects] = useState<ProjectOption[]>([])
  const [projSearch,     setProjSearch]     = useState('')
  const [projResults,    setProjResults]    = useState<ProjectOption[]>([])
  const [showProjDrop,   setShowProjDrop]   = useState(false)
  const projRef  = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  // validation
  const dateError = startDate && dueDate && startDate > dueDate
    ? '시작일이 마감일보다 늦을 수 없어요' : null
  const isValid = title.trim().length > 0 && !dateError

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 310)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (editTask) {
      setTitle(editTask.title)
      setStatus(editTask.status)
      setPriority(editTask.priority ?? 0)
      setAssignee(editTask.assignee ?? '')
      setStartDate(toDate(editTask.start_date))
      setDueDate(toDate(editTask.due_date))
      setMemo(editTask.memo ?? '')
      setLinkedProjects(editTask.projects ?? [])
    } else {
      setTitle(''); setStatus(defaultStatus); setPriority(2)
      setAssignee(''); setStartDate(undefined); setDueDate(undefined); setMemo('')
      setLinkedProjects(defaultProjects ?? [])
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

  async function handleSave() {
    if (!isValid) return
    setSaving(true)
    try {
      const trimmedAssignee = assignee.trim() || null
      await onSave(
        {
          title: title.trim(),
          status,
          type: trimmedAssignee ? 'delegated' : 'mine',
          assignee: trimmedAssignee,
          start_date: toDateStr(startDate),
          due_date: toDateStr(dueDate),
          memo: memo.trim() || null,
          priority,
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
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div
        className={`absolute right-0 top-0 h-full w-[440px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 flex-1">
            {editTask ? '태스크 수정' : '새 태스크'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* 제목 */}
          <input
            ref={titleRef}
            className="w-full text-sm font-medium text-gray-800 border-b border-gray-200 focus:border-indigo-400 outline-none pb-1 placeholder:text-gray-300"
            placeholder="태스크 제목"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />

          {/* 상태 + 담당자 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <span
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none z-10"
                  style={{ backgroundColor: STATUS_OPTIONS.find(s => s.value === status)?.color ?? '#94a3b8' }}
                />
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as TaskStatus)}
                  className="w-full text-xs border border-gray-200 rounded pl-6 pr-6 py-1.5 outline-none focus:border-indigo-300 appearance-none bg-white text-gray-700"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">담당자</label>
              <AutocompleteInput
                className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-indigo-300 placeholder:text-gray-300 text-gray-700"
                placeholder="이름 (없으면 내 할일)"
                value={assignee}
                onChange={setAssignee}
                suggestions={assigneeSuggestions}
              />
            </div>
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">우선순위</label>
            <div className="flex items-center gap-1 mt-1.5">
              {PRIORITY_OPTIONS.map(opt => {
                const meta = PRIORITY_META[opt.value]
                const active = priority === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex items-center gap-0.5 text-[11px] px-2 py-1 rounded border transition-colors
                      ${active
                        ? 'font-medium border-current'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                    style={active && opt.value > 0 ? { color: meta.color, borderColor: meta.color, backgroundColor: meta.color + '14' } : {}}
                  >
                    {opt.value > 0 && <PriorityBars priority={opt.value} />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 시작일 / 마감일 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">시작일</label>
                <div className="mt-1.5">
                  <DatePickerButton
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="날짜 선택"
                    disabledDates={dueDate ? d => d > dueDate : undefined}
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">마감일</label>
                <div className="mt-1.5">
                  <DatePickerButton
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="날짜 선택"
                    disabledDates={startDate ? d => d < startDate : undefined}
                  />
                </div>
              </div>
            </div>
            {dateError && (
              <p className="text-[11px] text-red-500">{dateError}</p>
            )}
          </div>

          {/* 연결 프로젝트 */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">연결 프로젝트</label>
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

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : editTask ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}
