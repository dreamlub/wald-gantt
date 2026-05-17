'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle,
  CalendarDays, Plus, PanelLeftOpen, X, Check,
} from 'lucide-react'
import { addDays, parseISO, startOfWeek, getISOWeek } from 'date-fns'
import { toast } from 'sonner'
import type { CalendarEvent, GanttTask, TaskStatus } from '@/types'
import {
  getOrCreateWorkspace, getTasks, updateTaskSchedule, updateTask,
  softDeleteTask, duplicateTask, addTask, searchProjects,
} from '@/lib/gantt-service'
import { STATUS_COLOR, STATUS_BG_COLOR } from '@/app/(app)/tasks/_constants'
import { TaskDetailDrawer } from '@/app/(app)/tasks/_components/TaskDetailDrawer'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { TimeGrid } from './time-grid'
import { TaskPanel } from './task-panel'
import { GoogleIcon } from './event-block'
import { setActiveDragOffsetY, DRAG_OVER_BG } from './drag-state'

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function toDateStr(d: Date): string {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function getSundayOf(dateStr: string): string {
  return toDateStr(startOfWeek(parseISO(dateStr), { weekStartsOn: 0 }))
}

function getWeekDates(mondayStr: string): string[] {
  const monday = parseISO(mondayStr)
  return Array.from({ length: 7 }, (_, i) => toDateStr(addDays(monday, i)))
}

// 업무시간 슬롯: 9~12, 13~18 (점심 제외 8h)
const WORK_SLOTS = [{ start: 9, end: 12 }, { start: 13, end: 18 }]

function calcDayHours(date: string, events: CalendarEvent[]): number {
  const dayEvents = events.filter(e => !e.isAllDay && toDateStr(new Date(e.start)) === date)
  let total = 0
  for (const ev of dayEvents) {
    const evStart = new Date(ev.start).getHours() + new Date(ev.start).getMinutes() / 60
    const evEnd   = new Date(ev.end).getHours()   + new Date(ev.end).getMinutes()   / 60
    for (const slot of WORK_SLOTS) {
      const overlap = Math.min(evEnd, slot.end) - Math.max(evStart, slot.start)
      if (overlap > 0) total += overlap
    }
  }
  return total
}

function calcTaskHours(date: string, tasks: GanttTask[]): number {
  return tasks
    .filter(t => !!t.scheduled_at && toDateStr(new Date(t.scheduled_at)) === date)
    .reduce((sum, t) => sum + (t.duration_minutes ?? 30) / 60, 0)
}

function fmtHrs(h: number): string {
  if (h === 0) return '0h'
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`
}

function buildAllDayIso(date: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, 0, 0).toISOString()
}

function isAllDayScheduled(iso: string): boolean {
  const d = new Date(iso)
  return d.getHours() === 0 && d.getMinutes() === 0
}

export function CalendarShell() {
  const today = toDateStr(new Date())
  const [weekStart, setWeekStart] = useState(() => getSundayOf(today))
  const weekDates = getWeekDates(weekStart)
  const weekEnd   = weekDates[6]

  const [panelOpen, setPanelOpen]       = useState(true)
  const [drawerTask, setDrawerTask] = useState<GanttTask | null>(null)
  const [dragOverAllDay, setDragOverAllDay] = useState<string | null>(null)
  const [tasks, setTasks]             = useState<GanttTask[]>([])
  const [events, setEvents]           = useState<CalendarEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [calendarError, setCalendarError] = useState<
    'NO_TOKEN' | 'TOKEN_EXPIRED' | 'GOOGLE_API_DISABLED' | 'GOOGLE_API_ERROR' | null
  >(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  useEffect(() => {
    getOrCreateWorkspace().then(ws => setWorkspaceId(ws.id)).catch(() => {})
  }, [])

  const loadTasks = useCallback(async () => {
    if (!workspaceId) return
    const data = await getTasks(workspaceId)
    setTasks(data.filter(t => !t.deleted_at))
  }, [workspaceId])

  useEffect(() => { loadTasks() }, [loadTasks])

  const loadEvents = useCallback(async (start: string, end: string) => {
    setLoadingEvents(true)
    setCalendarError(null)
    try {
      const res  = await fetch(`/api/calendar/events?date=${start}&endDate=${end}`)
      const json = await res.json()
      if (!res.ok) {
        const err = json.error
        if (err === 'NO_TOKEN' || err === 'TOKEN_EXPIRED' || err === 'GOOGLE_API_DISABLED') {
          setCalendarError(err)
        } else {
          setCalendarError('GOOGLE_API_ERROR')
        }
        setEvents([])
        return
      }
      setEvents(json.events ?? [])
    } catch {
      toast.error('캘린더 로드 실패')
    } finally {
      setLoadingEvents(false)
    }
  }, [])

  useEffect(() => { loadEvents(weekStart, weekEnd) }, [weekStart, weekEnd, loadEvents])

  const goWeek  = (delta: number) => setWeekStart(s => toDateStr(addDays(parseISO(s), delta * 7)))
  const goToday = () => setWeekStart(getSundayOf(today))
  const isCurrentWeek = weekStart === getSundayOf(today)

  const handleDrop = useCallback(async (taskId: string, scheduledAt: string, durationMinutes: number) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: scheduledAt, duration_minutes: durationMinutes } : t))
    try {
      await updateTaskSchedule(taskId, scheduledAt, durationMinutes)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [loadTasks])

  const handleMove = useCallback(async (taskId: string, scheduledAt: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: scheduledAt } : t))
    try {
      const task = tasks.find(t => t.id === taskId)
      await updateTaskSchedule(taskId, scheduledAt, task?.duration_minutes ?? 30)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [tasks, loadTasks])

  const handleResize = useCallback(async (taskId: string, durationMinutes: number) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, duration_minutes: durationMinutes } : t))
    try {
      const task = tasks.find(t => t.id === taskId)
      await updateTaskSchedule(taskId, task?.scheduled_at ?? null, durationMinutes)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [tasks, loadTasks])

  const handleStatusChange = useCallback(async (taskId: string, status: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: status as GanttTask['status'] } : t))
    try {
      await updateTask(taskId, { status: status as GanttTask['status'] })
    } catch { toast.error('상태 변경 실패'); await loadTasks() }
  }, [loadTasks])

  const handleUnschedule = useCallback(async (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: null, duration_minutes: null } : t))
    try {
      await updateTaskSchedule(taskId, null, null)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [loadTasks])

  const handleDropAllDay = useCallback(async (taskId: string, date: string) => {
    const scheduledAt = buildAllDayIso(date)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: scheduledAt, duration_minutes: 0 } : t))
    try {
      await updateTaskSchedule(taskId, scheduledAt, 0)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [loadTasks])

  /* ── TaskDetailDrawer 핸들러 ── */
  const handleDrawerSave = useCallback(async (
    task: GanttTask,
    fields: { title: string; status: TaskStatus; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels: string[]; priority: import('@/types').Priority },
    projectIds: string[]
  ) => {
    await updateTask(task.id, fields, projectIds)
    setDrawerTask({ ...task, ...fields })
    await loadTasks()
  }, [loadTasks])

  const handleDrawerDelete = useCallback(async (id: string) => {
    await softDeleteTask(id)
    setDrawerTask(null)
    await loadTasks()
  }, [loadTasks])

  const handleDrawerDuplicate = useCallback(async (task: GanttTask) => {
    if (!workspaceId) return
    await duplicateTask(workspaceId, task)
    await loadTasks()
  }, [workspaceId, loadTasks])

  const handleDrawerAddSubTask = useCallback(async (parentId: string, title: string, status: TaskStatus) => {
    if (!workspaceId) return
    const parent = tasks.find(t => t.id === parentId)
    await addTask(workspaceId, {
      title,
      status: parent?.status ?? status,
      type: parent?.type ?? 'mine',
      assignee: parent?.assignee ?? null,
      start_date: parent?.start_date ?? null,
      due_date: parent?.due_date ?? null,
      memo: null,
      priority: parent?.priority ?? 2,
      labels: parent?.labels ?? [],
      parent_id: parentId,
    })
    await loadTasks()
  }, [workspaceId, tasks, loadTasks])

  const handleDrawerStatusChange = useCallback(async (id: string, status: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    setDrawerTask(prev => prev?.id === id ? { ...prev, status } : prev)
    await updateTask(id, { status })
  }, [])

  const handleSearchProjects = useCallback(async (query: string) => {
    if (!workspaceId) return []
    const results = await searchProjects(workspaceId, query)
    return results.map(r => ({ id: r.id, name: r.name, board_name: r.board_name }))
  }, [workspaceId])

  const assigneeSuggestions = [...new Set(tasks.map(t => t.assignee).filter(Boolean) as string[])]
  const allLabels = [...new Set(tasks.flatMap(t => t.labels ?? []))].sort()

  const handleConnectGoogle = () => { window.location.href = '/api/calendar/auth' }

  const [formOpen, setFormOpen] = useState(false)

  const handleFormSave = useCallback(async (
    fields: Parameters<React.ComponentProps<typeof TaskFormDialog>['onSave']>[0],
    projectIds: string[]
  ) => {
    if (!workspaceId) return
    await addTask(workspaceId, { ...fields, parent_id: null }, projectIds)
    await loadTasks()
  }, [workspaceId, loadTasks])

  /* 주 범위 레이블: "5/17 ~ 5/23 (2026년 20W)" */
  const weekStartObj = parseISO(weekStart)
  const weekEndObj   = parseISO(weekEnd)
  const weekLabel    = `${weekStartObj.getMonth() + 1}/${weekStartObj.getDate()} ~ ${weekEndObj.getMonth() + 1}/${weekEndObj.getDate()} (${weekEndObj.getFullYear()}년 ${getISOWeek(weekStartObj)}W)`

  const allDayEvents = events.filter(e => e.isAllDay)
  const allDayTasks  = tasks.filter(t => !!t.scheduled_at && isAllDayScheduled(t.scheduled_at))
  const timedTasks   = tasks.filter(t => !t.scheduled_at || !isAllDayScheduled(t.scheduled_at))

  return (
    <>
    <div className="flex h-full w-full overflow-hidden">

      {/* 사이드바 */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: panelOpen ? 240 : 0 }}
      >
        <TaskPanel
          tasks={tasks}
          onClose={() => setPanelOpen(false)}
          onTaskClick={setDrawerTask}
          onUnschedule={handleUnschedule}
        />
      </div>

      {/* 메인 캘린더 */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* 툴바 */}
        <div className="h-12 flex items-center gap-2 px-4 border-b bg-card shrink-0">
          {!panelOpen && (
            <button
              onClick={() => setPanelOpen(true)}
              className="p-1.5 rounded text-ink-400 hover:text-muted-foreground hover:bg-muted transition-colors"
              title="사이드바 열기"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => goWeek(-1)}
              className="p-1.5 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs font-medium text-foreground min-w-[148px] text-center select-none">{weekLabel}</span>
            <button
              onClick={() => goWeek(1)}
              className="p-1.5 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {!isCurrentWeek && (
            <button
              onClick={goToday}
              className="text-[11px] text-lilac-500 hover:text-lilac-600 font-medium transition-colors"
            >
              오늘
            </button>
          )}

          <div className="flex-1" />

          {loadingEvents && <RefreshCw size={13} className="animate-spin text-ink-400" />}

          {calendarError === 'NO_TOKEN' || calendarError === 'TOKEN_EXPIRED' ? (
            <button
              onClick={handleConnectGoogle}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-status-warn/40 text-[11px] text-status-warn bg-status-warn/10 hover:bg-status-warn/15 transition-colors"
              title="Google 캘린더 연결 필요"
            >
              <CalendarDays size={11} />
              Google 연결
            </button>
          ) : (
            <button
              onClick={() => loadEvents(weekStart, weekEnd)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-muted-foreground hover:bg-muted transition-colors"
            >
              <CalendarDays size={11} style={{ color: 'var(--color-google-primary)' }} />
              Google Calendar
            </button>
          )}

          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1 text-xs font-medium text-background bg-foreground hover:bg-ink-800 px-3 py-1.5 rounded transition-colors"
          >
            <Plus size={11} />
            태스크 추가
          </button>
        </div>

        {/* 연동 오류 배너 */}
        {calendarError && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-status-warn/10 border-b border-status-warn/20">
            <AlertCircle size={13} className="text-status-warn shrink-0" />
            <p className="text-[11px] text-foreground">
              {calendarError === 'NO_TOKEN'           ? 'Google 캘린더 연동이 필요합니다.' :
               calendarError === 'TOKEN_EXPIRED'      ? 'Google 캘린더 토큰이 만료되었습니다.' :
               calendarError === 'GOOGLE_API_DISABLED'? 'Google Cloud에서 Calendar API를 활성화해 주세요.' :
               'Google 캘린더 일정을 불러오지 못했습니다.'}
            </p>
            {(calendarError === 'NO_TOKEN' || calendarError === 'TOKEN_EXPIRED') && (
              <button
                onClick={handleConnectGoogle}
                className="ml-auto shrink-0 flex items-center gap-1 text-[11px] bg-foreground text-background px-2 py-1 rounded hover:opacity-80 transition-opacity"
              >
                <CalendarDays size={11} />
                연동
              </button>
            )}
          </div>
        )}

        {/* 날짜 헤더 + 통계 + ALL-DAY + 타임그리드 (하나의 스크롤 컨테이너 — 컬럼 밀림 방지) */}
        <div className="flex-1 overflow-y-auto">

          {/* 날짜 헤더 (sticky) */}
          <div className="sticky top-0 z-20 flex border-b bg-card">
            <div className="w-12 shrink-0" />
            {weekDates.map(date => {
              const d       = parseISO(date)
              const isToday = date === today
              const isSun   = d.getDay() === 0
              const isSat   = d.getDay() === 6
              const dayColor      = !isToday && isSun ? 'var(--color-day-sun)' : !isToday && isSat ? 'var(--color-day-sat)' : undefined
              const dayColorMuted = !isToday && isSun ? 'var(--color-day-sun-muted)' : !isToday && isSat ? 'var(--color-day-sat-muted)' : undefined
              return (
                <div key={date} className="flex-1 border-l border-border h-8 flex items-center justify-center gap-1 px-2">
                  <span
                    className={`text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-foreground text-background' : ''}`}
                    style={dayColor ? { color: dayColor } : undefined}
                  >
                    {d.getDate()}
                  </span>
                  <span
                    className={`text-xs ${isToday ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                    style={dayColorMuted ? { color: dayColorMuted } : undefined}
                  >
                    ({DAY_LABELS[d.getDay()]})
                  </span>
                </div>
              )
            })}
          </div>

          {/* 업무가능 시간 통계 (sticky) */}
          <div className="sticky top-8 z-20 flex border-b bg-muted">
            <div className="w-12 shrink-0" />
            {weekDates.map(date => {
              const googleHrs    = calcDayHours(date, events)
              const hasAllDay    = allDayTasks.some(t => toDateStr(new Date(t.scheduled_at!)) === date)
              const availableHrs = hasAllDay ? 0 : Math.max(0, 8 - googleHrs)
              const isZero       = availableHrs === 0
              const isTight      = !isZero && availableHrs <= 2
              return (
                <div key={date} className="flex-1 border-l border-border h-7 flex items-center justify-center px-1">
                  <span className="text-xs text-ink-400">
                    업무가능{' '}
                    <span className={isZero ? 'font-semibold text-status-warn' : isTight ? 'font-semibold text-status-late' : availableHrs < 8 ? 'font-semibold text-foreground' : ''}>
                      {fmtHrs(availableHrs)}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          {/* ALL-DAY 행 (sticky, 항상 표시, 드래그 드롭 가능) */}
          <div className="sticky top-[60px] z-20 flex border-b bg-card">
            <div className="w-12 shrink-0 flex items-start justify-end pt-1.5 pr-2">
              <span className="text-[10px] text-ink-400 whitespace-nowrap">ALL-DAY</span>
            </div>
            {weekDates.map(date => {
              const dayAllEvt  = allDayEvents.filter(e => e.start.slice(0, 10) === date)
              const dayAllTask = allDayTasks.filter(t => toDateStr(new Date(t.scheduled_at!)) === date)
              return (
                <div
                  key={date}
                  className={`flex-1 min-w-0 border-l border-border min-h-[52px] px-1 py-1 flex flex-col gap-0.5 transition-colors ${
                    dragOverAllDay === date ? DRAG_OVER_BG : ''
                  }`}
                  onDragOver={e => {
                    if (e.dataTransfer.types.includes('from-all-day')) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverAllDay(date)
                  }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverAllDay(null) }}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOverAllDay(null)
                    if (e.dataTransfer.types.includes('from-all-day')) return
                    const taskId = e.dataTransfer.getData('taskId')
                    if (taskId) handleDropAllDay(taskId, date)
                  }}
                >
                  {dayAllEvt.map(ev => (
                    <div
                      key={ev.id}
                      className="w-full flex-1 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 min-w-0"
                      style={{
                        backgroundColor: 'var(--color-ink-100)',
                        borderLeft: '2px solid var(--color-ink-300)',
                      }}
                    >
                      <GoogleIcon size={8} />
                      <span className="truncate">{ev.title}</span>
                    </div>
                  ))}
                  {dayAllTask.map(task => {
                    const isDone = task.status === 'done'
                    const color  = STATUS_COLOR[task.status]
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => {
                          setActiveDragOffsetY(0)
                          e.dataTransfer.setData('taskId', task.id)
                          e.dataTransfer.setData('offsetY', '0')
                          e.dataTransfer.setData('source', 'panel')
                          e.dataTransfer.setData('from-all-day', '')
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        className="relative w-full text-[10px] px-1.5 py-1.5 rounded flex flex-col gap-0.5 group cursor-grab active:cursor-grabbing min-w-0"
                        style={{
                          backgroundColor: STATUS_BG_COLOR[task.status] ?? 'var(--color-ink-100)',
                          borderLeft: `2px solid ${color}`,
                        }}
                      >
                        {/* 1행: 체크 원 + 종일 + X */}
                        <div className="flex items-center gap-1 pr-4">
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); handleStatusChange(task.id, isDone ? 'to-do' : 'done') }}
                            className="shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors hover:opacity-80"
                            style={{ borderColor: color, backgroundColor: isDone ? color : 'transparent' }}
                          >
                            {isDone && <Check size={7} className="text-white stroke-[3]" />}
                          </button>
                          <span className="text-[10px] text-muted-foreground leading-tight">
                            종일{task.duration_minutes ? ` · ${task.duration_minutes}분` : ''}
                          </span>
                        </div>
                        {/* 2행: 태스크명 */}
                        <p className={`line-clamp-2 leading-tight ${isDone ? 'line-through opacity-60' : 'text-foreground'}`}>
                          {task.title}
                        </p>
                        <button
                          onClick={e => { e.stopPropagation(); handleUnschedule(task.id) }}
                          onMouseDown={e => e.stopPropagation()}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-ink-400 hover:text-foreground transition-opacity"
                        >
                          <X size={8} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* 타임 그리드 */}
          <TimeGrid
            dates={weekDates}
            events={events}
            tasks={timedTasks}
            onDrop={handleDrop}
            onMove={handleMove}
            onResize={handleResize}
            onUnschedule={handleUnschedule}
            onStatusChange={handleStatusChange}
            onTaskClick={setDrawerTask}
          />
        </div>

      </div>
    </div>

    <TaskFormDialog
      open={formOpen}
      onClose={() => setFormOpen(false)}
      onSave={handleFormSave}
      onSearchProjects={handleSearchProjects}
      assigneeSuggestions={assigneeSuggestions}
      labelSuggestions={allLabels}
    />

    <TaskDetailDrawer
      open={!!drawerTask}
      task={drawerTask}
      subTasks={tasks.filter(t => t.parent_id === drawerTask?.id && !t.deleted_at)}
      parentTask={tasks.find(t => t.id === drawerTask?.parent_id) ?? null}
      onClose={() => setDrawerTask(null)}
      onSave={handleDrawerSave}
      onDelete={handleDrawerDelete}
      onDuplicate={handleDrawerDuplicate}
      onAddSubTask={handleDrawerAddSubTask}
      onStatusChange={handleDrawerStatusChange}
      onSearchProjects={handleSearchProjects}
      assigneeSuggestions={assigneeSuggestions}
      labelSuggestions={allLabels}
    />
    </>
  )
}
