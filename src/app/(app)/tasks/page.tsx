'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Circle, CheckCircle2, Clock, ChevronDown, ChevronRight, Pencil, Trash2, Paperclip, LayoutList } from 'lucide-react'
import { toast } from 'sonner'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { getOrCreateWorkspace, getTasks, addTask, updateTask, deleteTask, searchProjects } from '@/lib/gantt-service'
import type { GanttTask, TaskStatus, TaskType, Workspace } from '@/types'

// ── 상수 ──────────────────────────────────────────────────────
const STATUS_GROUPS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'to-do',       label: 'To-Do',      color: '#6366f1' },
  { status: 'in-progress', label: 'In Progress', color: '#f59e0b' },
  { status: 'backlog',     label: 'Backlog',     color: '#9ca3af' },
  { status: 'done',        label: 'Done',        color: '#22c55e' },
]

const PROJECT_COLORS = [
  '#f59e0b', '#f97316', '#8b5cf6', '#22c55e',
  '#3b82f6', '#ec4899', '#14b8a6', '#a855f7',
]

function fmtDate(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toDateString())
}

function abbrev(name: string) {
  return name.slice(0, 2)
}

// ── MiniCalendar ─────────────────────────────────────────────
function MiniCalendar({ dueDates }: { dueDates: Set<string> }) {
  const [cur, setCur] = useState(() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth() }
  })
  const today = new Date()
  const firstDay = new Date(cur.year, cur.month, 1).getDay()
  const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate()

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
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
          const isToday = today.getFullYear() === cur.year && today.getMonth() === cur.month && today.getDate() === d
          const hasDue = dueDates.has(toKey(d))
          return (
            <div key={i} className="flex flex-col items-center py-0.5">
              <span className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full leading-none
                ${isToday ? 'bg-indigo-600 text-white font-bold' : 'text-gray-700 hover:bg-gray-100'}`}>
                {d}
              </span>
              {hasDue && <span className="w-1 h-1 rounded-full bg-red-400 mt-0.5" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TaskRow ────────────────────────────────────────────────────
function TaskRow({ task, onEdit, onDelete, onStatusChange }: {
  task: GanttTask
  onEdit: (t: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => void
}) {
  const STATUS_ORDER: TaskStatus[] = ['to-do', 'in-progress', 'backlog', 'done']
  function cycleStatus() {
    onStatusChange(task.id, STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length])
  }
  const overdue = isOverdue(task.due_date) && task.status !== 'done'
  const isDone = task.status === 'done'

  const assigneeLabel = task.type === 'mine'
    ? <span className="flex items-center gap-1 text-[10px]"><span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">나</span><span className="text-gray-500">내 할일</span></span>
    : task.assignee
      ? <span className="flex items-center gap-1 text-[10px]"><span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{abbrev(task.assignee)}</span><span className="text-gray-500">{task.assignee}</span></span>
      : null

  return (
    <div className={`group flex items-center gap-0 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isDone ? 'opacity-60' : ''}`}>
      {/* 체크박스 */}
      <button onClick={cycleStatus} className="shrink-0 mr-3" title="클릭하여 상태 변경">
        {isDone
          ? <CheckCircle2 size={16} className="text-green-400" />
          : <Circle size={16} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
      </button>

      {/* 제목 + 프로젝트 */}
      <div className="flex-1 min-w-0 mr-4">
        <div className={`text-sm text-gray-800 truncate ${isDone ? 'line-through text-gray-400' : ''}`}>
          {task.title}
        </div>
        {task.projects && task.projects.length > 0 ? (
          <div className="flex items-center gap-1 mt-0.5">
            {task.projects.slice(0, 2).map(p => (
              <span key={p.id} className="flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
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
      <div className="w-32 shrink-0">{assigneeLabel}</div>

      {/* 시작일 */}
      <div className="w-14 shrink-0 text-[11px] text-gray-400 tabular-nums">{fmtDate(task.start_date ?? null)}</div>

      {/* 마감일 */}
      <div className={`w-14 shrink-0 text-[11px] tabular-nums font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
        {fmtDate(task.due_date)}
      </div>

      {/* 등록일 */}
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
  const [workspace, setWorkspace]   = useState<Workspace | null>(null)
  const [tasks, setTasks]           = useState<GanttTask[]>([])
  const [loading, setLoading]       = useState(true)
  const [formOpen, setFormOpen]     = useState(false)
  const [editTask, setEditTask]     = useState<GanttTask | null>(null)
  const [collapsed, setCollapsed]   = useState<Set<TaskStatus>>(new Set(['done']))
  const [filterType, setFilterType] = useState<'all' | 'mine' | 'delegated'>('all')
  const [filterProject, setFilterProject] = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null) // 'mine' or assignee name
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('to-do')

  const errMsg = (e: unknown) => e instanceof Error ? e.message : '오류가 발생했습니다.'

  const load = useCallback(async () => {
    try {
      const ws = await getOrCreateWorkspace()
      setWorkspace(ws)
      const list = await getTasks(ws.id)
      setTasks(list)
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
      if (editTask) {
        await updateTask(editTask.id, fields, projectIds)
      } else {
        await addTask(workspace.id, fields, projectIds)
      }
      await load()
    } catch (e) { toast.error(errMsg(e)); throw e }
  }

  async function handleDelete(id: string) {
    if (!confirm('태스크를 삭제할까요?')) return
    try {
      await deleteTask(id)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleStatusChange(id: string, status: TaskStatus) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    try { await updateTask(id, { status }) }
    catch (e) { toast.error(errMsg(e)); await load() }
  }

  function toggleCollapse(status: TaskStatus) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  function openAdd(status: TaskStatus) {
    setDefaultStatus(status)
    setEditTask(null)
    setFormOpen(true)
  }

  const handleSearch = useCallback(
    async (query: string) => workspace ? searchProjects(workspace.id, query) : [],
    [workspace]
  )

  // ── 사이드바 데이터 계산 ──────────────────────────────────
  // 프로젝트별 카운트
  const projectMap = new Map<string, { name: string; count: number; colorIdx: number }>()
  tasks.forEach(t => {
    t.projects?.forEach(p => {
      if (!projectMap.has(p.id)) projectMap.set(p.id, { name: p.name, count: 0, colorIdx: projectMap.size })
      projectMap.get(p.id)!.count++
    })
  })
  const sidebarProjects = [...projectMap.entries()].map(([id, v]) => ({ id, ...v }))

  // 담당자별 카운트 (나 = mine type)
  const assigneeMap = new Map<string, { label: string; count: number }>()
  tasks.forEach(t => {
    if (t.type === 'mine') {
      const cur = assigneeMap.get('__mine__') ?? { label: '내 할일', count: 0 }
      assigneeMap.set('__mine__', { ...cur, count: cur.count + 1 })
    } else if (t.assignee) {
      const cur = assigneeMap.get(t.assignee) ?? { label: t.assignee, count: 0 }
      assigneeMap.set(t.assignee, { ...cur, count: cur.count + 1 })
    }
  })
  const sidebarAssignees = [...assigneeMap.entries()].map(([key, v]) => ({ key, ...v }))

  // 마감일 집합 (캘린더 dot용)
  const dueDateSet = new Set(tasks.map(t => t.due_date).filter(Boolean) as string[])

  // ── 필터링 ────────────────────────────────────────────────
  let filtered = tasks
  if (filterType !== 'all') filtered = filtered.filter(t => t.type === filterType)
  if (filterProject) filtered = filtered.filter(t => t.projects?.some(p => p.id === filterProject))
  if (filterAssignee) {
    if (filterAssignee === '__mine__') filtered = filtered.filter(t => t.type === 'mine')
    else filtered = filtered.filter(t => t.assignee === filterAssignee)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 왼쪽 사이드바 ─────────────────────────────────── */}
      <div className="w-60 shrink-0 border-r bg-stone-50 flex flex-col overflow-y-auto">
        {/* 헤더 */}
        <div className="px-4 py-3 border-b bg-white">
          <h1 className="text-sm font-semibold text-gray-800">태스크</h1>
        </div>

        <div className="flex flex-col gap-1 p-2">
          {/* 전체 */}
          <button
            onClick={() => { setFilterProject(null); setFilterAssignee(null) }}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${!filterProject && !filterAssignee ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <LayoutList size={13} className="shrink-0" />
            <span>전체</span>
            <span className="ml-auto text-xs text-gray-400">{tasks.length}</span>
          </button>

          {/* 프로젝트 */}
          {sidebarProjects.length > 0 && (
            <div className="mt-2">
              <div className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">프로젝트</div>
              {sidebarProjects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setFilterProject(filterProject === p.id ? null : p.id); setFilterAssignee(null) }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${filterProject === p.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PROJECT_COLORS[p.colorIdx % PROJECT_COLORS.length] }} />
                  <span className="flex-1 truncate text-left">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* 담당자 */}
          {sidebarAssignees.length > 0 && (
            <div className="mt-2">
              <div className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">담당자</div>
              {sidebarAssignees.map(a => (
                <button
                  key={a.key}
                  onClick={() => { setFilterAssignee(filterAssignee === a.key ? null : a.key); setFilterProject(null) }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${filterAssignee === a.key ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${a.key === '__mine__' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.key === '__mine__' ? '나' : abbrev(a.label)}
                  </span>
                  <span className="flex-1 truncate text-left">{a.label}</span>
                  <span className="text-xs text-gray-400">{a.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 캘린더 */}
        <div className="mt-2 border-t">
          <MiniCalendar dueDates={dueDateSet} />
        </div>
      </div>

      {/* ── 메인 콘텐츠 ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* 탭 바 */}
        <div className="flex items-center border-b bg-white shrink-0 px-4">
          <div className="flex">
            {(['all', 'mine', 'delegated'] as const).map(v => (
              <button
                key={v}
                onClick={() => setFilterType(v)}
                className={`px-4 py-3 text-sm border-b-2 transition-colors ${filterType === v ? 'border-indigo-500 text-indigo-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {v === 'all' ? '전체' : v === 'mine' ? '내 할일' : '업무지시'}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => openAdd('to-do')}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded hover:bg-indigo-50 transition-colors border border-indigo-200"
            >
              <Plus size={13} /> 태스크 추가
            </button>
          </div>
        </div>

        {/* 컬럼 헤더 */}
        <div className="flex items-center px-4 py-2 border-b bg-gray-50 shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <div className="w-5 shrink-0 mr-3" />
          <div className="flex-1 mr-4">제목·프로젝트</div>
          <div className="w-32 shrink-0">담당자</div>
          <div className="w-14 shrink-0">시작일</div>
          <div className="w-14 shrink-0">마감일</div>
          <div className="w-14 shrink-0">등록일</div>
          <div className="w-12 shrink-0" />
        </div>

        {/* 태스크 목록 */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <p className="text-sm">태스크가 없어요</p>
              <button onClick={() => openAdd('to-do')} className="text-xs text-indigo-500 hover:text-indigo-700">
                + 첫 번째 태스크 추가
              </button>
            </div>
          ) : (
            STATUS_GROUPS.map(({ status, label, color }) => {
              const group = filtered.filter(t => t.status === status)
              const isCollapsed = collapsed.has(status)
              return (
                <div key={status}>
                  {/* 그룹 헤더 */}
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
                  </button>

                  {!isCollapsed && (
                    <>
                      {group.map(task => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onEdit={t => { setEditTask(t); setFormOpen(true) }}
                          onDelete={handleDelete}
                          onStatusChange={handleStatusChange}
                        />
                      ))}
                      {/* 인라인 추가 버튼 */}
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
            })
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
