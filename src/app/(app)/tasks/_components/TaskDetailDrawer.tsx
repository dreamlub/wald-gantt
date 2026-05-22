'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, CalendarIcon, Tag, Plus, CheckCircle2, Circle, Trash2, ChevronDown, Copy, RotateCw } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { GanttTask, TaskStatus, TaskType, Priority, RecurrenceRule } from '@/types'
import { fmtDate } from '../_utils'
import { PRIORITY_OPTIONS, PRIORITY_META, PriorityBars, STATUS_COLOR } from '../_constants'
import { toDate, toDateStr } from '@/lib/gantt-utils'
import { AutocompleteInput } from '@/components/AutocompleteInput'
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from '@/components/ui/drawer'
import { TaskHistorySection } from './TaskHistorySection'

type DrawerTab = 'info' | 'memo' | 'history'

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

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog',      label: 'Backlog' },
  { value: 'to-do',       label: 'To-Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done',        label: 'Done' },
  { value: 'pending',     label: 'Pending' },
]

const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: 'daily',   label: '매일' },
  { value: 'weekly',  label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly',  label: '매년' },
]

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
        <CalendarIcon size={13} className="text-ink-400 shrink-0" />
        {value
          ? <span className="text-ink-700">{format(value, 'yyyy.MM.dd', { locale: ko })}</span>
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

interface Props {
  open: boolean
  task: GanttTask | null
  subTasks: GanttTask[]
  parentTask?: GanttTask | null
  initialTab?: DrawerTab
  onClose: () => void
  onSave: (
    task: GanttTask,
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels: string[]; priority: Priority; recurrence_rule: RecurrenceRule | null; recurrence_interval: number | null },
    projectIds: string[]
  ) => Promise<void>
  onDelete: (id: string) => void
  onDuplicate?: (task: GanttTask) => void
  onAddSubTask: (parentId: string, title: string, status: TaskStatus) => Promise<void>
  onStatusChange: (id: string, s: TaskStatus) => void
  onSearchProjects: (query: string) => Promise<ProjectOption[]>
  assigneeSuggestions?: string[]
  labelSuggestions?: string[]
}

