'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle,
  CalendarDays, Plus, PanelLeftOpen, X, Check,
} from 'lucide-react'
import { addDays, parseISO, getISOWeek } from 'date-fns'
import { Button } from '@/components/ui/button'
import { STATUS_COLOR, STATUS_BG_COLOR } from '@/app/(app)/tasks/_constants'
import { TaskDetailDrawer } from '@/app/(app)/tasks/_components/TaskDetailDrawer'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { DAY_LABELS, WORK_HOURS_PER_DAY, DRAG_OVER_BG, HOUR_H } from '../_constants'
import {
  toDateStr, getSundayOf, getWeekDates, calcDayHours, fmtHrs,
  isAllDayScheduled,
} from '../_utils'
import { useCalendarData } from '../_hooks/use-calendar-data'
import { TimeGrid } from './time-grid'
import { TaskPanel } from './task-panel'
import { GoogleIcon } from './event-block'
import { setActiveDragOffsetY } from './drag-state'

export function CalendarShell() {
  const today = toDateStr(new Date())
  const router = useRouter()
  const searchParams = useSearchParams()

  // ?date 파라미터가 있으면 해당 주로 바로 초기화 → 페이지 진입 시 주 이동 플래시 없음
  const [weekStart, setWeekStart] = useState(() => {
    const dateParam = searchParams.get('date')
    return getSundayOf(dateParam ?? today)
  })
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const weekEnd   = weekDates[6]

  const [panelOpen, setPanelOpen] = useState(true)
  const [dragOverAllDay, setDragOverAllDay] = useState<string | null>(null)
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const highlightHandled = useRef(false)

  const {
    tasks, events, loadingEvents, calendarError,
    loadEvents,
    handleDrop, handleMove, handleResize, handleUnschedule, handleDropAllDay, handleStatusChange,
    drawerTask, setDrawerTask,
    handleDrawerSave, handleDrawerDelete, handleDrawerDuplicate, handleDrawerAddSubTask, handleDrawerStatusChange,
    formOpen, setFormOpen, handleFormSave, handleSearchProjects,
    assigneeSuggestions, allLabels,
  } = useCalendarData()

  /* ── 주 네비게이션 ── */
  const goWeek  = (delta: number) => setWeekStart(s => toDateStr(addDays(parseISO(s), delta * 7)))
  const goToday = () => setWeekStart(getSundayOf(today))
  const isCurrentWeek = weekStart === getSundayOf(today)

  const handleConnectGoogle = () => { window.location.href = '/api/calendar/auth' }

  /* ── 주 범위 레이블 ── */
  const weekStartObj = parseISO(weekStart)
  const weekEndObj   = parseISO(weekEnd)
  const weekLabel    = `${weekStartObj.getMonth() + 1}/${weekStartObj.getDate()} ~ ${weekEndObj.getMonth() + 1}/${weekEndObj.getDate()} (${weekEndObj.getFullYear()}년 ${getISOWeek(weekStartObj)}W)`

  /* ── ?highlight 파라미터 처리 ── */
  useEffect(() => {
    const id = searchParams.get('highlight')
    if (!id || highlightHandled.current) return
    const task = tasks.find(t => t.id === id)
    if (!task) return
    highlightHandled.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightTaskId(id)
    router.replace('/calendar')

    // 태스크 시각으로 스크롤 (헤더 높이 67px 고려, 위 여백 80px)
    if (task.scheduled_at && scrollContainerRef.current) {
      const d = new Date(task.scheduled_at)
      const taskMinutes = d.getHours() * 60 + d.getMinutes()
      const START_H = 7
      const STICKY_H = 67
      const scrollTo = ((taskMinutes - START_H * 60) / 60) * HOUR_H + STICKY_H - 80
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: Math.max(0, scrollTo), behavior: 'smooth' })
      })
    }
  }, [searchParams, tasks, router])

  /* ── 이벤트 로드 (주 변경 시) ── */
  useEffect(() => {
    loadEvents(weekStart, weekEnd)
  }, [weekStart, weekEnd, loadEvents])

  /* ── highlight 파라미터 처리 ── */
  useEffect(() => {
    const hid = searchParams.get('highlight')
    if (!hid || tasks.length === 0) return
    const target = tasks.find(t => t.id === hid)
    if (!target?.scheduled_at) return
    // 해당 태스크의 주로 이동
    const targetWeek = getSundayOf(toDateStr(new Date(target.scheduled_at)))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeekStart(targetWeek)
    setHighlightTaskId(hid)
    // URL에서 highlight 파라미터 제거
    router.replace('/calendar', { scroll: false })
  }, [searchParams, tasks, router])

  const allDayEvents = useMemo(() => events.filter(e => e.isAllDay), [events])
  const allDayTasks  = useMemo(() => tasks.filter(t => !!t.scheduled_at && isAllDayScheduled(t.scheduled_at)), [tasks])
  const timedTasks   = useMemo(() => tasks.filter(t => !t.scheduled_at || !isAllDayScheduled(t.scheduled_at)), [tasks])

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
            <Button variant="ghost" size="icon-xs" onClick={() => setPanelOpen(true)} title="사이드바 열기" className="text-ink-400">
              <PanelLeftOpen size={14} />
            </Button>
          )}

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-xs" onClick={() => goWeek(-1)} className="text-ink-400">
              <ChevronLeft size={15} />
            </Button>
            <span className="text-xs font-medium text-foreground min-w-[148px] text-center select-none">{weekLabel}</span>
            <Button variant="ghost" size="icon-xs" onClick={() => goWeek(1)} className="text-ink-400">
              <ChevronRight size={15} />
            </Button>
          </div>

          {!isCurrentWeek && (
            <Button variant="link" size="xs" onClick={goToday} className="text-lilac-500 hover:text-lilac-600">
              오늘
            </Button>
          )}

          <div className="flex-1" />

          {loadingEvents && <RefreshCw size={13} className="animate-spin text-ink-400" />}

          {calendarError === 'NO_TOKEN' || calendarError === 'TOKEN_EXPIRED' ? (
            <Button
              variant="outline"
              size="xs"
              onClick={handleConnectGoogle}
              className="rounded-full border-status-warn/40 text-status-warn bg-status-warn/10 hover:bg-status-warn/15"
              title="Google 캘린더 연결 필요"
            >
              <CalendarDays size={11} />
              Google 연결
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => loadEvents(weekStart, weekEnd)}
              className="rounded-full text-muted-foreground"
            >
              <CalendarDays size={11} style={{ color: 'var(--color-google-primary)' }} />
              Google Calendar
            </Button>
          )}

          <Button size="xs" onClick={() => setFormOpen(true)}>
            <Plus size={11} />
            태스크 추가
          </Button>
        </div>

        {/* 연동 오류 배너 */}
        {calendarError && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-status-warn/10 border-b border-status-warn/20">
            <AlertCircle size={13} className="text-status-warn shrink-0" />
            <p className="text-2xs text-foreground">
              {calendarError === 'NO_TOKEN'           ? 'Google 캘린더 연동이 필요합니다.' :
               calendarError === 'TOKEN_EXPIRED'      ? 'Google 캘린더 토큰이 만료되었습니다.' :
               calendarError === 'GOOGLE_API_DISABLED'? 'Google Cloud에서 Calendar API를 활성화해 주세요.' :
               'Google 캘린더 일정을 불러오지 못했습니다.'}
            </p>
            {(calendarError === 'NO_TOKEN' || calendarError === 'TOKEN_EXPIRED') && (
              <Button size="xs" onClick={handleConnectGoogle} className="ml-auto shrink-0">
                <CalendarDays size={11} />
                연동
              </Button>
            )}
          </div>
        )}

        {/* 날짜 헤더 + 통계 + ALL-DAY + 타임그리드 */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">

          {/* 날짜 헤더 (sticky) */}
          <div className="sticky top-0 z-30 flex border-b bg-card">
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
          <div className="sticky top-8 z-30 flex border-b bg-muted">
            <div className="w-12 shrink-0" />
            {weekDates.map(date => {
              const googleHrs    = calcDayHours(date, events)
              const hasAllDay    = allDayTasks.some(t => toDateStr(new Date(t.scheduled_at!)) === date)
              const availableHrs = hasAllDay ? 0 : Math.max(0, WORK_HOURS_PER_DAY - googleHrs)
              const isZero       = availableHrs === 0
              const isTight      = !isZero && availableHrs <= 2
              return (
                <div key={date} className="flex-1 border-l border-border h-7 flex items-center justify-center px-1">
                  <span className="text-xs text-ink-400">
                    업무가능{' '}
                    <span className={isZero ? 'font-semibold text-status-warn' : isTight ? 'font-semibold text-status-late' : availableHrs < WORK_HOURS_PER_DAY ? 'font-semibold text-foreground' : ''}>
                      {fmtHrs(availableHrs)}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          {/* ALL-DAY 행 (sticky) */}
          <div className="sticky top-[60px] z-30 flex border-b bg-card">
            <div className="w-12 shrink-0 flex items-start justify-end pt-1.5 pr-2">
              <span className="text-3xs text-ink-400 whitespace-nowrap">ALL-DAY</span>
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
                      className="w-full flex-1 text-3xs px-1.5 py-0.5 rounded flex items-center gap-1 min-w-0"
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
                        className="relative w-full text-3xs px-1.5 py-1.5 rounded flex flex-col gap-0.5 group cursor-grab active:cursor-grabbing min-w-0"
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
                          <span className="text-3xs text-muted-foreground leading-tight">
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
            highlightTaskId={highlightTaskId}
            onHighlightClear={() => setHighlightTaskId(null)}
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
