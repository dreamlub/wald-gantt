'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle,
  CalendarDays, SlidersHorizontal, Plus, PanelLeftOpen,
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
    .filter(e => !e.isAllDay && new Date(e.start).toISOString().slice(0, 10) === date)
    .reduce((sum, e) => {
      const ms = new Date(e.end).getTime() - new Date(e.start).getTime()
      return sum + ms / 3_600_000
    }, 0)
}

export function CalendarShell() {
  const today = toDateStr(new Date())
  const [weekStart, setWeekStart] = useState(() => getSundayOf(today))
  const weekDates = getWeekDates(weekStart)
  const weekEnd   = weekDates[6]

  const [panelOpen, setPanelOpen]     = useState(true)
  const [drawerTask, setDrawerTask]   = useState<GanttTask | null>(null)
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
          onStatusChange={handleStatusChange}
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

        {/* 주간 컬럼 헤더 (고정) */}
        <div className="shrink-0 flex border-b bg-card">
          <div className="w-12 shrink-0" />
          {weekDates.map(date => {
            const d        = parseISO(date)
            const dayLabel = DAY_LABELS[d.getDay()]
            const isToday  = date === today
            const hrs      = calcDayHours(date, events)
            return (
              <div key={date} className="flex-1 border-l border-border px-2 py-1.5 flex flex-col items-center gap-0.5">
                {hrs > 0 ? (
                  <span className="text-[9px] text-ink-400">
                    {Number.isInteger(hrs) ? `${hrs}h` : `${hrs.toFixed(1)}h`}
                  </span>
                ) : (
                  <span className="text-[9px] text-transparent select-none">—</span>
                )}
                <span className="text-[10px] text-muted-foreground">{dayLabel}</span>
                <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-foreground text-background' : 'text-foreground'
                }`}>
                  {d.getDate()}
                </span>
              </div>
            )
          })}
        </div>

        {/* ALL-DAY 행 */}
        {allDayEvents.length > 0 && (
          <div className="shrink-0 flex border-b bg-card">
            <div className="w-12 shrink-0 flex items-start justify-end pt-1.5 pr-2">
              <span className="text-[9px] text-ink-400 whitespace-nowrap">ALL-DAY</span>
            </div>
            {weekDates.map(date => {
              const dayAll = allDayEvents.filter(e => e.start.slice(0, 10) === date)
              return (
                <div key={date} className="flex-1 border-l border-border min-h-7 px-1 py-0.5 flex flex-col gap-0.5">
                  {dayAll.map(e => (
                    <div
                      key={e.id}
                      className="text-[10px] px-1.5 py-0.5 rounded truncate"
                      style={{
                        backgroundColor: e.color ? `${e.color}33` : 'var(--color-ink-100)',
                        borderLeft: `2px solid ${e.color ?? 'var(--color-ink-400)'}`,
                      }}
                    >
                      {e.title}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* 타임 그리드 (스크롤) */}
        <div className="flex-1 overflow-y-auto">
          <TimeGrid
            dates={weekDates}
            events={events}
            tasks={tasks}
            onDrop={handleDrop}
            onMove={handleMove}
            onResize={handleResize}
            onUnschedule={handleUnschedule}
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