export function TaskDetailDrawer({ open, task, subTasks, parentTask, initialTab, onClose, onSave, onDelete, onDuplicate, onAddSubTask, onStatusChange, onSearchProjects, assigneeSuggestions = [], labelSuggestions = [] }: Props) {
  const [title,      setTitle]      = useState('')
  const [status,     setStatus]     = useState<TaskStatus>('to-do')
  const [priority,   setPriority]   = useState<Priority>(2)
  const [assignee,   setAssignee]   = useState('')
  const [startDate,  setStartDate]  = useState<Date | undefined>()
  const [dueDate,    setDueDate]    = useState<Date | undefined>()
  const [memo,       setMemo]       = useState('')
  const [labels,     setLabels]     = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [recurrenceRule,     setRecurrenceRule]     = useState<RecurrenceRule | null>(null)
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1)
  const [subInput,   setSubInput]   = useState('')
  const [addingSub,  setAddingSub]  = useState(false)
  const [labelOpen,  setLabelOpen]  = useState(false)
  const subInputRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  const [linkedProjects, setLinkedProjects] = useState<ProjectOption[]>([])
  const [projSearch,     setProjSearch]     = useState('')
  const [projResults,    setProjResults]    = useState<ProjectOption[]>([])
  const [showProjDrop,   setShowProjDrop]   = useState(false)
  const [tab,            setTab]            = useState<DrawerTab>('info')
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

  // 드로어가 열리거나 task prop이 바뀌면 폼 상태를 task로 동기화 (외부 트리거 기반 → 의도된 setState)
  useEffect(() => {
    if (!open || !task) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setTitle(task.title)
    setStatus(task.status)
    setPriority(task.priority ?? 0)
    setAssignee(task.assignee ?? '')
    setStartDate(toDate(task.start_date))
    setDueDate(toDate(task.due_date))
    setMemo(task.memo ?? '')
    setLabels(task.labels ?? [])
    setLinkedProjects(task.projects ?? [])
    setRecurrenceRule(task.recurrence_rule ?? null)
    setRecurrenceInterval(task.recurrence_interval ?? 1)
    setProjSearch(''); setProjResults([]); setShowProjDrop(false); setLabelInput('')
    setSubInput(''); setAddingSub(false)
    setTab(initialTab ?? 'info')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, task, initialTab])

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
      if (labelRef.current && !labelRef.current.contains(e.target as Node))
        setLabelOpen(false)
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
        priority,
        recurrence_rule: recurrenceRule,
        recurrence_interval: recurrenceRule ? recurrenceInterval : null,
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

  const currentStatusColor = STATUS_COLOR[status]
  const doneCount = subTasks.filter(t => t.status === 'done').length

  return (
    <Drawer open={open} onClose={onClose}>
        {/* 헤더 + 탭 */}
        <DrawerHeader>
          <div className="flex items-center px-5 h-12 gap-1">
            <h2 className="text-xs font-semibold text-foreground flex-1">태스크 수정</h2>
            <div className="flex items-center gap-1">
              {onDuplicate && task && (
                <button
                  onClick={() => { onDuplicate(task); onClose() }}
                  className="p-1 text-ink-300 hover:text-lilac-400 rounded transition-colors"
                  title="복제"
                >
                  <Copy size={14} />
                </button>
              )}
              <button
                onClick={() => { if (task) { onDelete(task.id); onClose() } }}
                className="p-1 text-ink-300 hover:text-status-late rounded transition-colors"
                title="삭제"
              >
                <Trash2 size={14} />
              </button>
              <button onClick={onClose} className="p-1 text-ink-400 hover:text-muted-foreground rounded">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex px-5 gap-4">
            <button
              onClick={() => setTab('info')}
              className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                tab === 'info' ? 'border-lilac-500 text-accent-foreground' : 'border-transparent text-ink-400 hover:text-muted-foreground'
              }`}
            >
              정보
            </button>
            <button
              onClick={() => setTab('memo')}
              className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1 ${
                tab === 'memo' ? 'border-lilac-500 text-accent-foreground' : 'border-transparent text-ink-400 hover:text-muted-foreground'
              }`}
            >
              메모
              {memo.trim() && <span className="w-1 h-1 rounded-full bg-lilac-400" />}
            </button>
            <button
              onClick={() => setTab('history')}
              className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                tab === 'history' ? 'border-lilac-500 text-accent-foreground' : 'border-transparent text-ink-400 hover:text-muted-foreground'
              }`}
            >
              이력
            </button>
          </div>
        </DrawerHeader>

        {/* 바디 */}
        {tab === 'info' ? (
        <DrawerBody className="px-5 py-4 flex flex-col gap-4">

          {/* 제목 — 신규 폼과 동일: 완료 토글 + 밑줄 인풋 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => task && onStatusChange(task.id, task.status === 'done' ? 'to-do' : 'done')}
              className="shrink-0"
              title={task?.status === 'done' ? '완료 취소' : '완료 처리'}
            >
              {task?.status === 'done'
                ? <CheckCircle2 size={16} className="text-mint-500" />
                : <Circle size={16} className="text-ink-300 hover:text-lilac-400 transition-colors" />
              }
            </button>
            <input
              ref={titleRef}
              className="flex-1 text-xs font-medium text-foreground border-b border-border focus:border-lilac-400 outline-none pb-1 placeholder:text-ink-300"
              placeholder="태스크 제목"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* 상태 + 담당자 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <span
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none z-10"
                  style={{ backgroundColor: currentStatusColor }}
                />
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as TaskStatus)}
                  className="w-full text-xs border border-border rounded pl-6 pr-6 py-1.5 outline-none focus:border-lilac-300 appearance-none bg-card text-ink-700"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">담당자</label>
              <AutocompleteInput
                className="mt-1.5 w-full text-xs border border-border rounded px-2.5 py-1.5 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-ink-700"
                placeholder="이름 (없으면 내 할일)"
                value={assignee}
                onChange={setAssignee}
                suggestions={assigneeSuggestions}
              />
            </div>
          </div>

          {/* 시작일 / 마감일 */}
          <div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">시작일</label>
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
                <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">마감일</label>
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
            {dateError && <p className="text-[11px] text-status-late mt-1">{dateError}</p>}
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">우선순위</label>
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
                        : 'border-border text-ink-400 hover:border-ink-300'}`}
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
            <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">연결 프로젝트</label>
            {linkedProjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                {linkedProjects.map(p => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 text-[11px] bg-accent text-accent-foreground border border-lilac-200 px-2 py-0.5 rounded-full"
                  >
                    <span className="text-lilac-400 text-[9px]">{p.board_name}</span>
                    <span>/</span>
                    {p.name}
                    <button
                      onClick={() => setLinkedProjects(prev => prev.filter(lp => lp.id !== p.id))}
                      className="ml-0.5 text-lilac-300 hover:text-accent-foreground"
                    >
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
                        <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold text-ink-400 uppercase tracking-wider bg-muted/50">
                          {board}
                        </div>
                        {list.map(p => (
                          <button
                            key={p.id}
                            onClick={() => linkProject(p)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left"
                          >
                            <span className="text-ink-700">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    ))
                  })()}
                </div>
              )}
              {showProjDrop && projResults.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 py-3 px-3 text-center text-[11px] text-ink-400">
                  {projSearch.trim() ? '검색 결과 없음' : '연결 가능한 프로젝트가 없어요'}
                </div>
              )}
            </div>
          </div>

          {/* 라벨 */}
          <div ref={labelRef}>
            <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
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
              <div className="relative">
                <input
                  className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-border outline-none focus:border-lilac-300 text-muted-foreground placeholder:text-ink-300 min-w-[100px]"
                  placeholder="입력 후 Enter"
                  value={labelInput}
                  onChange={e => { setLabelInput(e.target.value); setLabelOpen(true) }}
                  onFocus={() => setLabelOpen(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel() }
                    if (e.key === 'Escape') setLabelOpen(false)
                  }}
                />
                {labelOpen && (() => {
                  const suggestions = labelSuggestions.filter(s =>
                    !labels.includes(s) && s.toLowerCase().includes(labelInput.toLowerCase())
                  )
                  if (suggestions.length === 0) return null
                  return (
                    <ul className="absolute z-50 left-0 top-full mt-0.5 bg-card border border-border rounded-md shadow-lg py-0.5 max-h-40 overflow-y-auto min-w-[140px]">
                      {suggestions.map(s => (
                        <li
                          key={s}
                          onPointerDown={e => {
                            e.preventDefault()
                            setLabels(prev => [...prev, s])
                            setLabelInput('')
                            setLabelOpen(false)
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] hover:bg-accent cursor-pointer"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: labelColor(s) }} />
                          {s}
                        </li>
                      ))}
                    </ul>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* 반복 */}
          <div className="pt-2 border-t border-border">
            <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <RotateCw size={10} /> 반복
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setRecurrenceRule(null)}
                className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                  recurrenceRule === null
                    ? 'border-lilac-400 bg-lilac-50 text-lilac-600 font-medium'
                    : 'border-border text-ink-400 hover:border-ink-300'
                }`}
              >
                없음
              </button>
              {RECURRENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecurrenceRule(opt.value)}
                  className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
                    recurrenceRule === opt.value
                      ? 'border-lilac-400 bg-lilac-50 text-lilac-600 font-medium'
                      : 'border-border text-ink-400 hover:border-ink-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {recurrenceRule && recurrenceRule !== 'yearly' && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={recurrenceInterval}
                  onChange={e => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 text-xs text-center border border-border rounded px-2 py-1 outline-none focus:border-lilac-300"
                />
                <span className="text-[11px] text-ink-400">
                  {recurrenceRule === 'daily' ? '일마다' : recurrenceRule === 'weekly' ? '주마다' : '개월마다'}
                </span>
              </div>
            )}
          </div>

          {/* 하위 태스크 — 상위 태스크일 때만 표시 */}
          {!task?.parent_id && <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider flex-1">
                하위 태스크{subTasks.length > 0 && ` (${doneCount}/${subTasks.length})`}
              </label>
            </div>
            {subTasks.length > 0 && (
              <div className="flex flex-col gap-0.5 mb-2">
                {subTasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted">
                    <button onClick={() => onStatusChange(sub.id, sub.status === 'done' ? 'to-do' : 'done')} className="shrink-0">
                      {sub.status === 'done'
                        ? <CheckCircle2 size={13} className="text-mint-500" />
                        : <Circle size={13} className="text-ink-300 hover:text-lilac-400 transition-colors" />
                      }
                    </button>
                    <span className={`flex-1 text-xs ${sub.status === 'done' ? 'line-through text-ink-400' : 'text-ink-700'}`}>
                      {sub.title}
                    </span>
                    {sub.due_date && (
                      <span className="text-[10px] text-ink-400 tabular-nums shrink-0">{fmtDate(sub.due_date)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {task && (
              addingSub ? (
                <div className="flex items-center gap-1.5 border border-dashed border-lilac-300 rounded-md px-3 py-1.5 bg-accent/30">
                  <Plus size={11} className="text-lilac-400 shrink-0" />
                  <input
                    ref={subInputRef}
                    autoFocus
                    value={subInput}
                    onChange={e => setSubInput(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const t = subInput.trim()
                        if (!t) return
                        await onAddSubTask(task.id, t, task.status)
                        setSubInput('')
                        subInputRef.current?.focus()
                      }
                      if (e.key === 'Escape') { setAddingSub(false); setSubInput('') }
                    }}
                    onBlur={() => { if (!subInput.trim()) { setAddingSub(false); setSubInput('') } }}
                    placeholder="하위 태스크 제목 후 Enter, Esc 취소"
                    className="flex-1 text-[11px] outline-none placeholder:text-ink-300 bg-transparent text-foreground"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingSub(true)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-border text-[11px] text-ink-400 hover:text-foreground hover:border-ink-400 transition-colors"
                >
                  <Plus size={11} /> 하위 태스크 추가
                </button>
              )
            )}
          </div>}

          {/* 상위 태스크 */}
          {task?.parent_id && parentTask && (
            <div className="pt-2 border-t border-border">
              <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">상위 태스크</span>
              <p className="mt-1 text-sm font-medium text-foreground">
                {parentTask.title}
              </p>
            </div>
          )}
        </DrawerBody>
        ) : tab === 'memo' ? (
        <DrawerBody scrollable={false} className="p-5">
          <textarea
            className="w-full h-full text-xs border border-border rounded p-3 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-ink-700 resize-none leading-relaxed"
            placeholder="메모를 입력하세요"
            value={memo}
            onChange={e => setMemo(e.target.value)}
          />
        </DrawerBody>
        ) : (
        <DrawerBody>
          {task && (
            <>
              <TaskHistorySection taskId={task.id} />
              <div className="text-[10px] text-ink-300 flex flex-col gap-0.5 px-5 py-3 border-t border-border">
                <span>생성일: {fmtDate(task.created_at)}</span>
                <span>수정일: {fmtDate(task.updated_at)}</span>
              </div>
            </>
          )}
        </DrawerBody>
        )}

        {/* 푸터 */}
        <DrawerFooter>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-ink-700 hover:bg-muted rounded transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="px-4 py-1.5 text-xs bg-accent-foreground text-white rounded font-medium hover:bg-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </DrawerFooter>
    </Drawer>
  )
}
