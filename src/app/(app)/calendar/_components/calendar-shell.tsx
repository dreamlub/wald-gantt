'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle,
  CalendarDays, SlidersHorizontal, Plus, PanelLeftOpen, X,
} from 'lucide-react'
import { format, addDays, parseISO, startOfWeek, getISOWeek } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import type { CalendarEvent, GanttTask, TaskStatus } from '@/types'
import {
  getOrCreateWorkspace, getTasks, updateTaskSchedule, updateTask,
  softDeleteTask, duplicateTask, addTask, searchProjects,
} from '@/lib/gantt-service'
import { TaskDetailDrawer } from '@/app/(app)/tasks/_components/TaskDetailDrawer'
import { TimeGrid } from './time-grid'
import { TaskPanel } from './task-panel'

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

function calcDayHours(date: string, events: CalendarEvent[]): number {
  return events
    .filter(e => !e.isAllDay && toDateStr(new Date(e.start)) === date)
    .reduce((sum, e) => {
      const ms = new Date(e.end).getTime() - new Date(e.start).getTime()
      return sum + ms / 3_600_000
    }, 0)
}

function calcTaskHours(date: string, tasks: GanttTask[]): number {
  return tasks
    .filter(t => !!t.scheduled_at && toDateStr(new Date(t.scheduled_at)) === date)
    .reduce((sum, t) => sum + (t.duration_minutes ?? 60) / 60, 0)
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

const STATUS_COLOR: Record<string, string> = {
  'backlog':     'var(--task-status-backlog)',
  'to-do':       'var(--task-status-todo)',
  'in-progress': 'var(--task-status-in-progress)',
  'done':        'var(--task-status-done)',
  'pending':     'var(--task-status-pending)',
}

export function CalendarShell() {
  const today = toDateStr(new Date())
  const [weekStart, setWeekStart] = useState(() => getSundayOf(today))
  const weekDates = getWeekDates(weekStart)
  const weekEnd   = weekDates[6]

  const [panelOpen, setPanelOpen]       = useState(true)
  const [drawerTask, setDrawerTask]     = useState<GanttTask | null>(null)
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
      await updateTaskSchedule(taskId, scheduledAt, task?.duration_minutes ?? 60)
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

  const handleDrawerAddSubTask = useCallback(async (parentId: string, status: TaskStatus) => {
    if (!workspaceId) return
    await addTask(workspaceId, { title: '새 하위 태스크', status, type: 'mine', assignee: null, start_date: null, due_date: null, memo: null, parent_id: parentId })
    await loadTasks()
  }, [workspaceId, loadTasks])

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

  const handleConnectGoogle = () => { window.location.href = '/api/calendar/auth' }

  /* 주 범위 레이블: "5월 11일 - 17일 2026 · W20" */
  const weekStartObj = parseISO(weekStart)
  const weekEndObj   = parseISO(weekEnd)
  const isSameMonth  = weekStartObj.getMonth() === weekEndObj.getMonth()
  const weekLabel    = isSameMonth
    ? `${format(weekStartObj, 'M월 d일', { locale: ko })} - ${format(weekEndObj, 'd일', { locale: ko })} ${format(weekEndObj, 'yyyy')} · W${getISOWeek(weekStartObj)}`
    : `${format(weekStartObj, 'M월 d일', { locale: ko })} - ${format(weekEndObj, 'M월 d일', { locale: ko })} ${format(weekEndObj, 'yyyy')} · W${getISOWeek(weekStartObj)}`

  const allDayEvents = events.filter(e => e.isAllDay)
  const allDayTasks  = tasks.filter(t => !!t.scheduled_at && isAllDayScheduled(t.scheduled_at))
  const timedTasks   = tasks.filter(t => !t.scheduled_at || !isAllDayScheduled(t.scheduled_at))

  return (
    <>
    <div className="flex h-full w-full overflow-hidden">

      {/* 사이드바 */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: panelOpen ? 256 : 0 }}
      >
        <TaskPanel
          tasks={tasks}
          onClose={() => setPanelOpen(false)}
          onTaskClick={setDrawerTask}
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
          <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Calendar</span>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => goWeek(-1)}
              className="p-1.5 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
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

          <span className="text-xs font-medium text-foreground">{weekLabel}</span>

          <div className="flex-1" />

          {loadingEvents && <RefreshCw size={13} className="animate-spin text-ink-400" />}

          <button
            onClick={() => loadEvents(weekStart, weekEnd)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-muted-foreground hover:bg-muted transition-colors"
          >
            <CalendarDays size={11} className="text-[#4285f4]" />
            Google Calendar
          </button>

          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border text-[11px] text-muted-foreground hover:bg-muted transition-colors">
            <SlidersHorizontal size={11} />
            필터
          </button>

          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-foreground text-background text-[11px] font-medium hover:opacity-80 transition-opacity">
            <Plus size={11} />
            이벤트 추가
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
              return (
                <div key={date} className="flex-1 border-l border-border h-12 flex items-center justify-center gap-1 px-2">
                  <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-foreground text-background' : 'text-foreground'
                  }`}>
                    {d.getDate()}
                  </span>
                  <span className={`text-[10px] ${isToday ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                    ({DAY_LABELS[d.getDay()]})
                  </span>
                </div>
              )
            })}
          </div>

          {/* 업무 / 구글 시간 통계 (sticky) */}
          <div className="sticky top-12 z-20 flex border-b bg-card">
            <div className="w-12 shrink-0" />
            {weekDates.map(date => {
              const googleHrs = calcDayHours(date, events)
              const taskHrs   = calcTaskHours(date, timedTasks)
              return (
                <div key={date} className="flex-1 border-l border-border h-7 flex items-center justify-center gap-3 px-1">
                  <span className="text-[10px] text-ink-400">
                    업무 <span className={taskHrs > 0 ? 'font-medium text-foreground' : ''}>{fmtHrs(taskHrs)}</span>
                  </span>
                  <span className="text-[10px] text-ink-400">
                    구글 <span className={googleHrs > 0 ? 'font-medium text-[#4285f4]' : ''}>{fmtHrs(googleHrs)}</span>
                  </span>
                </div>
              )
            })}
          </div>

          {/* ALL-DAY 행 (sticky, 항상 표시, 드래그 드롭 가능) */}
          <div className="sticky top-[76px] z-20 flex border-b bg-card">
            <div className="w-12 shrink-0 flex items-start justify-end pt-1.5 pr-2">
              <span className="text-[10px] text-ink-400 whitespace-nowrap">ALL-DAY</span>
            </div>
            {weekDates.map(date => {
              const dayAllEvt  = allDayEvents.filter(e => e.start.slice(0, 10) === date)
              const dayAllTask = allDayTasks.filter(t => toDateStr(new Date(t.scheduled_at!)) === date)
              return (
                <div
                  key={date}
                  className={`flex-1 border-l border-border min-h-8 px-1 py-0.5 flex flex-col gap-0.5 transition-colors ${
                    dragOverAllDay === date ? 'bg-lilac-100/30' : ''
                  }`}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverAllDay(date) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverAllDay(null) }}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOverAllDay(null)
                    const taskId = e.dataTransfer.getData('taskId')
                    if (taskId) handleDropAllDay(taskId, date)
                  }}
                >
                  {dayAllEvt.map(ev => (
                    <div
                      key={ev.id}
                      className="text-[10px] px-1.5 py-0.5 rounded truncate"
                      style={{
                        backgroundColor: ev.color ? `${ev.color}33` : 'var(--color-ink-100)',
                        borderLeft: `2px solid ${ev.color ?? 'var(--color-ink-400)'}`,
                      }}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayAllTask.map(task => (
                    <div
                      key={task.id}
                      className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 group"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[task.status]} 15%, transparent)`,
                        borderLeft: `2px solid ${STATUS_COLOR[task.status]}`,
                      }}
                    >
                      <span className="flex-1 truncate text-foreground">{task.title}</span>
                      <button
                        onClick={() => handleUnschedule(task.id)}
                        className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-foreground transition-opacity shrink-0"
                      >
                        <X size={8} />
                      </button>
                    </div>
                  ))}
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
    />
    </>
  )
}
