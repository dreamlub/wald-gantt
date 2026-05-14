'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, CalendarIcon, Tag, Plus, CheckCircle2, Circle, Trash2, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { GanttTask, TaskStatus, TaskType } from '@/types'
import { fmtDate } from '../_utils'

interface ProjectOption {
  id: string
  name: string
  board_name: string
}

const LABEL_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#64748b',
]

export function labelColor(name: string): string {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return LABEL_COLORS[hash % LABEL_COLORS.length]
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'backlog',      label: 'Backlog',      color: '#94a3b8' },
  { value: 'to-do',       label: 'To-Do',        color: '#6366f1' },
  { value: 'in-progress', label: 'In Progress',  color: '#f59e0b' },
  { value: 'done',        label: 'Done',         color: '#22c55e' },
  { value: 'pending',     label: 'Pending',      color: '#f97316' },
]

function toDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}
function toDateStr(d: Date | undefined): string | null {
  if (!d) return null
  return format(d, 'yyyy-MM-dd')
}

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

interface Props {
  open: boolean
  task: GanttTask | null
  subTasks: GanttTask[]
  onClose: () => void
  onSave: (
    task: GanttTask,
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels: string[] },
    projectIds: string[]
  ) => Promise<void>
  onDelete: (id: string) => void
  onAddSubTask: (parentId: string, status: TaskStatus) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  onSearchProjects: (query: string) => Promise<ProjectOption[]>
}

