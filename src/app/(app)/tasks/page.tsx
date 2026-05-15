'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plus, ChevronDown, ChevronRight, LayoutList, Search, X,
  PanelLeftClose, PanelLeftOpen, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { TaskTrashPanel } from '@/components/tasks/TaskTrashPanel'
import {
  getOrCreateWorkspace, getTasks, addTask, updateTask, softDeleteTask,
  getDeletedTasksCount, restoreTask, searchProjects,
} from '@/lib/gantt-service'
import type { GanttTask, TaskStatus, TaskType, Priority, Workspace } from '@/types'
import { todayStrKST } from '@/lib/gantt-utils'

import { STATUS_GROUPS, PROJECT_COLORS, ASSIGNEE_COLORS, VIEW_TABS, type ViewType } from './_constants'
import { isOverdue, isStartDelayed, isDueThisWeek, isDueNextWeek, overdueDays, daysDiff, isLightColor } from './_utils'
import { TaskRow, DraggableTaskRow, DroppableGroup } from './_components/TaskRow'
import { ListView } from './_components/ListView'
import { CalendarView } from './_components/CalendarView'
import { GanttView } from './_components/GanttView'
import { KanbanView } from './_components/KanbanView'
import { TaskDetailDrawer, labelColor } from './_components/TaskDetailDrawer'

