'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Plus, ChevronDown, ChevronRight, LayoutList, Search,
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
import type { GanttTask, TaskStatus, TaskType, Workspace } from '@/types'
import { todayStrKST } from '@/lib/gantt-utils'

import { STATUS_GROUPS, PROJECT_COLORS, ASSIGNEE_COLORS, VIEW_TABS, type ViewType } from './_constants'
import { isOverdue, isDueThisWeek, overdueDays, daysDiff, toKSTDateStr, weekStart } from './_utils'
import { MiniCalendar } from './_components/MiniCalendar'
import { SummaryCard } from './_components/SummaryCard'
import { TaskRow, DraggableTaskRow, DroppableGroup } from './_components/TaskRow'
import { ListView } from './_components/ListView'
import { CalendarView } from './_components/CalendarView'
import { GanttView } from './_components/GanttView'
import { KanbanView } from './_components/KanbanView'
import { TaskDetailDrawer } from './_components/TaskDetailDrawer'

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
  const [quickFilter,    setQuickFilter]    = useState<'all' | 'overdue' | 'due-this-week' | 'due-today'>('all')
  const [defaultStatus,  setDefaultStatus]  = useState<TaskStatus>('to-do')
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const [view,           setView]           = useState<ViewType>('normal')
  const [selectedDate,   setSelectedDate]   = useState<string | null>(null)
  const [trashOpen,      setTrashOpen]      = useState(false)
  const [trashCount,     setTrashCount]     = useState(0)
  const [draggingTask,   setDraggingTask]   = useState<GanttTask | null>(null)
  const [pendingParentId, setPendingParentId] = useState<string | null>(null)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [drawerTask,      setDrawerTask]      = useState<GanttTask | null>(null)
  const [drawerOpen,      setDrawerOpen]      = useState(false)
  const [pendingDefaultProjects, setPendingDefaultProjects] = useState<{ id: string; name: string; board_name: string }[]>([])

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

  async function handleSave(
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null },
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
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels: string[] },
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

  function openAddSubTask(parentId: string, status: TaskStatus) {
    const parent = tasks.find(t => t.id === parentId)
    setDefaultStatus(status)
    setEditTask(null)
    setPendingParentId(parentId)
    setPendingDefaultProjects(parent?.projects ?? [])
    setExpandedParents(prev => new Set([...prev, parentId]))
    setFormOpen(true)
  }

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
  const dueThisWeekCount   = tasks.filter(t => isDueThisWeek(t.due_date) && t.status !== 'done').length
  const completedThisWeek  = tasks.filter(t => t.status === 'done' && new Date(t.updated_at) >= weekStart()).length
  const inProgressCount    = tasks.filter(t => t.status === 'in-progress').length
  const dueTodayCount      = tasks.filter(t => t.due_date === todayStr && t.status !== 'done').length
  const dueTodayOverdue    = tasks.filter(t => t.due_date === todayStr && isOverdue(t.due_date, t.status)).length
  const todoCount          = tasks.filter(t => t.status === 'to-do').length
  const backlogCount       = tasks.filter(t => t.status === 'backlog').length
  const activeCount        = todoCount + inProgressCount

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
  const allAssignees = [...assigneeMap.entries()].map(([key, v]) => ({ key, ...v }))
  const sidebarAssignees = allAssignees
    .filter(a => !assigneeSearch || a.label.toLowerCase().includes(assigneeSearch.toLowerCase()))

  const assigneeColorMap = new Map<string, string>()
  allAssignees.forEach(({ key }, i) => {
    assigneeColorMap.set(key, ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length])
  })

  function getAssigneeKey(t: GanttTask) {
    return t.type === 'mine' ? '__mine__' : (t.assignee ?? '')
  }

  const taskCreatedDateSet = new Set(tasks.map(t => toKSTDateStr(t.created_at)))

  // ── 필터링 ───────────────────────────────────────────────────
  let filtered = tasks
  if (selectedDate)    filtered = filtered.filter(t => toKSTDateStr(t.created_at) === selectedDate)
  if (filterProject)   filtered = filtered.filter(t => t.projects?.some(p => p.id === filterProject))
  if (filterAssignee) {
    if (filterAssignee === '__mine__') filtered = filtered.filter(t => t.type === 'mine')
    else filtered = filtered.filter(t => t.assignee === filterAssignee)
  }
  if (quickFilter === 'overdue')       filtered = filtered.filter(t => isOverdue(t.due_date, t.status))
  if (quickFilter === 'due-this-week') filtered = filtered.filter(t => isDueThisWeek(t.due_date) && t.status !== 'done')
  if (quickFilter === 'due-today')     filtered = filtered.filter(t => t.due_date === todayStr && t.status !== 'done')

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
    { key: 'all',           label: '전체',         count: tasks.length,      icon: <LayoutList size={12} className="shrink-0" /> },
    { key: 'overdue',       label: '지연',          count: overdueCount,     icon: <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" /> },
    { key: 'due-this-week', label: '이번 주 마감',  count: dueThisWeekCount, icon: <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /> },
    { key: 'due-today',     label: '오늘 마감',     count: dueTodayCount,    icon: <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" /> },
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
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: assigneeColorMap.get(a.key) ?? '#9ca3af' }}
                />
                <span className="flex-1 truncate text-left">{a.label}</span>
                <span className="text-xs text-gray-400">{a.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 캘린더 */}
        <div className="shrink-0 border-t">
          <MiniCalendar
            taskDates={taskCreatedDateSet}
            onDateSelect={setSelectedDate}
            selectedDate={selectedDate}
          />
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

        {/* KPI 카드 */}
        <div className="grid grid-cols-4 gap-3 p-4 border-b bg-gray-50 shrink-0">
          <SummaryCard title="지연 태스크" value={overdueCount} sub={overdueCount > 0 ? `평균 ${avgOverdueDays}일 지연` : '없음'} borderColor="#ef4444" />
          <SummaryCard title="미완료" value={activeCount} sub={backlogCount > 0 ? `백로그 ${backlogCount}건 대기 중` : '백로그 없음'} borderColor="#6366f1" />
          <SummaryCard title="오늘 마감" value={dueTodayCount} sub={dueTodayOverdue > 0 ? `${dueTodayOverdue}건 지연 포함` : dueTodayCount > 0 ? '오늘 처리 필요' : '없음'} borderColor="#f59e0b" />
          <SummaryCard title="이번 주 완료" value={completedThisWeek} sub={`진행 중 ${inProgressCount}건`} borderColor="#22c55e" />
        </div>

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

          <div className="ml-auto">
            <button
              onClick={() => openAdd('to-do')}
              className="flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded transition-colors"
            >
              <Plus size={13} /> 태스크 추가
            </button>
          </div>
        </div>

        {/* 담당자 필터 바 (일반/목록 뷰) */}
        {(view === 'normal' || view === 'list' || view === 'kanban') && allAssignees.length > 0 && (
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
        {view === 'list' ? (
          <ListView
            tasks={filtered}
            assigneeColorMap={assigneeColorMap}
            getAssigneeKey={getAssigneeKey}
            onEdit={editHandler}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
        ) : view === 'calendar' ? (
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
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onAddTask={openAdd}
          />
        ) : view === 'gantt' ? (
          <GanttView tasks={filtered} onEdit={editHandler} />
        ) : (
          /* 일반 뷰 */
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center px-4 py-2 border-b bg-gray-50 shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 z-10">
              <div className="w-5 shrink-0 mr-3" />
              <div className="flex-1 mr-4">태스크</div>
              <div className="w-16 shrink-0">메모</div>
              <div className="w-28 shrink-0">담당자</div>
              <div className="w-20 shrink-0">최근 업데이트</div>
              <div className="w-14 shrink-0">시작일</div>
              <div className="w-14 shrink-0">마감일</div>
              <div className="w-14 shrink-0">지시일</div>
              <div className="w-12 shrink-0" />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                <p className="text-xs">태스크가 없어요</p>
                <button onClick={() => openAdd('to-do')} className="text-xs text-indigo-500 hover:text-indigo-700">+ 첫 번째 태스크 추가</button>
              </div>
            ) : (
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
                      const isExp = expandedParents.has(task.id)
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
                            const isExp = expandedParents.has(task.id)
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
                                {isExp && (
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
                          <button
                            onClick={() => openAdd(status)}
                            className="flex items-center gap-1.5 px-4 py-2 w-full text-left text-xs text-gray-400 hover:text-indigo-500 hover:bg-gray-50 transition-colors border-b border-gray-50"
                          >
                            <Plus size={11} /> 태스크 추가
                          </button>
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
        onClose={() => { setFormOpen(false); setEditTask(null); setPendingDefaultProjects([]) }}
        onSave={handleSave}
        editTask={editTask}
        defaultStatus={defaultStatus}
        defaultProjects={pendingDefaultProjects}
        onSearchProjects={handleSearch}
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
