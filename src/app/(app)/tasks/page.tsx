'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Circle, CheckCircle2, ChevronDown, ChevronRight,
  Pencil, Trash2, Paperclip, LayoutList, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import {
  getOrCreateWorkspace, getTasks, addTask, updateTask, deleteTask, searchProjects,
} from '@/lib/gantt-service'
import type { GanttTask, TaskStatus, TaskType, Workspace } from '@/types'

// ── 상수 ─────────────────────────────────────────────────────
const STATUS_GROUPS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'in-progress', label: 'In Progress', color: '#f59e0b' },
  { status: 'to-do',       label: 'To-Do',       color: '#6366f1' },
  { status: 'backlog',     label: 'Backlog',      color: '#9ca3af' },
  { status: 'done',        label: 'Done',         color: '#22c55e' },
]

const PROJECT_COLORS = [
  '#f59e0b', '#f97316', '#8b5cf6', '#22c55e',
  '#3b82f6', '#ec4899', '#14b8a6', '#a855f7',
]

// ── 유틸 ─────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

function relativeTime(d: string | null) {
  if (!d) return '—'
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 864e5)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (diff < 0) return `${Math.abs(diff)}일 후`
  return `${diff}일 전`
}

function daysDiff(d: string | null): number {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / 864e5)
}

function overdueDays(due: string | null): number {
  if (!due) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / 864e5))
}

function isOverdue(due: string | null, status: TaskStatus) {
  if (!due || status === 'done') return false
  return new Date(due) < new Date(new Date().toDateString())
}

function isDueThisWeek(due: string | null) {
  if (!due) return false
  const d = new Date(due)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = new Date(today); end.setDate(today.getDate() + (6 - today.getDay()))
  return d >= today && d <= end
}

function abbrev(name: string) { return name.slice(0, 2) }

function weekStart() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0)
  return d
}

// ── MiniCalendar ─────────────────────────────────────────────
function MiniCalendar({ dueDates, overdueDates, completedDates }: {
  dueDates: Set<string>; overdueDates: Set<string>; completedDates: Set<string>
}) {
  const [cur, setCur] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }
  })
  const today = new Date()
  const firstDay = new Date(cur.year, cur.month, 1).getDay()
  const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function toKey(d: number) {
    return `${cur.year}-${String(cur.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">{cur.year}년 {cur.month + 1}월</span>
        <div className="flex gap-1">
          <button
            onClick={() => setCur(c => { const d = new Date(c.year, c.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
          >‹</button>
          <button
            onClick={() => setCur(c => { const d = new Date(c.year, c.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
          >›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {['일','월','화','수','목','금','토'].map(d => (
          <div key={d} className="text-[9px] text-gray-400 py-0.5">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const key = toKey(d)
          const isToday = today.getFullYear() === cur.year && today.getMonth() === cur.month && today.getDate() === d
          const isOv = overdueDates.has(key)
          const isComp = completedDates.has(key)
          const hasDue = dueDates.has(key)
          return (
            <div key={i} className="flex flex-col items-center py-0.5">
              <span className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full leading-none
                ${isToday ? 'bg-indigo-600 text-white font-bold' : 'text-gray-700 hover:bg-gray-100'}`}>
                {d}
              </span>
              {(isOv || hasDue || isComp) && (
                <span className={`w-1 h-1 rounded-full mt-0.5 ${isOv ? 'bg-red-400' : isComp ? 'bg-green-400' : 'bg-amber-400'}`} />
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 justify-center">
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />지연</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />이번주</span>
        <span className="flex items-center gap-1 text-[9px] text-gray-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />완료</span>
      </div>
    </div>
  )
}