export default function TasksPage() {
  const [workspace,      setWorkspace]      = useState<Workspace | null>(null)
  const [tasks,          setTasks]          = useState<GanttTask[]>([])
  const [loading,        setLoading]        = useState(true)
  const [formOpen,       setFormOpen]       = useState(false)
  const [editTask,       setEditTask]       = useState<GanttTask | null>(null)
  const [sidebarOpen,    setSidebarOpen]    = useState(true)
  const [collapsed,      setCollapsed]      = useState<Set<string>>(new Set<string>())
  const [filterProject,  setFilterProject]  = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterLabel,    setFilterLabel]    = useState<string | null>(null)
  const [quickFilter,    setQuickFilter]    = useState<'all' | 'overdue' | 'start-delayed' | 'due-today' | 'due-this-week' | 'due-next-week'>('all')
  const [defaultStatus,  setDefaultStatus]  = useState<TaskStatus>('to-do')
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const [view,           setView]           = useState<ViewType>('normal')
  const [trashOpen,      setTrashOpen]      = useState(false)
  const [trashCount,     setTrashCount]     = useState(0)
  const [searchQuery,    setSearchQuery]    = useState('')
  const [searchOpen,     setSearchOpen]     = useState(false)
  const searchRef       = useRef<HTMLDivElement>(null)
  const searchInputRef  = useRef<HTMLInputElement>(null)
  const [draggingTask,   setDraggingTask]   = useState<GanttTask | null>(null)
  const [pendingParentId, setPendingParentId] = useState<string | null>(null)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [drawerTask,      setDrawerTask]      = useState<GanttTask | null>(null)
  const [drawerOpen,      setDrawerOpen]      = useState(false)
  const [pendingDefaultProjects, setPendingDefaultProjects] = useState<{ id: string; name: string; board_name: string }[]>([])
  const [assigneesExpanded, setAssigneesExpanded] = useState(false)
  const [quickAddStatus,   setQuickAddStatus]   = useState<TaskStatus | null>(null)
  const [quickAddParentId, setQuickAddParentId] = useState<string | null>(null)
  const [quickAddTitle,    setQuickAddTitle]    = useState('')

  const errMsg = (e: unknown) => e instanceof Error ? e.message : '오류가 발생했습니다.'

  const load = useCallback(async () => {
    try {
      const ws = await getOrCreateWorkspace()
      setWorkspace(ws)
      const [list, cnt] = await Promise.all([getTasks(ws.id), getDeletedTasksCount(ws.id)])
      setTasks(list)
      setTrashCount(cnt)
      const statuses: TaskStatus[] = ['backlog', 'to-do', 'in-progress', 'done', 'pending']
      setCollapsed(new Set(
        statuses.filter(s => s === 'done' || s === 'pending' || list.filter(t => t.status === s).length === 0)
      ))
      // 하위 태스크가 있는 부모는 기본 펼침
      const parentIds = new Set(list.filter(t => t.parent_id).map(t => t.parent_id as string))
      setExpandedParents(parentIds)
    } catch (e) { toast.error(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!searchRef.current?.contains(e.target as Node)) {
        if (!searchQuery) setSearchOpen(false)
      }
    }
    if (searchOpen) document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [searchOpen, searchQuery])

  async function handleSave(
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; priority: Priority },
    projectIds: string[]
  ) {
    if (!workspace) return
    try {
      await addTask(workspace.id, { ...fields, parent_id: pendingParentId }, projectIds)
      setPendingParentId(null)
      setPendingDefaultProjects([])
      await load()
    } catch (e) { toast.error(errMsg(e)); throw e }
  }

  async function handleDrawerSave(
    task: GanttTask,
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels: string[]; priority: Priority },
    projectIds: string[]
  ) {
    try {
      await updateTask(task.id, fields, projectIds)
      await load()
    } catch (e) { toast.error(errMsg(e)); throw e }
  }

  async function handleDelete(id: string) {
    try {
      await softDeleteTask(id)
      setTasks(prev => prev.filter(t => t.id !== id))
      setTrashCount(prev => prev + 1)
      toast('휴지통으로 이동했어요', {
        action: {
          label: '되돌리기',
          onClick: async () => {
            await restoreTask(id)
            setTrashCount(prev => Math.max(0, prev - 1))
            await load()
          },
        },
      })
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleStatusChange(id: string, status: TaskStatus) {
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, status } : t)
    setTasks(updatedTasks)
    try {
      await updateTask(id, { status })
      // 자동 완료: 하위 태스크가 모두 done이면 부모도 done으로
      if (status === 'done') {
        const changedTask = updatedTasks.find(t => t.id === id)
        if (changedTask?.parent_id) {
          const siblings = updatedTasks.filter(t => t.parent_id === changedTask.parent_id)
          if (siblings.length > 0 && siblings.every(t => t.status === 'done')) {
            await updateTask(changedTask.parent_id, { status: 'done' })
            setTasks(prev => prev.map(t => t.id === changedTask.parent_id ? { ...t, status: 'done' } : t))
            toast('하위 태스크가 모두 완료되어 상위 태스크도 완료했어요')
          }
        }
      }
    }
    catch (e) { toast.error(errMsg(e)); await load() }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find(t => t.id === event.active.id)
    if (task) setDraggingTask(task)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTask(null)
    const { active, over } = event
    if (!over) return
    const newStatus = over.id as TaskStatus
    const task = tasks.find(t => t.id === active.id)
    if (!task || task.status === newStatus) return
    handleStatusChange(task.id, newStatus)
  }

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function openAdd(status: TaskStatus) {
    setDefaultStatus(status); setEditTask(null); setPendingParentId(null); setFormOpen(true)
  }

  async function commitQuickAdd(status: TaskStatus) {
    if (!workspace) return
    const title = quickAddTitle.trim()
    if (!title) { setQuickAddStatus(null); setQuickAddTitle(''); return }
    try {
      await addTask(workspace.id, {
        title,
        status,
        type: 'mine',
        assignee: null,
        start_date: null,
        due_date: null,
        memo: null,
        priority: 2,
        labels: [],
      }, [])
      setQuickAddTitle('')
      await load()
      // 연속 등록 위해 입력창 유지
    } catch (e) { toast.error(errMsg(e)) }
  }

  function cancelQuickAdd() { setQuickAddStatus(null); setQuickAddTitle('') }

  async function listQuickCreate(title: string, status: TaskStatus) {
    if (!workspace) return
    try {
      await addTask(workspace.id, {
        title, status, type: 'mine', assignee: null,
        start_date: null, due_date: null, memo: null, priority: 2, labels: [],
      }, [])
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function listSubQuickCreate(parentId: string, title: string) {
    if (!workspace) return
    const parent = tasks.find(t => t.id === parentId)
    if (!parent) return
    try {
      await addTask(workspace.id, {
        title,
        status: parent.status,
        type: 'mine',
        assignee: null,
        start_date: null,
        due_date: null,
        memo: null,
        priority: 2,
        labels: [],
        parent_id: parentId,
      }, parent.projects?.map(p => p.id) ?? [])
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }

  function openAddSubTask(parentId: string, _status: TaskStatus) {
    // 인라인 퀵 등록으로 전환 — 부모를 펼치고 입력창 노출
    setExpandedParents(prev => new Set([...prev, parentId]))
    setQuickAddParentId(parentId)
    setQuickAddTitle('')
  }

  async function commitQuickAddSub(parentId: string) {
    if (!workspace) return
    const parent = tasks.find(t => t.id === parentId)
    if (!parent) return
    const title = quickAddTitle.trim()
    if (!title) { setQuickAddParentId(null); setQuickAddTitle(''); return }
    try {
      await addTask(workspace.id, {
        title,
        status: parent.status,
        type: 'mine',
        assignee: null,
        start_date: null,
        due_date: null,
        memo: null,
        priority: 2,
        labels: [],
        parent_id: parentId,
      }, parent.projects?.map(p => p.id) ?? [])
      setQuickAddTitle('')
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }

  function cancelQuickAddSub() { setQuickAddParentId(null); setQuickAddTitle('') }

  function toggleExpanded(parentId: string) {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId)
      return next
    })
  }

  const handleSearch = useCallback(
    async (query: string) => workspace ? searchProjects(workspace.id, query) : [],
    [workspace]
  )

  // ── 통계 ─────────────────────────────────────────────────────
  const todayStr           = todayStrKST()
  const overdueCount       = tasks.filter(t => isOverdue(t.due_date, t.status)).length
  const startDelayedCount  = tasks.filter(t => isStartDelayed(t.start_date, t.status) && !isOverdue(t.due_date, t.status)).length
  const dueTodayCount      = tasks.filter(t => t.due_date === todayStr && t.status !== 'done').length
  const dueThisWeekCount   = tasks.filter(t => isDueThisWeek(t.due_date) && t.status !== 'done').length
  const dueNextWeekCount   = tasks.filter(t => isDueNextWeek(t.due_date) && t.status !== 'done').length
  const inProgressCount    = tasks.filter(t => t.status === 'in-progress').length
  const todoCount          = tasks.filter(t => t.status === 'to-do').length

  // ── 사이드바 데이터 ──────────────────────────────────────────
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
  const allAssignees = [...assigneeMap.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count)
  const ASSIGNEE_VISIBLE_LIMIT = 7
  const sidebarAssigneesFull = allAssignees
    .filter(a => !assigneeSearch || a.label.toLowerCase().includes(assigneeSearch.toLowerCase()))
  const isSearching = !!assigneeSearch.trim()
  const sidebarAssignees = (isSearching || assigneesExpanded)
    ? sidebarAssigneesFull
    : sidebarAssigneesFull.slice(0, ASSIGNEE_VISIBLE_LIMIT)
  const assigneesHidden = sidebarAssigneesFull.length - sidebarAssignees.length

  const assigneeColorMap = new Map<string, string>()
  allAssignees.forEach(({ key }, i) => {
    assigneeColorMap.set(key, ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length])
  })

  function getAssigneeKey(t: GanttTask) {
    return t.type === 'mine' ? '__mine__' : (t.assignee ?? '')
  }

  const labelMap = new Map<string, number>()
  tasks.forEach(t => (t.labels ?? []).forEach(l => labelMap.set(l, (labelMap.get(l) ?? 0) + 1)))
  const sidebarLabels = [...labelMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

  // ── 필터링 ───────────────────────────────────────────────────
  let filtered = tasks
  if (filterProject)   filtered = filtered.filter(t => t.projects?.some(p => p.id === filterProject))
  if (filterAssignee) {
    if (filterAssignee === '__mine__') filtered = filtered.filter(t => t.type === 'mine')
    else filtered = filtered.filter(t => t.assignee === filterAssignee)
  }
  if (filterLabel)     filtered = filtered.filter(t => (t.labels ?? []).includes(filterLabel))
  if (quickFilter === 'overdue')       filtered = filtered.filter(t => isOverdue(t.due_date, t.status))
  if (quickFilter === 'start-delayed') filtered = filtered.filter(t => isStartDelayed(t.start_date, t.status) && !isOverdue(t.due_date, t.status))
  if (quickFilter === 'due-today')     filtered = filtered.filter(t => t.due_date === todayStr && t.status !== 'done')
  if (quickFilter === 'due-this-week') filtered = filtered.filter(t => isDueThisWeek(t.due_date) && t.status !== 'done')
  if (quickFilter === 'due-next-week') filtered = filtered.filter(t => isDueNextWeek(t.due_date) && t.status !== 'done')
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.assignee ?? '').toLowerCase().includes(q) ||
      (t.memo ?? '').toLowerCase().includes(q) ||
      (t.labels ?? []).some(l => l.toLowerCase().includes(q))
    )
  }

  const overdueGroup = filtered.filter(t => isOverdue(t.due_date, t.status) && !t.parent_id)
  const overdueIds   = new Set(overdueGroup.map(t => t.id))
  const avgOverdueDays = overdueGroup.length
    ? Math.round(overdueGroup.reduce((s, t) => s + overdueDays(t.due_date), 0) / overdueGroup.length * 10) / 10
    : 0

  // 최상위 태스크만 (parent_id 없는 것)
  function getGroup(status: TaskStatus) {
    return filtered.filter(t => t.status === status && !overdueIds.has(t.id) && !t.parent_id)
  }
  // 특정 부모의 하위 태스크 (filtered 내에서)
  function getSubTasks(parentId: string) {
    return filtered.filter(t => t.parent_id === parentId)
  }
  const ipGroup = getGroup('in-progress')
  const avgIPDays = ipGroup.length
    ? Math.round(ipGroup.reduce((s, t) => s + daysDiff(t.start_date), 0) / ipGroup.length * 10) / 10
    : 0

  const quickItems = [
    { key: 'all',           label: '전체',         count: tasks.length,        icon: <LayoutList size={12} className="shrink-0" /> },
    { key: 'overdue',       label: '지연',          count: overdueCount,       icon: <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" /> },
    { key: 'start-delayed', label: '시작 지연',     count: startDelayedCount,  icon: <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /> },
    { key: 'due-today',     label: '오늘 마감',     count: dueTodayCount,      icon: <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" /> },
    { key: 'due-this-week', label: '이번 주 마감',  count: dueThisWeekCount,   icon: <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /> },
    { key: 'due-next-week', label: '다음 주 마감',  count: dueNextWeekCount,   icon: <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" /> },
  ] as const

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">로딩 중...</div>
  )

  const editHandler = (t: GanttTask) => { setDrawerTask(t); setDrawerOpen(true) }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 사이드바 ─────────────────────────────────────────── */}
      <div
        className="shrink-0 border-r bg-stone-50 flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: sidebarOpen ? 240 : 0 }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-white shrink-0 gap-2">
          <h1 className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">태스크</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
            title="사이드바 닫기"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">
          {/* 퀵 필터 */}
          {quickItems.map(item => (
            <button
              key={item.key}
              onClick={() => setQuickFilter(quickFilter === item.key && item.key !== 'all' ? 'all' : item.key as typeof quickFilter)}
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
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: assigneeColorMap.get(a.key) ?? '#9ca3af' }}
                />
                <span className="flex-1 truncate text-left">{a.label}</span>
                <span className="text-xs text-gray-400">{a.count}</span>
              </button>
            ))}
            {!isSearching && (assigneesHidden > 0 || assigneesExpanded) && (
              <button
                onClick={() => setAssigneesExpanded(v => !v)}
                className="w-full text-left px-2 py-1 text-[11px] text-gray-400 hover:text-indigo-500 transition-colors"
              >
                {assigneesExpanded ? '접기' : `+ ${assigneesHidden}명 더보기`}
              </button>
            )}
          </div>

          {/* 라벨 */}
          {sidebarLabels.length > 0 && (
            <div className="mt-3">
              <div className="px-2 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">라벨</div>
              <div className="flex flex-wrap gap-1 px-2">
                {sidebarLabels.map(l => {
                  const active = filterLabel === l.name
                  const bg = labelColor(l.name)
                  const fg = isLightColor(bg) ? '#1f2937' : '#ffffff'
                  return (
                    <button
                      key={l.name}
                      onClick={() => { setFilterLabel(active ? null : l.name); setFilterProject(null); setFilterAssignee(null) }}
                      className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full transition-all ${
                        active ? 'ring-2 ring-offset-1' : 'opacity-75 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: bg, color: fg, ...(active ? { ringColor: bg } : {}) }}
                    >
                      # {l.name}
                      <span className="text-[9px] opacity-70">{l.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 휴지통 */}
        <div className="shrink-0 border-t px-1.5 py-1.5">
          <button
            onClick={() => setTrashOpen(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Trash2 size={13} className="shrink-0" />
            <span className="whitespace-nowrap">휴지통</span>
            {trashCount > 0 && (
              <span className="ml-auto text-[10px] bg-red-100 text-red-400 font-semibold px-1.5 py-0.5 rounded-full">
                {trashCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 메인 콘텐츠 ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* 액션 바 */}
        <div className="flex items-center border-b bg-white shrink-0 px-4 py-2 gap-2">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="사이드바 열기"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}

          {/* 뷰 탭 */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {VIEW_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                  ${view === tab.key
                    ? 'bg-white text-gray-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* 검색 — 토글 펼침 */}
          <div ref={searchRef} className="relative flex items-center ml-2">
            {searchOpen || searchQuery ? (
              <div className="relative flex items-center">
                <Search size={12} className="absolute left-2 text-gray-300 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }}
                  placeholder="태스크 검색"
                  className="text-[11px] pl-6 pr-6 py-1 border rounded w-40 outline-none focus:ring-1 focus:ring-indigo-300 text-gray-600 placeholder:text-gray-300"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
                    className="absolute right-1 text-gray-300 hover:text-gray-500"
                    title="지우기"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                title="태스크 검색"
                className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Search size={13} />
              </button>
            )}
          </div>

          <div className="ml-auto">
            <button
              onClick={() => openAdd('to-do')}
              className="flex items-center gap-1 text-xs font-medium text-white bg-gray-900 hover:bg-black px-3 py-1.5 rounded transition-colors"
            >
              <Plus size={13} /> 태스크 추가
            </button>
          </div>
        </div>

        {/* 담당자 필터 바 — 사이드바 닫혔을 때만 표시 (사이드바 "담당자" 섹션과 중복 회피) */}
        {!sidebarOpen && (view === 'normal' || view === 'list' || view === 'kanban') && allAssignees.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-white shrink-0 overflow-x-auto">
            <button
              onClick={() => setFilterAssignee(null)}
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap
                ${!filterAssignee ? 'bg-gray-800 border-gray-800 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
            >
              전체
            </button>
            {allAssignees.map(({ key, label }, i) => {
              const color = ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length]
              const active = filterAssignee === key
              return (
                <button
                  key={key}
                  onClick={() => setFilterAssignee(active ? null : key)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap
                    ${active ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                  style={active ? { backgroundColor: color, borderColor: color } : {}}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? 'white' : color }} />
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── 뷰 렌더링 ─────────────────────────────────────── */}
        {view === 'list' ? (() => {
          const hasFilter = quickFilter !== 'all' || !!filterProject || !!filterAssignee || !!filterLabel || !!searchQuery.trim()
          const emptyMsg = quickFilter === 'overdue'       ? '지연된 태스크가 없어요 👍'
                         : quickFilter === 'start-delayed' ? '시작 지연 태스크가 없어요 👍'
                         : quickFilter === 'due-today'     ? '오늘 마감 태스크가 없어요'
                         : quickFilter === 'due-this-week' ? '이번 주 마감 태스크가 없어요'
                         : quickFilter === 'due-next-week' ? '다음 주 마감 태스크가 없어요'
                         : hasFilter                       ? '조건에 맞는 태스크가 없어요'
                         : '태스크가 없어요'
          return (
            <ListView
              tasks={filtered}
              assigneeColorMap={assigneeColorMap}
              getAssigneeKey={getAssigneeKey}
              onEdit={editHandler}
              onStatusChange={handleStatusChange}
              emptyMessage={emptyMsg}
              onQuickCreate={listQuickCreate}
              onSubQuickCreate={listSubQuickCreate}
            />
          )
        })() : view === 'calendar' ? (
          <CalendarView
            tasks={filtered}
            onEdit={editHandler}
            onStatusChange={handleStatusChange}
          />
        ) : view === 'kanban' ? (
          <KanbanView
            tasks={filtered}
            assigneeColorMap={assigneeColorMap}
            getAssigneeKey={getAssigneeKey}
            onEdit={editHandler}
            onStatusChange={handleStatusChange}
            onQuickCreate={listQuickCreate}
          />
        ) : view === 'gantt' ? (
          <GanttView tasks={filtered} onEdit={editHandler} />
        ) : (
          /* 일반 뷰 */
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center px-4 py-2 border-b bg-gray-50 shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 z-10">
              <div className="w-5 shrink-0 mr-3" />
              <div className="flex-1 mr-4">태스크</div>
              <div className="w-10 shrink-0">메모</div>
              <div className="w-28 shrink-0">담당자</div>
              <div className="w-24 shrink-0">일정</div>
            </div>

            {filtered.length === 0 ? (() => {
              const hasFilter = quickFilter !== 'all' || !!filterProject || !!filterAssignee || !!filterLabel || !!searchQuery.trim()
              const emptyMsg = quickFilter === 'overdue'       ? '지연된 태스크가 없어요 👍'
                             : quickFilter === 'start-delayed' ? '시작 지연 태스크가 없어요 👍'
                             : quickFilter === 'due-today'     ? '오늘 마감 태스크가 없어요'
                             : quickFilter === 'due-this-week' ? '이번 주 마감 태스크가 없어요'
                             : quickFilter === 'due-next-week' ? '다음 주 마감 태스크가 없어요'
                             : hasFilter                       ? '조건에 맞는 태스크가 없어요'
                             : '태스크가 없어요'
              return (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                  <p className="text-xs">{emptyMsg}</p>
                  {!hasFilter && (
                    <button onClick={() => openAdd('to-do')} className="text-xs text-gray-900 hover:text-black">+ 첫 번째 태스크 추가</button>
                  )}
                </div>
              )
            })() : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                    {!collapsed.has('__overdue__') && overdueGroup.map(task => {
                      const subs = getSubTasks(task.id)
                      const isExp = expandedParents.has(task.id) || quickAddParentId === task.id
                      return (
                        <div key={task.id}>
                          <DraggableTaskRow task={task}
                            onEdit={editHandler} onDelete={handleDelete} onStatusChange={handleStatusChange}
                            isDraggingId={draggingTask?.id}
                            assigneeColor={assigneeColorMap.get(getAssigneeKey(task))}
                            subTaskStats={subs.length > 0 ? { total: subs.length, done: subs.filter(s => s.status === 'done').length } : undefined}
                            onAddSubTask={() => openAddSubTask(task.id, task.status)}
                            onToggleExpand={() => toggleExpanded(task.id)}
                          />
                          {isExp && subs.map(sub => (
                            <TaskRow key={sub.id} task={sub} isSubTask
                              onEdit={editHandler} onDelete={handleDelete} onStatusChange={handleStatusChange}
                              assigneeColor={assigneeColorMap.get(getAssigneeKey(sub))}
                            />
                          ))}
                          {isExp && quickAddParentId === task.id ? (
                            <div className="flex items-center gap-1.5 pl-12 pr-4 py-1.5 border-b border-gray-50 bg-indigo-50/30">
                              <Plus size={10} className="text-indigo-400 shrink-0" />
                              <input
                                autoFocus
                                value={quickAddTitle}
                                onChange={e => setQuickAddTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitQuickAddSub(task.id) }
                                  if (e.key === 'Escape') cancelQuickAddSub()
                                }}
                                onBlur={() => { if (!quickAddTitle.trim()) cancelQuickAddSub() }}
                                placeholder="하위 태스크 제목 후 Enter, Esc 취소"
                                className="flex-1 text-[11px] outline-none placeholder:text-gray-300 bg-transparent text-gray-800"
                              />
                            </div>
                          ) : isExp && subs.length > 0 && (
                            <button
                              onClick={() => openAddSubTask(task.id, task.status)}
                              className="flex items-center gap-1.5 pl-12 pr-4 py-1.5 w-full text-left text-[11px] text-gray-300 hover:text-indigo-400 hover:bg-indigo-50/30 transition-colors border-b border-gray-50"
                            >
                              <Plus size={10} /> 하위 태스크 추가
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {STATUS_GROUPS.map(({ status, label, color }) => {
                  const group = getGroup(status)
                  const isCollapsed = collapsed.has(status)
                  return (
                    <DroppableGroup key={status} status={status}>
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
                          {group.map(task => {
                            const subs = getSubTasks(task.id)
                            const isExp = expandedParents.has(task.id) || quickAddParentId === task.id
                            return (
                              <div key={task.id}>
                                <DraggableTaskRow task={task}
                                  onEdit={editHandler} onDelete={handleDelete} onStatusChange={handleStatusChange}
                                  isDraggingId={draggingTask?.id}
                                  assigneeColor={assigneeColorMap.get(getAssigneeKey(task))}
                                  subTaskStats={subs.length > 0 ? { total: subs.length, done: subs.filter(s => s.status === 'done').length } : undefined}
                                  onAddSubTask={() => openAddSubTask(task.id, task.status)}
                                  onToggleExpand={() => toggleExpanded(task.id)}
                                />
                                {isExp && subs.map(sub => (
                                  <TaskRow key={sub.id} task={sub} isSubTask
                                    onEdit={editHandler} onDelete={handleDelete} onStatusChange={handleStatusChange}
                                    assigneeColor={assigneeColorMap.get(getAssigneeKey(sub))}
                                  />
                                ))}
                                {isExp && quickAddParentId === task.id ? (
                                  <div className="flex items-center gap-1.5 pl-12 pr-4 py-1.5 border-b border-gray-50 bg-indigo-50/30">
                                    <Plus size={10} className="text-indigo-400 shrink-0" />
                                    <input
                                      autoFocus
                                      value={quickAddTitle}
                                      onChange={e => setQuickAddTitle(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); commitQuickAddSub(task.id) }
                                        if (e.key === 'Escape') cancelQuickAddSub()
                                      }}
                                      onBlur={() => { if (!quickAddTitle.trim()) cancelQuickAddSub() }}
                                      placeholder="하위 태스크 제목 후 Enter, Esc 취소"
                                      className="flex-1 text-[11px] outline-none placeholder:text-gray-300 bg-transparent text-gray-800"
                                    />
                                  </div>
                                ) : isExp && subs.length > 0 && (
                                  <button
                                    onClick={() => openAddSubTask(task.id, task.status)}
                                    className="flex items-center gap-1.5 pl-12 pr-4 py-1.5 w-full text-left text-[11px] text-gray-300 hover:text-gray-900 hover:bg-gray-50 transition-colors border-b border-gray-50"
                                  >
                                    <Plus size={10} /> 하위 태스크 추가
                                  </button>
                                )}
                              </div>
                            )
                          })}
                          {quickAddStatus === status ? (
                            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-50 bg-indigo-50/30">
                              <Plus size={11} className="text-indigo-400 shrink-0" />
                              <input
                                autoFocus
                                value={quickAddTitle}
                                onChange={e => setQuickAddTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitQuickAdd(status) }
                                  if (e.key === 'Escape') cancelQuickAdd()
                                }}
                                onBlur={() => { if (!quickAddTitle.trim()) cancelQuickAdd() }}
                                placeholder="제목 입력 후 Enter, Esc로 취소"
                                className="flex-1 text-xs outline-none placeholder:text-gray-300 bg-transparent text-gray-800"
                              />
                              <span className="text-[10px] text-gray-300 shrink-0">상세 설정은 행 클릭</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setQuickAddStatus(status); setQuickAddTitle('') }}
                              className="flex items-center gap-1.5 px-4 py-2 w-full text-left text-xs text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-colors border-b border-gray-50"
                            >
                              <Plus size={11} /> 태스크 추가
                            </button>
                          )}
                        </>
                      )}
                    </DroppableGroup>
                  )
                })}

                <DragOverlay>
                  {draggingTask && (
                    <div className="bg-white border border-indigo-200 rounded shadow-lg px-4 py-2 text-xs text-gray-700 font-medium opacity-95">
                      {draggingTask.title}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        )}
      </div>

      <TaskFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTask(null); setPendingDefaultProjects([]); setPendingParentId(null) }}
        onSave={handleSave}
        editTask={editTask}
        defaultStatus={defaultStatus}
        defaultProjects={pendingDefaultProjects}
        onSearchProjects={handleSearch}
        assigneeSuggestions={allAssignees.map(a => a.label).filter(Boolean)}
      />

      <TaskDetailDrawer
        open={drawerOpen}
        task={drawerTask}
        subTasks={drawerTask ? tasks.filter(t => t.parent_id === drawerTask.id) : []}
        onClose={() => setDrawerOpen(false)}
        onSave={handleDrawerSave}
        onDelete={handleDelete}
        onAddSubTask={openAddSubTask}
        onStatusChange={handleStatusChange}
        onSearchProjects={handleSearch}
        assigneeSuggestions={allAssignees.map(a => a.label).filter(Boolean)}
      />

      <TaskTrashPanel
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        workspaceId={workspace?.id ?? ''}
        onRestore={async () => { await load(); setTrashCount(prev => Math.max(0, prev - 1)) }}
      />
    </div>
  )
}