export function TaskDetailDrawer({ open, task, subTasks, onClose, onSave, onDelete, onAddSubTask, onStatusChange, onSearchProjects }: Props) {
  const [title,      setTitle]      = useState('')
  const [status,     setStatus]     = useState<TaskStatus>('to-do')
  const [assignee,   setAssignee]   = useState('')
  const [startDate,  setStartDate]  = useState<Date | undefined>()
  const [dueDate,    setDueDate]    = useState<Date | undefined>()
  const [memo,       setMemo]       = useState('')
  const [labels,     setLabels]     = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [saving,     setSaving]     = useState(false)

  const [linkedProjects, setLinkedProjects] = useState<ProjectOption[]>([])
  const [projSearch,     setProjSearch]     = useState('')
  const [projResults,    setProjResults]    = useState<ProjectOption[]>([])
  const [showProjDrop,   setShowProjDrop]   = useState(false)
  const projRef  = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

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
    if (!open || !task) return
    setTitle(task.title)
    setStatus(task.status)
    setAssignee(task.assignee ?? '')
    setStartDate(toDate(task.start_date))
    setDueDate(toDate(task.due_date))
    setMemo(task.memo ?? '')
    setLabels(task.labels ?? [])
    setLinkedProjects(task.projects ?? [])
    setProjSearch(''); setProjResults([]); setShowProjDrop(false); setLabelInput('')
  }, [open, task])

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
    if (!isValid || !task) return
    setSaving(true)
    try {
      const trimmedAssignee = assignee.trim() || null
      await onSave(task, {
        title: title.trim(),
        status,
        type: trimmedAssignee ? 'delegated' : 'mine',
        assignee: trimmedAssignee,
        start_date: toDateStr(startDate),
        due_date: toDateStr(dueDate),
        memo: memo.trim() || null,
        labels,
      }, linkedProjects.map(p => p.id))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function addLabel() {
    const val = labelInput.trim()
    if (!val || labels.includes(val)) { setLabelInput(''); return }
    setLabels(prev => [...prev, val])
    setLabelInput('')
  }

  function linkProject(p: ProjectOption) {
    setLinkedProjects(prev => [...prev, p])
    setProjSearch(''); setProjResults([]); setShowProjDrop(false)
  }

  const currentStatusColor = STATUS_OPTIONS.find(s => s.value === status)?.color ?? '#94a3b8'
  const doneCount = subTasks.filter(t => t.status === 'done').length

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-[480px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* 헤더 — 신규 폼과 동일한 구조 */}
        <div className="flex items-center px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 flex-1">태스크 수정</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { if (task) { onDelete(task.id); onClose() } }}
              className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors"
              title="삭제"
            >
              <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {/* 제목 — 신규 폼과 동일: 완료 토글 + 밑줄 인풋 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => task && onStatusChange(task.id, task.status === 'done' ? 'to-do' : 'done')}
              className="shrink-0"
              title={task?.status === 'done' ? '완료 취소' : '완료 처리'}
            >
              {task?.status === 'done'
                ? <CheckCircle2 size={16} className="text-green-400" />
                : <Circle size={16} className="text-gray-300 hover:text-indigo-400 transition-colors" />
              }
            </button>
            <input
              ref={titleRef}
              className="flex-1 text-sm font-medium text-gray-800 border-b border-gray-200 focus:border-indigo-400 outline-none pb-1 placeholder:text-gray-300"
              placeholder="태스크 제목"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* 상태 + 담당자 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <span
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none z-10"
                  style={{ backgroundColor: currentStatusColor }}
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
              <input
                className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-indigo-300 placeholder:text-gray-300 text-gray-700"
                placeholder="이름 (없으면 내 할일)"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
              />
            </div>
          </div>

          {/* 라벨 */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <Tag size={10} /> 라벨
            </label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map(l => (
                <button
                  key={l}
                  onClick={() => setLabels(prev => prev.filter(x => x !== l))}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full text-white font-medium hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: labelColor(l) }}
                  title="클릭해서 삭제"
                >
                  {l} <X size={9} />
                </button>
              ))}
              <input
                className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-gray-200 outline-none focus:border-indigo-300 text-gray-600 placeholder:text-gray-300 min-w-[100px]"
                placeholder="입력 후 Enter"
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel() }
                }}
              />
            </div>
          </div>

          {/* 시작일 / 마감일 */}
          <div>
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
            {dateError && <p className="text-[11px] text-red-500 mt-1">{dateError}</p>}
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
                    <button
                      onClick={() => setLinkedProjects(prev => prev.filter(lp => lp.id !== p.id))}
                      className="ml-0.5 text-indigo-300 hover:text-indigo-600"
                    >
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
              placeholder="메모를 입력하세요"
              rows={3}
              value={memo}
              onChange={e => setMemo(e.target.value)}
            />
          </div>

          {/* 하위 태스크 — 상위 태스크일 때만 표시 */}
          {!task?.parent_id && <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex-1">
                하위 태스크{subTasks.length > 0 && ` (${doneCount}/${subTasks.length})`}
              </label>
              {task && (
                <button
                  onClick={() => { onAddSubTask(task.id, task.status); onClose() }}
                  className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-indigo-500 transition-colors"
                >
                  <Plus size={10} /> 추가
                </button>
              )}
            </div>
            {subTasks.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {subTasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50">
                    <button onClick={() => onStatusChange(sub.id, sub.status === 'done' ? 'to-do' : 'done')} className="shrink-0">
                      {sub.status === 'done'
                        ? <CheckCircle2 size={13} className="text-green-400" />
                        : <Circle size={13} className="text-gray-300 hover:text-indigo-400 transition-colors" />
                      }
                    </button>
                    <span className={`flex-1 text-xs ${sub.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {sub.title}
                    </span>
                    {sub.due_date && (
                      <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{fmtDate(sub.due_date)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : task && (
              <button
                onClick={() => { onAddSubTask(task.id, task.status); onClose() }}
                className="w-full flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-gray-200 text-[11px] text-gray-300 hover:text-indigo-400 hover:border-indigo-300 transition-colors"
              >
                <Plus size={11} /> 하위 태스크 추가
              </button>
            )}
          </div>}

          {/* 메타 정보 */}
          {task && (
            <div className="text-[10px] text-gray-300 flex flex-col gap-0.5 pt-2 border-t border-gray-100">
              <span>생성일: {fmtDate(task.created_at)}</span>
              <span>수정일: {fmtDate(task.updated_at)}</span>
              {task.parent_id && <span className="text-indigo-300">· 상위 태스크의 하위 항목</span>}
            </div>
          )}
        </div>

        {/* 푸터 */}
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
            className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
