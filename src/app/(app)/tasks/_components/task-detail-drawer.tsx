'use client'

import { useState, useEffect, useRef } from 'react'
import { X, CheckCircle2, Circle, Trash2, ChevronDown, Copy } from 'lucide-react'
import type { GanttTask, TaskStatus, TaskType, Priority, RecurrenceRule } from '@/types'
import { fmtDate } from '../_utils'
import { DatePickerButton } from '@/components/ui/date-picker-button'
import { PRIORITY_OPTIONS, PRIORITY_META, PriorityBars, STATUS_COLOR } from '../_constants'
import { toDate, toDateStr } from '@/lib/gantt-utils'
import { AutocompleteInput } from '@/components/AutocompleteInput'
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from '@/components/ui/drawer'
import { TaskHistorySection } from './task-history-section'
import { DrawerProjectSection, type ProjectOption } from './drawer-project-section'
import { DrawerLabelSection } from './drawer-label-section'
import { DrawerRecurrenceSection } from './drawer-recurrence-section'
import { DrawerSubTaskSection } from './drawer-sub-task-section'

type DrawerTab = 'info' | 'memo' | 'history'

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog',      label: 'Backlog' },
  { value: 'to-do',       label: 'To-Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done',        label: 'Done' },
  { value: 'pending',     label: 'Pending' },
]

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
  /** true: 포털 없이 인라인 렌더링 (레이아웃 컨테이너가 슬라이드 담당) */
  noPortal?: boolean
}

export function TaskDetailDrawer({
  open, task, subTasks, parentTask, initialTab,
  onClose, onSave, onDelete, onDuplicate, onAddSubTask, onStatusChange,
  onSearchProjects, assigneeSuggestions = [], labelSuggestions = [],
  noPortal = false,
}: Props) {
  const [title,              setTitle]              = useState('')
  const [status,             setStatus]             = useState<TaskStatus>('to-do')
  const [priority,           setPriority]           = useState<Priority>(2)
  const [assignee,           setAssignee]           = useState('')
  const [startDate,          setStartDate]          = useState<Date | undefined>()
  const [dueDate,            setDueDate]            = useState<Date | undefined>()
  const [memo,               setMemo]               = useState('')
  const [labels,             setLabels]             = useState<string[]>([])
  const [saving,             setSaving]             = useState(false)
  const [recurrenceRule,     setRecurrenceRule]     = useState<RecurrenceRule | null>(null)
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1)
  const [linkedProjects,     setLinkedProjects]     = useState<ProjectOption[]>([])
  const [tab,                setTab]                = useState<DrawerTab>('info')
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
    setTab(initialTab ?? 'info')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, task, initialTab])

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

  const currentStatusColor = STATUS_COLOR[status]

  return (
    <Drawer open={open} onClose={onClose} noPortal={noPortal}>
      {/* 헤더 + 탭 */}
      <DrawerHeader>
        <div className="flex items-center px-5 h-12 gap-1">
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
          {(['info', 'memo', 'history'] as DrawerTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
                tab === t ? 'border-lilac-500 text-accent-foreground' : 'border-transparent text-ink-400 hover:text-muted-foreground'
              }`}
            >
              {t === 'info' ? '정보' : t === 'memo' ? (
                <>메모{memo.trim() && <span className="w-1 h-1 rounded-full bg-lilac-400" />}</>
              ) : '이력'}
            </button>
          ))}
        </div>
      </DrawerHeader>

      {/* 바디 */}
      {tab === 'info' ? (
        <DrawerBody className="px-5 py-4 flex flex-col gap-4">

          {/* 제목 */}
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
              <label className="text-sm font-semibold text-ink-400 uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <span
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none z-10"
                  style={{ backgroundColor: currentStatusColor }}
                />
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as TaskStatus)}
                  className="w-full text-sm border border-border rounded pl-6 pr-6 py-1.5 outline-none focus:border-lilac-300 appearance-none bg-card text-ink-700"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-sm font-semibold text-ink-400 uppercase tracking-wider">담당자</label>
              <AutocompleteInput
                className="mt-1.5 w-full text-sm border border-border rounded px-2.5 py-1.5 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-ink-700"
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
              <div className="flex-1 min-w-0">
                <label className="text-sm font-semibold text-ink-400 uppercase tracking-wider">시작일</label>
                <div className="mt-1.5">
                  <DatePickerButton
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="MM/DD 또는 YYYY.MM.DD"
                    disabledDates={dueDate ? d => d > dueDate : undefined}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-sm font-semibold text-ink-400 uppercase tracking-wider">마감일</label>
                <div className="mt-1.5">
                  <DatePickerButton
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="MM/DD 또는 YYYY.MM.DD"
                    disabledDates={startDate ? d => d < startDate : undefined}
                  />
                </div>
              </div>
            </div>
            {dateError && <p className="text-sm text-status-late mt-1">{dateError}</p>}
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-sm font-semibold text-ink-400 uppercase tracking-wider">우선순위</label>
            <div className="flex items-center gap-1 mt-1.5">
              {PRIORITY_OPTIONS.map(opt => {
                const meta = PRIORITY_META[opt.value]
                const active = priority === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex items-center gap-0.5 text-sm px-2 py-1 rounded border transition-colors
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
          <DrawerProjectSection
            key={task?.id ? `${task.id}-projects` : 'projects'}
            linkedProjects={linkedProjects}
            setLinkedProjects={setLinkedProjects}
            onSearchProjects={onSearchProjects}
          />

          {/* 라벨 */}
          <DrawerLabelSection
            key={task?.id ? `${task.id}-labels` : 'labels'}
            labels={labels}
            setLabels={setLabels}
            labelSuggestions={labelSuggestions}
          />

          {/* 반복 */}
          <DrawerRecurrenceSection
            recurrenceRule={recurrenceRule}
            setRecurrenceRule={setRecurrenceRule}
            recurrenceInterval={recurrenceInterval}
            setRecurrenceInterval={setRecurrenceInterval}
          />

          {/* 하위 태스크 — 상위 태스크일 때만 표시 */}
          {!task?.parent_id && task && (
            <DrawerSubTaskSection
              key={task.id}
              task={task}
              subTasks={subTasks}
              onStatusChange={onStatusChange}
              onAddSubTask={onAddSubTask}
            />
          )}

          {/* 상위 태스크 */}
          {task?.parent_id && parentTask && (
            <div className="pt-2 border-t border-border">
              <span className="text-sm font-semibold text-ink-400 uppercase tracking-wider">상위 태스크</span>
              <p className="mt-1 text-sm font-medium text-foreground">{parentTask.title}</p>
            </div>
          )}
        </DrawerBody>
      ) : tab === 'memo' ? (
        <DrawerBody scrollable={false} className="p-5">
          <textarea
            className="w-full h-full text-sm border border-border rounded p-3 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-ink-700 resize-none leading-relaxed"
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
              <div className="text-sm text-ink-300 flex flex-col gap-0.5 px-5 py-3 border-t border-border">
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
          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-ink-700 hover:bg-muted rounded transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className="px-4 py-1.5 text-sm bg-accent-foreground text-white rounded font-medium hover:bg-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </DrawerFooter>
    </Drawer>
  )
}
