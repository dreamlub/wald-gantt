'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, Tag, RotateCw } from 'lucide-react'
import type { GanttTask, TaskStatus, TaskType, Priority, RecurrenceRule } from '@/types'
import { PRIORITY_OPTIONS, PRIORITY_META, PriorityBars, STATUS_COLOR } from '@/app/(app)/tasks/_constants'
import { toDate, toDateStr } from '@/lib/gantt-utils'
import { AutocompleteInput } from '@/components/AutocompleteInput'
import { labelColor } from '@/app/(app)/tasks/_utils'
import { DatePickerButton } from '@/components/ui/date-picker-button'
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from '@/components/ui/drawer'
import { TaskHistorySection } from '@/app/(app)/tasks/_components/TaskHistorySection'

type FormTab = 'info' | 'memo' | 'history'

interface ProjectOption {
  id: string
  name: string
  board_name: string
}

const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: 'daily',   label: '매일' },
  { value: 'weekly',  label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly',  label: '매년' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSave: (
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; priority: Priority; labels: string[]; recurrence_rule: RecurrenceRule | null; recurrence_interval: number | null },
    projectIds: string[]
  ) => Promise<void>
  editTask?: GanttTask | null
  parentTask?: GanttTask | null
  defaultStatus?: TaskStatus
  defaultProjects?: ProjectOption[]
  onSearchProjects: (query: string) => Promise<ProjectOption[]>
  assigneeSuggestions?: string[]
  labelSuggestions?: string[]
  initialTitle?: string
  initialMemo?: string
  initialTab?: FormTab
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog',      label: 'Backlog' },
  { value: 'to-do',       label: 'To-Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done',        label: 'Done' },
  { value: 'pending',     label: 'Pending' },
]