// ── SummaryCard ───────────────────────────────────────────────
function SummaryCard({ title, value, sub, sub2, borderColor }: {
  title: string; value: string | number; sub?: string; sub2?: string; borderColor: string
}) {
  return (
    <div className={`flex-1 bg-white rounded-lg border border-gray-100 border-l-4 px-4 py-3 min-w-0`}
      style={{ borderLeftColor: borderColor }}>
      <div className="text-[10px] text-gray-400 mb-1 truncate">{title}</div>
      <div className="text-sm font-bold text-gray-800 leading-tight">{value}</div>
      {sub  && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
      {sub2 && <div className="text-[10px] text-gray-400">{sub2}</div>}
    </div>
  )
}

// ── TaskRow ───────────────────────────────────────────────────
function TaskRow({ task, onEdit, onDelete, onStatusChange }: {
  task: GanttTask
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, s: TaskStatus) => void
}) {
  const STATUS_ORDER: TaskStatus[] = ['to-do', 'in-progress', 'backlog', 'done']
  function cycleStatus() {
    onStatusChange(task.id, STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length])
  }

  const overdue  = isOverdue(task.due_date, task.status)
  const isDone   = task.status === 'done'
  const noUpdate = daysDiff(task.updated_at) >= 7 && !isDone
  const odDays   = overdueDays(task.due_date)

  const assigneeLabel = task.type === 'mine'
    ? <span className="flex items-center gap-1 text-[10px]">
        <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">나</span>
        <span className="text-gray-500">내 할일</span>
      </span>
    : task.assignee
      ? <span className="flex items-center gap-1 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{abbrev(task.assignee)}</span>
          <span className="text-gray-500 truncate">{task.assignee}</span>
        </span>
      : null

  return (
    <div className={`group flex items-center px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isDone ? 'opacity-55' : ''}`}>
      {/* 체크박스 */}
      <button onClick={cycleStatus} className="shrink-0 mr-3" title="상태 변경">
        {isDone
          ? <CheckCircle2 size={16} className="text-green-400" />
          : <Circle size={16} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
      </button>

      {/* 제목 + 프로젝트 */}
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs text-gray-800 ${isDone ? 'line-through text-gray-400' : ''}`}>{task.title}</span>
          {overdue && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium border border-red-100">
              지연 {odDays}일
            </span>
          )}
          {noUpdate && !overdue && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-500 font-medium border border-orange-100">
              {daysDiff(task.updated_at)}일 무응답
            </span>
          )}
        </div>
        {task.projects && task.projects.length > 0 ? (
          <div className="flex items-center gap-1 mt-0.5">
            {task.projects.slice(0, 2).map(p => (
              <span key={p.id} className="flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                <Paperclip size={8} className="shrink-0" />{p.name}
              </span>
            ))}
            {task.projects.length > 2 && <span className="text-[10px] text-gray-400">+{task.projects.length - 2}</span>}
          </div>
        ) : (
          <div className="text-[10px] text-gray-300 mt-0.5">—</div>
        )}
      </div>

      {/* 담당자 */}
      <div className="w-28 shrink-0">{assigneeLabel}</div>

      {/* 최근 업데이트 */}
      <div className="w-20 shrink-0 text-[11px] text-gray-400 tabular-nums">{relativeTime(task.updated_at)}</div>

      {/* 시작일 */}
      <div className="w-14 shrink-0 text-[11px] text-gray-400 tabular-nums">{fmtDate(task.start_date ?? null)}</div>

      {/* 마감일 */}
      <div className={`w-14 shrink-0 text-[11px] tabular-nums font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
        {fmtDate(task.due_date)}
      </div>

      {/* 지시일 */}
      <div className="w-14 shrink-0 text-[10px] text-gray-300 tabular-nums">{fmtDate(task.created_at)}</div>

      {/* 액션 */}
      <div className="w-12 shrink-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(task)} className="p-1 text-gray-300 hover:text-indigo-500 rounded"><Pencil size={11} /></button>
        <button onClick={() => onDelete(task.id)} className="p-1 text-gray-300 hover:text-red-400 rounded"><Trash2 size={11} /></button>
      </div>
    </div>
  )
}

