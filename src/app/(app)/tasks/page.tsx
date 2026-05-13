'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Circle, CheckCircle2, Clock, ChevronDown, ChevronRight, Pencil, Trash2, Link } from 'lucide-react'
import { toast } from 'sonner'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { getOrCreateWorkspace, getTasks, addTask, updateTask, deleteTask, searchProjects } from '@/lib/gantt-service'
import type { GanttTask, TaskStatus, TaskType, Workspace } from '@/types'

// ── 상수 ─────────────────────────────────────────────────────
const STATUS_GROUPS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'to-do',       label: 'To-Do',       color: '#6366f1' },
  { status: 'in-progress', label: 'In Progress',  color: '#f59e0b' },
  { status: 'backlog',     label: 'Backlog',      color: '#9ca3af' },
  { status: 'done',        label: 'Done',         color: '#22c55e' },
]

const STATUS_ICON = {
  'backlog':     <Circle size={14} className="text-gray-300" />,
  'to-do':      <Circle size={14} className="text-indigo-400" />,
  'in-progress': <Clock  size={14} className="text-amber-400" />,
  'done':       <CheckCircle2 size={14} className="text-green-400" />,
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toDateString())
}

// ── Task 행 ───────────────────────────────────────────────────
function TaskRow({ task, onEdit, onDelete, onStatusChange }: {
  task: GanttTask
  onEdit: (task: GanttTask) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => void
}) {
  const STATUS_ORDER: TaskStatus[] = ['to-do', 'in-progress', 'backlog', 'done']

  function cycleStatus() {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]
    onStatusChange(task.id, next)
  }

  const overdue = isOverdue(task.due_date)

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
      {/* 상태 아이콘 */}
      <button onClick={cycleStatus} className="shrink-0 hover:scale-110 transition-transform" title="클릭하여 상태 변경">
        {STATUS_ICON[task.status]}
      </button>

      {/* 제목 */}
      <span className={`flex-1 text-sm text-gray-800 truncate ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
        {task.title}
      </span>

      {/* 구분 뱃지 */}
      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
        task.type === 'mine'
          ? 'bg-indigo-50 text-indigo-500'
          : 'bg-amber-50 text-amber-600'
      }`}>
        {task.type === 'mine' ? '내 할일' : '업무지시'}
      </span>

      {/* 담당자 */}
      {task.type === 'delegated' && task.assignee && (
        <span className="shrink-0 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          👤 {task.assignee}
        </span>
      )}

      {/* 연결 프로젝트 */}
      {task.projects && task.projects.length > 0 && (
        <div className="shrink-0 flex items-center gap-1">
          <Link size={10} className="text-gray-300" />
          {task.projects.slice(0, 2).map(p => (
            <span key={p.id} className="text-[10px] text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded truncate max-w-[80px]" title={p.name}>
              {p.name}
            </span>
          ))}
          {task.projects.length > 2 && (
            <span className="text-[10px] text-gray-400">+{task.projects.length - 2}</span>
          )}
        </div>
      )}

      {/* 마감일 */}
      {task.due_date && (
        <span className={`shrink-0 text-[11px] tabular-nums ${overdue && task.status !== 'done' ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
          {overdue && task.status !== 'done' ? '⚠ ' : ''}{formatDate(task.due_date)}
        </span>
      )}

      {/* 등록일 */}
      <span className="shrink-0 text-[10px] text-gray-300 tabular-nums">
        {formatDate(task.created_at)}
      </span>

      {/* 액션 버튼 */}
      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(task)} className="p-1 text-gray-300 hover:text-indigo-500 rounded">
          <Pencil size={12} />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1 text-gray-300 hover:text-red-400 rounded">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Tasks 페이지 ──────────────────────────────────────────────
export default function TasksPage() {
  const [workspace, setWorkspace]   = useState<Workspace | null>(null)
  const [tasks, setTasks]           = useState<GanttTask[]>([])
  const [loading, setLoading]       = useState(true)
  const [formOpen, setFormOpen]     = useState(false)
  const [editTask, setEditTask]     = useState<GanttTask | null>(null)
  const [collapsed, setCollapsed]   = useState<Set<TaskStatus>>(new Set(['done']))
  const [filterType, setFilterType] = useState<'all' | 'mine' | 'delegated'>('all')

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
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; due_date: string | null; memo: string | null },
    projectIds: string[]
  ) {
    if (!workspace) return
    try {
      if (editTask) {
        await updateTask(editTask.id, fields, projectIds)
      } else {
        const created = await addTask(workspace.id, fields, projectIds)
        setTasks(prev => [created, ...prev])
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
    try {
      await updateTask(id, { status })
    } catch (e) {
      toast.error(errMsg(e))
      await load()
    }
  }

  function toggleCollapse(status: TaskStatus) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  const handleSearch = useCallback(
    async (query: string) => workspace ? searchProjects(workspace.id, query) : [],
    [workspace]
  )

  const filtered = filterType === 'all' ? tasks : tasks.filter(t => t.type === filterType)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 툴바 */}
      <div className="h-10 border-b bg-white flex items-center px-4 gap-3 shrink-0">
        <span className="text-sm font-semibold text-gray-700">태스크</span>

        {/* 구분 필터 */}
        <div className="flex items-center gap-0.5 border rounded overflow-hidden text-[11px] ml-2">
          {(['all', 'mine', 'delegated'] as const).map(v => (
            <button
              key={v}
              onClick={() => setFilterType(v)}
              className={`px-2.5 py-1 transition-colors ${filterType === v ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {v === 'all' ? '전체' : v === 'mine' ? '내 할일' : '업무지시'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => { setEditTask(null); setFormOpen(true) }}
          className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 rounded hover:bg-indigo-50 transition-colors"
        >
          <Plus size={13} /> 태스크 추가
        </button>
      </div>

      {/* 컬럼 헤더 */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">
        <span className="w-4 shrink-0" />
        <span className="flex-1">제목</span>
        <span className="w-16 text-right shrink-0">구분</span>
        <span className="w-20 text-right shrink-0">담당자</span>
        <span className="w-24 text-right shrink-0">프로젝트</span>
        <span className="w-12 text-right shrink-0">마감일</span>
        <span className="w-12 text-right shrink-0">등록일</span>
        <span className="w-12 shrink-0" />
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <p className="text-sm">태스크가 없어요</p>
            <button
              onClick={() => { setEditTask(null); setFormOpen(true) }}
              className="text-xs text-indigo-500 hover:text-indigo-700"
            >
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
                    : <ChevronDown  size={12} className="text-gray-400 shrink-0" />
                  }
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs font-semibold text-gray-600">{label}</span>
                  <span className="text-[10px] text-gray-400 ml-0.5">{group.length}</span>
                </button>

                {/* 그룹 내 태스크 목록 */}
                {!isCollapsed && group.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onEdit={t => { setEditTask(t); setFormOpen(true) }}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      <TaskFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTask(null) }}
        onSave={handleSave}
        editTask={editTask}
        onSearchProjects={handleSearch}
      />
    </div>
  )
}
