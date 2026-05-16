'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, CalendarIcon, Tag, Plus, CheckCircle2, Circle, Trash2, ChevronDown, Clock, Copy } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { GanttTask, TaskStatus, TaskType, Priority, TaskHistoryEntry } from '@/types'
import { fmtDate } from '../_utils'
import { PRIORITY_OPTIONS, PRIORITY_META, PriorityBars } from '../_constants'
import { getTaskHistory } from '@/lib/gantt-service'
import { toDate, toDateStr } from '@/lib/gantt-utils'
import { AutocompleteInput } from '@/components/AutocompleteInput'

type DrawerTab = 'info' | 'memo' | 'history'

// ── 수정 이력 표시 헬퍼 ──────────────────────────────────────
const HIST_FIELD_LABELS: Record<string, string> = {
  title: '제목', status: '상태', type: '구분',
  assignee: '담당자', start_date: '시작일', due_date: '마감일', priority: '우선순위',
}
const HIST_STATUS_LABELS: Record<string, string> = {
  'to-do': 'To-Do', 'in-progress': 'In Progress', 'pending': 'Pending', 'backlog': 'Backlog', 'done': 'Done',
}
const HIST_TYPE_LABELS: Record<string, string> = { mine: '내 할일', delegated: '업무지시' }
const HIST_PRIORITY_LABELS: Record<string, string> = { '0': '없음', '1': '낮음', '2': '보통', '3': '높음' }

function fmtHistVal(field: string, value: string | null): string {
  if (value === null || value === '') return '없음'
  if (field === 'status')   return HIST_STATUS_LABELS[value] ?? value
  if (field === 'type')     return HIST_TYPE_LABELS[value] ?? value
  if (field === 'priority') return HIST_PRIORITY_LABELS[value] ?? value
  if (field === 'start_date' || field === 'due_date') {
    const [y, m, d] = value.split('-')
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`
  }
  return value
}
function fmtHistDate(iso: string): string {
  const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function groupHistByTime(entries: TaskHistoryEntry[]): TaskHistoryEntry[][] {
  const groups: TaskHistoryEntry[][] = []; let cur: TaskHistoryEntry[] = []
  for (const e of entries) {
    if (cur.length === 0) cur.push(e)
    else if (Math.abs(new Date(cur[0].changed_at).getTime() - new Date(e.changed_at).getTime()) < 10_000) cur.push(e)
    else { groups.push(cur); cur = [e] }
  }
  if (cur.length > 0) groups.push(cur)
  return groups
}

function TaskHistorySection({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<TaskHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  // taskId가 바뀔 때 히스토리 fetch (외부 fetch → setState 의도된 패턴)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getTaskHistory(taskId).then(setEntries).catch(console.error).finally(() => setLoading(false))
  }, [taskId])
  const groups = groupHistByTime(entries)
  return (
    <div className="flex flex-col">
      {loading ? (
        <div className="flex items-center justify-center h-20 text-ink-400 text-xs">로딩 중...</div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-28 text-ink-300 text-xs gap-1">
          <Clock size={20} className="opacity-30" />
          수정 이력이 없습니다
        </div>
      ) : groups.map((group, gi) => (
        <div key={gi} className="px-5 py-3 border-b last:border-0 hover:bg-muted transition-colors">
          <div className="text-[10px] text-ink-400 font-medium mb-1.5 tabular-nums">{fmtHistDate(group[0].changed_at)}</div>
          <div className="space-y-1">
            {group.map(entry => (
              <div key={entry.id} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground font-semibold w-12 shrink-0">{HIST_FIELD_LABELS[entry.field_name] ?? entry.field_name}</span>
                <span className="text-[11px] text-ink-400 line-through">{fmtHistVal(entry.field_name, entry.old_value)}</span>
                <span className="text-[10px] text-ink-300">→</span>
                <span className="text-[11px] text-ink-700 font-medium">{fmtHistVal(entry.field_name, entry.new_value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

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
  onClose: () => void
  onSave: (
    task: GanttTask,
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels: string[]; priority: Priority },
    projectIds: string[]
  ) => Promise<void>
  onDelete: (id: string) => void
  onDuplicate?: (task: GanttTask) => void
  onAddSubTask: (parentId: string, status: TaskStatus) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  onSearchProjects: (query: string) => Promise<ProjectOption[]>
  assigneeSuggestions?: string[]
}

export function TaskDetailDrawer({ open, task, subTasks, onClose, onSave, onDelete, onDuplicate, onAddSubTask, onStatusChange, onSearchProjects, assigneeSuggestions = [] }: Props) {
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
    setProjSearch(''); setProjResults([]); setShowProjDrop(false); setLabelInput('')
    setTab('info')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, task])

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
        className={`absolute right-0 top-0 h-full w-[480px] bg-card shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* 헤더 + 탭 */}
        <div className="shrink-0 border-b">
          <div className="flex items-center px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-foreground flex-1">태스크 수정</h2>
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
        </div>

        {/* 바디 */}
        {tab === 'info' ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

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
              className="flex-1 text-sm font-medium text-foreground border-b border-border focus:border-lilac-400 outline-none pb-1 placeholder:text-ink-300"
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
          <div>
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
              <input
                className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-border outline-none focus:border-lilac-300 text-muted-foreground placeholder:text-ink-300 min-w-[100px]"
                placeholder="입력 후 Enter"
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel() }
                }}
              />
            </div>
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
              <button
                onClick={() => { onAddSubTask(task.id, task.status); onClose() }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-border text-[11px] text-ink-400 hover:text-foreground hover:border-ink-400 transition-colors"
              >
                <Plus size={11} /> 하위 태스크 추가
              </button>
            )}
          </div>}

          {/* 메타 정보 */}
          {task && (
            <div className="text-[10px] text-ink-300 flex flex-col gap-0.5 pt-2 border-t border-border">
              <span>생성일: {fmtDate(task.created_at)}</span>
              <span>수정일: {fmtDate(task.updated_at)}</span>
              {task.parent_id && <span className="text-lilac-300">· 상위 태스크의 하위 항목</span>}
            </div>
          )}
        </div>
        ) : tab === 'memo' ? (
        <div className="flex-1 overflow-hidden p-5">
          <textarea
            className="w-full h-full text-xs border border-border rounded p-3 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-ink-700 resize-none leading-relaxed"
            placeholder="메모를 입력하세요"
            value={memo}
            onChange={e => setMemo(e.target.value)}
          />
        </div>
        ) : (
        <div className="flex-1 overflow-y-auto">
          {task && <TaskHistorySection taskId={task.id} />}
        </div>
        )}

        {/* 푸터 */}
        <div className="shrink-0 px-5 py-3 border-t flex justify-end gap-2">
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
        </div>
      </div>
    </div>
  )
}