// ── TasksPage ─────────────────────────────────────────────────
export default function TasksPage() {
  const [workspace,      setWorkspace]      = useState<Workspace | null>(null)
  const [tasks,          setTasks]          = useState<GanttTask[]>([])
  const [loading,        setLoading]        = useState(true)
  const [formOpen,       setFormOpen]       = useState(false)
  const [editTask,       setEditTask]       = useState<GanttTask | null>(null)
  const [collapsed,      setCollapsed]      = useState<Set<string>>(new Set(['done', 'to-do', 'backlog']))
  const [filterType,     setFilterType]     = useState<'all' | 'mine' | 'delegated'>('all')
  const [filterProject,  setFilterProject]  = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [quickFilter,    setQuickFilter]    = useState<'all' | 'overdue' | 'due-this-week' | 'no-update'>('all')
  const [defaultStatus,  setDefaultStatus]  = useState<TaskStatus>('to-do')
  const [assigneeSearch, setAssigneeSearch] = useState('')

  const errMsg = (e: unknown) => e instanceof Error ? e.message : '오류가 발생했습니다.'

  const load = useCallback(async () => {
    try {
      const ws = await getOrCreateWorkspace()
      setWorkspace(ws)
      setTasks(await getTasks(ws.id))
    } catch (e) { toast.error(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave(
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null },
    projectIds: string[]
  ) {
    if (!workspace) return
    try {
      if (editTask) await updateTask(editTask.id, fields, projectIds)
      else await addTask(workspace.id, fields, projectIds)
      await load()
    } catch (e) { toast.error(errMsg(e)); throw e }
  }

  async function handleDelete(id: string) {
    if (!confirm('태스크를 삭제할까요?')) return
    try { await deleteTask(id); setTasks(prev => prev.filter(t => t.id !== id)) }
    catch (e) { toast.error(errMsg(e)) }
  }

  async function handleStatusChange(id: string, status: TaskStatus) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    try { await updateTask(id, { status }) }
    catch (e) { toast.error(errMsg(e)); await load() }
  }

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function openAdd(status: TaskStatus) {
    setDefaultStatus(status); setEditTask(null); setFormOpen(true)
  }

  const handleSearch = useCallback(
    async (query: string) => workspace ? searchProjects(workspace.id, query) : [],
    [workspace]
  )

  // ── 통계 ─────────────────────────────────────────────────
  const overdueCount      = tasks.filter(t => isOverdue(t.due_date, t.status)).length
  const noUpdateCount     = tasks.filter(t => daysDiff(t.updated_at) >= 7 && t.status !== 'done').length
  const dueThisWeekCount  = tasks.filter(t => isDueThisWeek(t.due_date) && t.status !== 'done').length
  const completedThisWeek = tasks.filter(t => t.status === 'done' && new Date(t.updated_at) >= weekStart()).length
  const inProgressCount   = tasks.filter(t => t.status === 'in-progress').length

  // 최다 부하 팀원 (전체 미완료 기준)
  const assigneeLoadMap = new Map<string, number>()
  tasks.filter(t => t.status !== 'done').forEach(t => {
    const key = t.type === 'mine' ? '나' : (t.assignee ?? '미지정')
    assigneeLoadMap.set(key, (assigneeLoadMap.get(key) ?? 0) + 1)
  })
  let topName = '—'; let topCount = 0
  assigneeLoadMap.forEach((cnt, name) => { if (cnt > topCount) { topName = name; topCount = cnt } })
  const topIPCount = tasks.filter(t => t.status === 'in-progress' && (t.type === 'mine' ? '나' : t.assignee) === topName).length

  // ── 사이드바 데이터 ───────────────────────────────────────
  const projectMap = new Map<string, { name: string; count: number; colorIdx: number }>()
  tasks.forEach(t => t.projects?.forEach(p => {
    if (!projectMap.has(p.id)) projectMap.set(p.id, { name: p.name, count: 0, colorIdx: projectMap.size })
    projectMap.get(p.id)!.count++
  }))
  const sidebarProjects = [...projectMap.entries()].map(([id, v]) => ({ id, ...v }))

  const assigneeMap = new Map<string, { label: string; count: number }>()
  tasks.forEach(t => {
    const key = t.type === 'mine' ? '__mine__' : (t.assignee ?? '')
    if (!key) return
    const label = t.type === 'mine' ? '내 할일' : t.assignee!
    const cur = assigneeMap.get(key) ?? { label, count: 0 }
    assigneeMap.set(key, { ...cur, count: cur.count + 1 })
  })
  const sidebarAssignees = [...assigneeMap.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .filter(a => !assigneeSearch || a.label.toLowerCase().includes(assigneeSearch.toLowerCase()))

  // 캘린더 dot용
  const dueDateSet      = new Set(tasks.filter(t => t.status !== 'done').map(t => t.due_date).filter(Boolean) as string[])
  const overdueDateSet  = new Set(tasks.filter(t => isOverdue(t.due_date, t.status)).map(t => t.due_date).filter(Boolean) as string[])
  const completedDateSet = new Set(tasks.filter(t => t.status === 'done').map(t => t.updated_at.slice(0, 10)))

  // ── 필터링 ───────────────────────────────────────────────
  let filtered = tasks
  if (filterType !== 'all')  filtered = filtered.filter(t => t.type === filterType)
  if (filterProject)         filtered = filtered.filter(t => t.projects?.some(p => p.id === filterProject))
  if (filterAssignee) {
    if (filterAssignee === '__mine__') filtered = filtered.filter(t => t.type === 'mine')
    else filtered = filtered.filter(t => t.assignee === filterAssignee)
  }
  if (quickFilter === 'overdue')        filtered = filtered.filter(t => isOverdue(t.due_date, t.status))
  if (quickFilter === 'due-this-week')  filtered = filtered.filter(t => isDueThisWeek(t.due_date) && t.status !== 'done')
  if (quickFilter === 'no-update')      filtered = filtered.filter(t => daysDiff(t.updated_at) >= 7 && t.status !== 'done')

  // 지연 가상 그룹 (overdue, non-done)
  const overdueGroup = filtered.filter(t => isOverdue(t.due_date, t.status))
  const overdueIds   = new Set(overdueGroup.map(t => t.id))
  const avgOverdueDays = overdueGroup.length
    ? Math.round(overdueGroup.reduce((s, t) => s + overdueDays(t.due_date), 0) / overdueGroup.length * 10) / 10
    : 0

  // 나머지 그룹은 overdue 제외
  function getGroup(status: TaskStatus) {
    return filtered.filter(t => t.status === status && !overdueIds.has(t.id))
  }
  // In Progress 그룹 평균 진행일
  const ipGroup = getGroup('in-progress')
  const avgIPDays = ipGroup.length
    ? Math.round(ipGroup.reduce((s, t) => s + daysDiff(t.start_date), 0) / ipGroup.length * 10) / 10
    : 0

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">로딩 중...</div>
  )

  // ── 사이드바 퀵 필터 항목 ─────────────────────────────────
  const quickItems = [
    { key: 'all',           label: '전체',              count: tasks.length,    icon: <LayoutList size={12} className="shrink-0" /> },
    { key: 'overdue',       label: '지연',              count: overdueCount,    icon: <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" /> },
    { key: 'due-this-week', label: '이번 주 마감',      count: dueThisWeekCount, icon: <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /> },
    { key: 'no-update',     label: '업데이트 없음 (7일+)', count: noUpdateCount, icon: <span className="w-2 h-2 rounded-full bg-orange-300 shrink-0" /> },
  ] as const

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 사이드바 ──────────────────────────────────────── */}
      <div className="w-60 shrink-0 border-r bg-stone-50 flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b bg-white">
          <h1 className="text-xs font-semibold text-gray-800">태스크</h1>
        </div>

        <div className="flex flex-col gap-0.5 p-2">
          {/* 퀵 필터 */}
          {quickItems.map(item => (
            <button
              key={item.key}
              onClick={() => setQuickFilter(item.key as typeof quickFilter)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors
                ${quickFilter === item.key
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {item.icon}
              <span className="flex-1 text-left truncate">{item.label}</span>
              <span className={`text-xs ${item.count > 0 && item.key !== 'all' ? 'text-red-400 font-medium' : 'text-gray-400'}`}>
                {item.count}
              </span>
            </button>
          ))}

          {/* 프로젝트 */}
          {sidebarProjects.length > 0 && (
            <div className="mt-3">
              <div className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">프로젝트</div>
              {sidebarProjects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setFilterProject(filterProject === p.id ? null : p.id); setFilterAssignee(null) }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors
                    ${filterProject === p.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PROJECT_COLORS[p.colorIdx % PROJECT_COLORS.length] }} />
                  <span className="flex-1 truncate text-left">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* 담당자 */}
          <div className="mt-3">
            <div className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">담당자</div>
            <div className="relative mx-2 mb-1.5">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                placeholder="이름 검색"
                value={assigneeSearch}
                onChange={e => setAssigneeSearch(e.target.value)}
                className="w-full text-[11px] pl-5 pr-2 py-1 border border-gray-200 rounded bg-white text-gray-600 placeholder:text-gray-300 focus:outline-none focus:border-indigo-300"
              />
            </div>
            {sidebarAssignees.map(a => (
              <button
                key={a.key}
                onClick={() => { setFilterAssignee(filterAssignee === a.key ? null : a.key); setFilterProject(null) }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors
                  ${filterAssignee === a.key ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0
                  ${a.key === '__mine__' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                  {a.key === '__mine__' ? '나' : abbrev(a.label)}
                </span>
                <span className="flex-1 truncate text-left">{a.label}</span>
                <span className="text-xs text-gray-400">{a.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 캘린더 */}
        <div className="mt-auto border-t">
          <MiniCalendar dueDates={dueDateSet} overdueDates={overdueDateSet} completedDates={completedDateSet} />
        </div>
      </div>

      {/* ── 메인 콘텐츠 ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* KPI 카드 */}
        <div className="grid grid-cols-4 gap-3 p-4 border-b bg-gray-50 shrink-0">
          <SummaryCard
            title="지연 태스크"
            value={overdueCount}
            sub={overdueCount > 0 ? `평균 ${avgOverdueDays}일 지연` : '없음'}
            borderColor="#ef4444"
          />
          <SummaryCard
            title="업데이트 없음 (7일+)"
            value={noUpdateCount}
            sub={noUpdateCount > 0 ? '팔로업 필요' : '최신 상태'}
            borderColor="#f97316"
          />
          <SummaryCard
            title="최다 부하 팀원"
            value={topName !== '—' ? `${topName}·${topCount}건` : '—'}
            sub={topIPCount > 0 ? `In Progress ${topIPCount}건` : undefined}
            borderColor="#3b82f6"
          />
          <SummaryCard
            title="이번 주 완료"
            value={completedThisWeek}
            sub={`진행 중 ${inProgressCount}건`}
            borderColor="#22c55e"
          />
        </div>

        {/* 탭 + 액션 */}
        <div className="flex items-center border-b bg-white shrink-0 px-4">
          <div className="flex">
            {(['all', 'mine', 'delegated'] as const).map(v => (
              <button
                key={v}
                onClick={() => setFilterType(v)}
                className={`px-4 py-3 text-xs border-b-2 transition-colors
                  ${filterType === v ? 'border-indigo-500 text-indigo-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {v === 'all' ? '전체' : v === 'mine' ? '내 할일' : '업무지시'}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded px-2.5 py-1.5 bg-white">
              상태별 그룹
              <ChevronDown size={11} className="text-gray-400" />
            </div>
            <button
              onClick={() => openAdd('to-do')}
              className="flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded transition-colors"
            >
              <Plus size={13} /> 태스크 추가
            </button>
          </div>
        </div>

        {/* 컬럼 헤더 */}
        <div className="flex items-center px-4 py-2 border-b bg-gray-50 shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <div className="w-5 shrink-0 mr-3" />
          <div className="flex-1 mr-4">제목·프로젝트</div>
          <div className="w-28 shrink-0">담당자</div>
          <div className="w-20 shrink-0">최근 업데이트</div>
          <div className="w-14 shrink-0">시작일</div>
          <div className="w-14 shrink-0">마감일</div>
          <div className="w-14 shrink-0">지시일</div>
          <div className="w-12 shrink-0" />
        </div>

        {/* 태스크 목록 */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <p className="text-xs">태스크가 없어요</p>
              <button onClick={() => openAdd('to-do')} className="text-xs text-indigo-500 hover:text-indigo-700">+ 첫 번째 태스크 추가</button>
            </div>
          ) : (
            <>
              {/* 지연 가상 그룹 */}
              {overdueGroup.length > 0 && (
                <div>
                  <button
                    onClick={() => toggleCollapse('__overdue__')}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-white border-b hover:bg-gray-50 transition-colors"
                  >
                    {collapsed.has('__overdue__')
                      ? <ChevronRight size={12} className="text-gray-400 shrink-0" />
                      : <ChevronDown  size={12} className="text-gray-400 shrink-0" />}
                    <span className="w-2 h-2 rounded-full shrink-0 bg-red-400" />
                    <span className="text-xs font-semibold text-red-500">지연</span>
                    <span className="text-[10px] text-gray-400">{overdueGroup.length}</span>
                    {avgOverdueDays > 0 && (
                      <span className="ml-auto text-[10px] text-gray-400">평균 지연 {avgOverdueDays}일</span>
                    )}
                  </button>
                  {!collapsed.has('__overdue__') && overdueGroup.map(task => (
                    <TaskRow key={task.id} task={task}
                      onEdit={t => { setEditTask(t); setFormOpen(true) }}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              )}

              {/* 상태별 그룹 */}
              {STATUS_GROUPS.map(({ status, label, color }) => {
                const group = getGroup(status)
                const isCollapsed = collapsed.has(status)
                return (
                  <div key={status}>
                    <button
                      onClick={() => toggleCollapse(status)}
                      className="w-full flex items-center gap-2 px-4 py-2 bg-white border-b hover:bg-gray-50 transition-colors"
                    >
                      {isCollapsed
                        ? <ChevronRight size={12} className="text-gray-400 shrink-0" />
                        : <ChevronDown  size={12} className="text-gray-400 shrink-0" />}
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-semibold text-gray-600">{label}</span>
                      <span className="text-[10px] text-gray-400">{group.length}</span>
                      {status === 'in-progress' && avgIPDays > 0 && (
                        <span className="ml-auto text-[10px] text-gray-400">평균 진행 {avgIPDays}일</span>
                      )}
                    </button>
                    {!isCollapsed && (
                      <>
                        {group.map(task => (
                          <TaskRow key={task.id} task={task}
                            onEdit={t => { setEditTask(t); setFormOpen(true) }}
                            onDelete={handleDelete}
                            onStatusChange={handleStatusChange}
                          />
                        ))}
                        <button
                          onClick={() => openAdd(status)}
                          className="flex items-center gap-1.5 px-4 py-2 w-full text-left text-xs text-gray-400 hover:text-indigo-500 hover:bg-gray-50 transition-colors border-b border-gray-50"
                        >
                          <Plus size={11} /> 태스크 추가
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      <TaskFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTask(null) }}
        onSave={handleSave}
        editTask={editTask}
        defaultStatus={defaultStatus}
        onSearchProjects={handleSearch}
      />
    </div>
  )
}