// ── TaskFormDialog ────────────────────────────────────────────
export function TaskFormDialog({ open, onClose, onSave, editTask, parentTask, defaultStatus = 'to-do', defaultProjects, onSearchProjects, assigneeSuggestions = [], labelSuggestions = [], initialTitle, initialMemo, initialTab = 'info' }: Props) {
  const [tab,       setTab]       = useState<FormTab>('info')
  const [title,     setTitle]     = useState('')
  const [status,    setStatus]    = useState<TaskStatus>('to-do')
  const [priority,  setPriority]  = useState<Priority>(2)
  const [assignee,  setAssignee]  = useState('')
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [dueDate,   setDueDate]   = useState<Date | undefined>(undefined)
  const [memo,      setMemo]      = useState('')
  const [labels,    setLabels]    = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [labelOpen,  setLabelOpen]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [recurrenceRule,     setRecurrenceRule]     = useState<RecurrenceRule | null>(null)
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1)

  const [linkedProjects, setLinkedProjects] = useState<ProjectOption[]>([])
  const [projSearch,     setProjSearch]     = useState('')
  const [projResults,    setProjResults]    = useState<ProjectOption[]>([])
  const [showProjDrop,   setShowProjDrop]   = useState(false)
  const projRef  = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const memoRef  = useRef<HTMLTextAreaElement>(null)

  // validation
  const dateError = startDate && dueDate && startDate > dueDate
    ? '시작일이 마감일보다 늦을 수 없어요' : null
  const isValid = title.trim().length > 0 && !dateError

  // open 시 탭 설정 + 포커스
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab(initialTab)
      const t = setTimeout(() => {
        if (initialTab === 'memo') memoRef.current?.focus()
        else titleRef.current?.focus()
      }, 310)
      return () => clearTimeout(t)
    }
  }, [open, initialTab])

  // open/editTask 변경 시 폼 상태 동기화 (외부 트리거 기반 → 의도된 setState)
  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    if (editTask) {
      setTitle(editTask.title)
      setStatus(editTask.status)
      setPriority(editTask.priority ?? 0)
      setAssignee(editTask.assignee ?? '')
      setStartDate(toDate(editTask.start_date))
      setDueDate(toDate(editTask.due_date))
      setMemo(editTask.memo ?? '')
      setLabels(editTask.labels ?? [])
      setLinkedProjects(editTask.projects ?? [])
      setRecurrenceRule(editTask.recurrence_rule ?? null)
      setRecurrenceInterval(editTask.recurrence_interval ?? 1)
    } else {

      setTitle(initialTitle ?? ''); setStatus(defaultStatus); setPriority(2)

      setAssignee(''); setStartDate(undefined); setDueDate(undefined); setMemo(initialMemo ?? '')
      setLabels([]); setLinkedProjects(defaultProjects ?? [])
      setRecurrenceRule(null); setRecurrenceInterval(1)
    }
    setProjSearch(''); setProjResults([]); setShowProjDrop(false); setLabelInput(''); setLabelOpen(false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editTask, defaultStatus, defaultProjects, initialTitle, initialMemo])

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
          labels,
          recurrence_rule: recurrenceRule,
          recurrence_interval: recurrenceRule ? recurrenceInterval : null,
        },
        linkedProjects.map(p => p.id)
      )
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

  function unlinkProject(id: string) {
    setLinkedProjects(prev => prev.filter(p => p.id !== id))
  }

  return (
    <Drawer open={open} onClose={onClose} width={440}>
        {/* Header + 탭 */}
        <DrawerHeader>
          <div className="flex items-center px-5 h-12 gap-1">
            <h2 className="text-xs font-semibold text-foreground flex-1">
              {editTask ? '태스크 수정' : '새 태스크'}
            </h2>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded">
              <X size={16} />
            </button>
          </div>
          <div className="flex px-5 gap-4">
            <button
              onClick={() => setTab('info')}
              className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                tab === 'info' ? 'border-lilac-500 text-lilac-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              정보
            </button>
            <button
              onClick={() => setTab('memo')}
              className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1 ${
                tab === 'memo' ? 'border-lilac-500 text-lilac-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              메모
              {memo.trim() && <span className="w-1 h-1 rounded-full bg-lilac-400" />}
            </button>
            {editTask && (
              <button
                onClick={() => setTab('history')}
                className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === 'history' ? 'border-lilac-500 text-lilac-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                이력
              </button>
            )}
          </div>
        </DrawerHeader>

        {/* 바디 */}
        {tab === 'info' ? (
        <DrawerBody className="px-5 py-4 flex flex-col gap-4">
          {/* 제목 */}
          <input
            ref={titleRef}
            className="w-full text-xs font-medium text-foreground border-b border-border focus:border-lilac-400 outline-none pb-1 placeholder:text-ink-300"
            placeholder="태스크 제목"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />

          {/* 상태 + 담당자 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <span
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none z-10"
                  style={{ backgroundColor: STATUS_COLOR[status] }}
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
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">담당자</label>
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
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">시작일</label>
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
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">마감일</label>
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
              <p className="text-2xs text-status-late">{dateError}</p>
            )}
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">우선순위</label>
            <div className="flex items-center gap-1 mt-1.5">
              {PRIORITY_OPTIONS.map(opt => {
                const meta = PRIORITY_META[opt.value]
                const active = priority === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex items-center gap-0.5 text-2xs px-2 py-1 rounded border transition-colors
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

          {/* 라벨 */}
          <div ref={labelRef}>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <Tag size={10} /> 라벨
            </label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map(l => (
                <button
                  key={l}
                  onClick={() => setLabels(prev => prev.filter(x => x !== l))}
                  className="flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full text-white font-medium hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: labelColor(l) }}
                  title="클릭해서 삭제"
                >
                  {l} <X size={9} />
                </button>
              ))}
              <div className="relative">
                <input
                  className="text-2xs px-2 py-0.5 rounded-full border border-dashed border-border outline-none focus:border-lilac-300 text-muted-foreground placeholder:text-ink-300 min-w-[100px]"
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
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs hover:bg-accent cursor-pointer"
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

          {/* 연결 프로젝트 */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">연결 프로젝트</label>
            {linkedProjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                {linkedProjects.map(p => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 text-2xs bg-lilac-100 text-lilac-600 border border-lilac-300 px-2 py-0.5 rounded-full"
                  >
                    <span className="text-lilac-400 text-4xs">{p.board_name}</span>
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
                        <div className="px-3 pt-1.5 pb-0.5 text-4xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
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
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 py-3 px-3 text-center text-2xs text-muted-foreground">
                  {projSearch.trim() ? '검색 결과 없음' : '연결 가능한 프로젝트가 없어요'}
                </div>
              )}
            </div>
          </div>

          {/* 반복 */}
          <div className="pt-2 border-t border-border">
            <label className="text-4xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <RotateCw size={10} /> 반복
            </label>
            <div className="flex items-center gap-2">
              {/* 반복 없음 버튼 */}
              <button
                type="button"
                onClick={() => setRecurrenceRule(null)}
                className={`text-3xs px-2.5 py-1 rounded border transition-colors ${
                  recurrenceRule === null
                    ? 'border-lilac-400 bg-lilac-50 text-lilac-600 font-medium'
                    : 'border-border text-muted-foreground hover:border-ink-300'
                }`}
              >
                없음
              </button>
              {RECURRENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecurrenceRule(opt.value)}
                  className={`text-3xs px-2.5 py-1 rounded border transition-colors ${
                    recurrenceRule === opt.value
                      ? 'border-lilac-400 bg-lilac-50 text-lilac-600 font-medium'
                      : 'border-border text-muted-foreground hover:border-ink-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {recurrenceRule && recurrenceRule !== 'yearly' && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-3xs text-muted-foreground">
                  {recurrenceRule === 'daily' ? '매' : recurrenceRule === 'weekly' ? '매' : '매'}
                </span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={recurrenceInterval}
                  onChange={e => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 text-xs text-center border border-border rounded px-2 py-1 outline-none focus:border-lilac-300"
                />
                <span className="text-3xs text-muted-foreground">
                  {recurrenceRule === 'daily' ? '일마다' : recurrenceRule === 'weekly' ? '주마다' : '개월마다'}
                </span>
              </div>
            )}
          </div>

          {/* 상위 태스크 */}
          {parentTask && (
            <div className="text-xs pt-2 border-t border-border">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider">상위 태스크</span>
              <p className="mt-0.5 text-2xs text-ink-500 truncate">{parentTask.title}</p>
            </div>
          )}
        </DrawerBody>
        ) : tab === 'memo' ? (
        <DrawerBody scrollable={false} className="p-5">
          <textarea
            ref={memoRef}
            className="w-full h-full text-xs border border-border rounded p-3 outline-none focus:border-lilac-300 placeholder:text-ink-300 resize-none leading-relaxed"
            placeholder="메모를 입력하세요"
            value={memo}
            onChange={e => setMemo(e.target.value)}
          />
        </DrawerBody>
        ) : (
        <DrawerBody>
          {editTask && <TaskHistorySection taskId={editTask.id} />}
        </DrawerBody>
        )}

        {/* Footer */}
        <DrawerFooter>
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
        </DrawerFooter>
    </Drawer>
  )
}
