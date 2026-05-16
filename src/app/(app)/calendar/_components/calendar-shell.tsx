'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, AlertCircle, CalendarDays, ListTodo, X } from 'lucide-react'
import { format, addDays, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import type { CalendarEvent, GanttTask } from '@/types'
import { getOrCreateWorkspace, getTasks, updateTaskSchedule } from '@/lib/gantt-service'
import { TimeGrid } from './time-grid'
import { TaskPanel } from './task-panel'

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function CalendarShell() {
  const [date, setDate]         = useState(() => toDateStr(new Date()))
  const [tasks, setTasks]       = useState<GanttTask[]>([])
  const [events, setEvents]     = useState<CalendarEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [calendarError, setCalendarError] = useState<'NO_TOKEN' | 'TOKEN_EXPIRED' | 'GOOGLE_API_DISABLED' | 'GOOGLE_API_ERROR' | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [taskPanelOpen, setTaskPanelOpen] = useState(false)

  useEffect(() => {
    getOrCreateWorkspace().then(ws => setWorkspaceId(ws.id)).catch(() => {})
  }, [])

  const loadTasks = useCallback(async () => {
    if (!workspaceId) return
    const data = await getTasks(workspaceId)
    setTasks(data.filter(t => !t.deleted_at))
  }, [workspaceId])

  useEffect(() => { loadTasks() }, [loadTasks])

  const loadEvents = useCallback(async (d: string) => {
    setLoadingEvents(true)
    setCalendarError(null)
    try {
      const res  = await fetch(`/api/calendar/events?date=${d}`)
      const json = await res.json()
      if (!res.ok) {
        if (json.error === 'NO_TOKEN' || json.error === 'TOKEN_EXPIRED' || json.error === 'GOOGLE_API_DISABLED') {
          setCalendarError(json.error)
        } else {
          console.error('[calendar]', json)
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

  useEffect(() => { loadEvents(date) }, [date, loadEvents])

  const handleConnectGoogle = () => { window.location.href = '/api/calendar/auth' }

  const goDay    = (delta: number) => setDate(d => toDateStr(addDays(parseISO(d), delta)))
  const goToday  = () => setDate(toDateStr(new Date()))

  const handleDrop = useCallback(async (taskId: string, scheduledAt: string, durationMinutes: number) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: scheduledAt, duration_minutes: durationMinutes } : t))
    try {
      await updateTaskSchedule(taskId, scheduledAt, durationMinutes)
    } catch {
      toast.error('저장 실패'); await loadTasks()
    }
  }, [loadTasks])

  const handleMove = useCallback(async (taskId: string, scheduledAt: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: scheduledAt } : t))
    try {
      const task = tasks.find(t => t.id === taskId)
      await updateTaskSchedule(taskId, scheduledAt, task?.duration_minutes ?? 60)
    } catch {
      toast.error('저장 실패'); await loadTasks()
    }
  }, [tasks, loadTasks])

  const handleResize = useCallback(async (taskId: string, durationMinutes: number) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, duration_minutes: durationMinutes } : t))
    try {
      const task = tasks.find(t => t.id === taskId)
      await updateTaskSchedule(taskId, task?.scheduled_at ?? null, durationMinutes)
    } catch {
      toast.error('저장 실패'); await loadTasks()
    }
  }, [tasks, loadTasks])

  const handleUnschedule = useCallback(async (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: null, duration_minutes: null } : t))
    try {
      await updateTaskSchedule(taskId, null, null)
    } catch {
      toast.error('저장 실패'); await loadTasks()
    }
  }, [loadTasks])

  const dateObj  = parseISO(date)
  const dayLabel = DAY_LABELS[dateObj.getDay()]
  const isToday  = date === toDateStr(new Date())
  const scheduledForDate = tasks.filter(t => t.scheduled_at?.startsWith(date))
  const unscheduledCount = tasks.filter(t => !t.scheduled_at && t.status !== 'done').length

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* 툴바 */}
      <div className="shrink-0 flex items-center gap-2 px-4 h-11 border-b border-border bg-background">
        <div className="flex items-center gap-0.5">
          <button onClick={() => goDay(-1)} className="p-1.5 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => goDay(1)} className="p-1.5 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors">
            <ChevronRight size={15} />
          </button>
        </div>

        <h2 className="text-xs font-medium text-foreground">
          {format(dateObj, 'yyyy년 M월 d일', { locale: ko })}
          <span className="ml-1.5 text-muted-foreground">({dayLabel})</span>
        </h2>

        {!isToday && (
          <button onClick={goToday} className="text-[11px] text-lilac-500 hover:text-lilac-600 font-medium transition-colors">
            오늘
          </button>
        )}

        <div className="flex-1" />

        {loadingEvents && <RefreshCw size={13} className="animate-spin text-ink-400" />}

        <span className="text-[10px] text-ink-400">
          {events.filter(e => !e.isAllDay).length}개 일정
          {scheduledForDate.length > 0 && ` · ${scheduledForDate.length}개 블록`}
        </span>

        {/* Tasks 드로어 토글 */}
        <button
          onClick={() => setTaskPanelOpen(o => !o)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-colors ${
            taskPanelOpen
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <ListTodo size={12} />
          Tasks
          {unscheduledCount > 0 && (
            <span className={`text-[9px] px-1 rounded-full font-medium ${taskPanelOpen ? 'bg-white/20' : 'bg-ink-200 text-ink-600'}`}>
              {unscheduledCount}
            </span>
          )}
        </button>
      </div>

      {/* 종일 이벤트 */}
      {events.filter(e => e.isAllDay).length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/20">
          <span className="text-[10px] text-ink-400 w-12 text-right shrink-0">종일</span>
          <div className="flex flex-wrap gap-1">
            {events.filter(e => e.isAllDay).map(e => (
              <span
                key={e.id}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: e.color ? `${e.color}33` : 'var(--color-ink-100)',
                  color: 'var(--color-foreground)',
                }}
              >
                {e.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 캘린더 연동 오류 */}
      {calendarError && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-status-warn/10 border-b border-status-warn/20">
          <AlertCircle size={13} className="text-status-warn shrink-0" />
          <p className="text-[11px] text-foreground">
            {calendarError === 'NO_TOKEN'      ? 'Google 캘린더 연동이 필요합니다.' :
             calendarError === 'TOKEN_EXPIRED'  ? 'Google 캘린더 토큰이 만료되었습니다.' :
             calendarError === 'GOOGLE_API_DISABLED' ? 'Google Cloud에서 Calendar API를 활성화해 주세요.' :
             'Google 캘린더 일정을 불러오지 못했습니다.'}
          </p>
          {(calendarError === 'NO_TOKEN' || calendarError === 'TOKEN_EXPIRED') && (
            <button
              onClick={handleConnectGoogle}
              className="ml-auto shrink-0 flex items-center gap-1 text-[11px] bg-foreground text-background px-2 py-1 rounded hover:bg-ink-800 transition-colors"
            >
              <CalendarDays size={11} />
              연동
            </button>
          )}
        </div>
      )}

      {/* 바디 — 타임 그리드 + Tasks 드로어 */}
      <div className="relative flex-1 overflow-hidden">

        {/* 타임 그리드 (전체 너비) */}
        <div className="h-full overflow-y-auto">
          <TimeGrid
            date={date}
            events={events}
            tasks={scheduledForDate}
            onDrop={handleDrop}
            onMove={handleMove}
            onResize={handleResize}
            onUnschedule={handleUnschedule}
            onTaskClick={() => {}}
          />
        </div>

        {/* Tasks 드로어 — 오른쪽 오버레이 */}
        {taskPanelOpen && (
          <>
            {/* 백드롭 (모바일 대비) */}
            <div
              className="absolute inset-0 z-10"
              onClick={() => setTaskPanelOpen(false)}
            />
            <div className="absolute top-0 right-0 bottom-0 z-20 w-56 flex flex-col bg-background border-l border-border shadow-lg">
              <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Tasks</span>
                <button onClick={() => setTaskPanelOpen(false)} className="p-0.5 rounded hover:bg-muted text-ink-400">
                  <X size={13} />
                </button>
              </div>
              <TaskPanel tasks={tasks} hideHeader />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
