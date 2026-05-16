'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { GanttTask, TaskStatus, TaskType, Priority } from '@/types'
import { PRIORITY_OPTIONS, PRIORITY_META, PriorityBars } from '@/app/(app)/tasks/_constants'
import { toDate, toDateStr } from '@/lib/gantt-utils'
import { AutocompleteInput } from '@/components/AutocompleteInput'

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
      <PopoverTrigger className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-border bg-card px-2 text-xs h-8 font-normal transition-colors hover:bg-muted focus:outline-none focus:border-lilac-300">
        <CalendarIcon size={13} className="text-muted-foreground shrink-0" />
        {value
          ? <span className="text-foreground">{format(value, 'yyyy.MM.dd', { locale: ko })}</span>
          : <span className="text-ink-300">{placeholder}</span>
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
    if (!showProjDrop) return
    const timer = setTimeout(async () => {
      const results = await onSearchProjects(projSearch)
      setProjResults(results.filter(r => !linkedProjects.some(l => l.id === r.id)))
    }, projSearch.trim() ? 200 : 0)
    return () => clearTimeout(timer)
  }, [projSearch, linkedProjects, onSearchProjects, showProjDrop])

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
        className={`absolute right-0 top-0 h-full w-[440px] bg-card shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold text-foreground flex-1">
            {editTask ? '태스크 수정' : '새 태스크'}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* 제목 */}
          <input
            ref={titleRef}
            className="w-full text-sm font-medium text-foreground border-b border-border focus:border-lilac-400 outline-none pb-1 placeholder:text-ink-300"
            placeholder="태스크 제목"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />

          {/* 상태 + 담당자 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <span
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none z-10"
                  style={{ backgroundColor: STATUS_OPTIONS.find(s => s.value === status)?.color ?? '#94a3b8' }}
                />
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as TaskStatus)}
                  className="w-full text-xs border border-border rounded pl-6 pr-6 py-1.5 outline-none focus:border-lilac-300 appearance-none bg-card text-foreground"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="flex-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">담당자</label>
              <AutocompleteInput
                className="mt-1.5 w-full text-xs border border-border rounded px-2.5 py-1.5 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-foreground"
                placeholder="이름 (없으면 내 할일)"
                value={assignee}
                onChange={setAssignee}
                suggestions={assigneeSuggestions}
              />
            </div>
          </div>

          {/* 시작일 / 마감일 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">시작일</label>
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
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">마감일</label>
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
              <p className="text-[11px] text-status-late">{dateError}</p>
            )}
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">우선순위</label>
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
                        : 'border-border text-muted-foreground hover:border-ink-300'}`}
                    style={active && opt.value > 0 ? { color: meta.color, borderColor: meta.color, backgroundColor: meta.color + '14' } : {}}
                  >
                    {opt.value > 0 && <PriorityBars priority={opt.value} />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 연결 프로젝트 */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">연결 프로젝트</label>
            {linkedProjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                {linkedProjects.map(p => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 text-[11px] bg-lilac-100 text-lilac-600 border border-lilac-300 px-2 py-0.5 rounded-full"
                  >
                    <span className="text-lilac-400 text-[9px]">{p.board_name}</span>
                    <span>/</span>
                    {p.name}
                    <button onClick={() => unlinkProject(p.id)} className="ml-0.5 text-lilac-300 hover:text-lilac-600">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative mt-1.5" ref={projRef}>
              <div className="flex items-center border border-border rounded px-2.5 gap-1.5 focus-within:border-lilac-300">
                <Search size={11} className="text-ink-300 shrink-0" />
                <input
                  className="flex-1 text-xs py-1.5 outline-none placeholder:text-ink-300"
                  placeholder="클릭해서 전체 보기 / 검색"
                  value={projSearch}
                  onChange={e => { setProjSearch(e.target.value); setShowProjDrop(true) }}
                  onFocus={() => setShowProjDrop(true)}
                />
                <ChevronDown size={11} className="text-ink-300 shrink-0" />
              </div>
              {showProjDrop && projResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 py-1 max-h-60 overflow-y-auto">
                  {(() => {
                    const groups = projResults.reduce<Record<string, ProjectOption[]>>((acc, p) => {
                      const key = p.board_name || '(보드 없음)'
                      ;(acc[key] ??= []).push(p)
                      return acc
                    }, {})
                    return Object.entries(groups).map(([board, list]) => (
                      <div key={board}>
                        <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                          {board}
                        </div>
                        {list.map(p => (
                          <button
                            key={p.id}
                            onClick={() => linkProject(p)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left"
                          >
                            <span className="text-foreground">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    ))
                  })()}
                </div>
              )}
              {showProjDrop && projResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 py-3 px-3 text-center text-[11px] text-muted-foreground">
                  {projSearch.trim() ? '검색 결과 없음' : '연결 가능한 프로젝트가 없어요'}
                </div>
              )}
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">메모</label>
            <textarea
              className="mt-1.5 w-full text-xs border border-border rounded px-2.5 py-2 outline-none focus:border-lilac-300 placeholder:text-ink-300 resize-none"
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
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="px-4 py-1.5 text-xs bg-foreground text-background rounded font-medium hover:bg-ink-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : editTask ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}
