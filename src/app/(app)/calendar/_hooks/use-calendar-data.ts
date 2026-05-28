'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import type { CalendarEvent, GanttTask, TaskStatus, Priority, TaskType } from '@/types'
import { getOrCreateWorkspace } from '@/lib/gantt-service'
import {
  getTasks, updateTaskSchedule, updateTask,
  softDeleteTask, duplicateTask, addTask, searchProjects,
} from '@/lib/task-service'
import { buildAllDayIso } from '../_utils'

/* ── useCalendarData ── */

export function useCalendarData() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [tasks, setTasks]             = useState<GanttTask[]>([])
  const [events, setEvents]           = useState<CalendarEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [calendarError, setCalendarError] = useState<
    'NO_TOKEN' | 'TOKEN_EXPIRED' | 'GOOGLE_API_DISABLED' | 'GOOGLE_API_ERROR' | null
  >(null)
  const [drawerTask, setDrawerTask]   = useState<GanttTask | null>(null)
  const [formOpen, setFormOpen]       = useState(false)

  /* ── 초기 로드 ── */

  useEffect(() => {
    getOrCreateWorkspace().then(ws => setWorkspaceId(ws.id)).catch(() => {})
  }, [])

  const loadTasks = useCallback(async () => {
    if (!workspaceId) return
    const data = await getTasks(workspaceId)
    setTasks(data.filter(t => !t.deleted_at))
  }, [workspaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTasks()
  }, [loadTasks])

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

  /* ── 구글 캘린더 동기화 (앱→구글) ── */

  // 시간 배치/이동/리사이즈 → 구글 이벤트 생성·수정 (DB 저장 성공 후 호출)
  const syncToGoogle = useCallback(async (taskId: string) => {
    try {
      const res = await fetch('/api/calendar/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ taskId }),
      })
      if (!res.ok) return // 미연동(403)·일시 오류는 조용히 무시 (배너가 안내)
      const json = await res.json() as { googleEventId?: string }
      if (json.googleEventId) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, google_event_id: json.googleEventId! } : t))
      }
    } catch { toast.error('구글 캘린더 반영 실패') }
  }, [])

  // 배치 해제/삭제 → 연결된 구글 이벤트 삭제
  const unsyncFromGoogle = useCallback(async (taskId: string) => {
    try {
      await fetch('/api/calendar/events', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ taskId }),
      })
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, google_event_id: null } : t))
    } catch { /* 구글 삭제 실패는 무시 (다음 동기화 때 정리) */ }
  }, [])

  /* ── 스케줄 핸들러 ── */

  const handleDrop = useCallback(async (taskId: string, scheduledAt: string, durationMinutes: number) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: scheduledAt, duration_minutes: durationMinutes } : t))
    try {
      await updateTaskSchedule(taskId, scheduledAt, durationMinutes)
      syncToGoogle(taskId)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [loadTasks, syncToGoogle])

  const handleMove = useCallback(async (taskId: string, scheduledAt: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: scheduledAt } : t))
    try {
      const task = tasks.find(t => t.id === taskId)
      await updateTaskSchedule(taskId, scheduledAt, task?.duration_minutes ?? 30)
      syncToGoogle(taskId)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [tasks, loadTasks, syncToGoogle])

  const handleResize = useCallback(async (taskId: string, durationMinutes: number) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, duration_minutes: durationMinutes } : t))
    try {
      const task = tasks.find(t => t.id === taskId)
      await updateTaskSchedule(taskId, task?.scheduled_at ?? null, durationMinutes)
      syncToGoogle(taskId)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [tasks, loadTasks, syncToGoogle])

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
      unsyncFromGoogle(taskId)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [loadTasks, unsyncFromGoogle])

  const handleDropAllDay = useCallback(async (taskId: string, date: string) => {
    const scheduledAt = buildAllDayIso(date)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_at: scheduledAt, duration_minutes: 0 } : t))
    try {
      await updateTaskSchedule(taskId, scheduledAt, 0)
      syncToGoogle(taskId)
    } catch { toast.error('저장 실패'); await loadTasks() }
  }, [loadTasks, syncToGoogle])

  /* ── Drawer 핸들러 ── */

  const handleDrawerSave = useCallback(async (
    task: GanttTask,
    fields: { title: string; status: TaskStatus; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels: string[]; priority: Priority },
    projectIds: string[]
  ) => {
    await updateTask(task.id, fields, projectIds)
    setDrawerTask({ ...task, ...fields })
    await loadTasks()
  }, [loadTasks])

  const handleDrawerDelete = useCallback(async (id: string) => {
    await softDeleteTask(id)
    unsyncFromGoogle(id)
    setDrawerTask(null)
    await loadTasks()
  }, [loadTasks, unsyncFromGoogle])

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

  /* ── Form / Search ── */

  const handleSearchProjects = useCallback(async (query: string) => {
    if (!workspaceId) return []
    const results = await searchProjects(workspaceId, query)
    return results.map(r => ({ id: r.id, name: r.name, board_name: r.board_name }))
  }, [workspaceId])

  const handleFormSave = useCallback(async (
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; priority: Priority; labels: string[] },
    projectIds: string[]
  ) => {
    if (!workspaceId) return
    await addTask(workspaceId, { ...fields, parent_id: null }, projectIds)
    await loadTasks()
  }, [workspaceId, loadTasks])

  /* ── 파생 데이터 ── */

  const assigneeSuggestions = useMemo(
    () => [...new Set(tasks.map(t => t.assignee).filter(Boolean) as string[])],
    [tasks],
  )
  const allLabels = useMemo(
    () => [...new Set(tasks.flatMap(t => t.labels ?? []))].sort(),
    [tasks],
  )

  return {
    // 데이터
    tasks, events, loadingEvents, calendarError, workspaceId,
    // 이벤트 로드
    loadEvents,
    // 스케줄
    handleDrop, handleMove, handleResize, handleUnschedule, handleDropAllDay, handleStatusChange,
    // Drawer
    drawerTask, setDrawerTask,
    handleDrawerSave, handleDrawerDelete, handleDrawerDuplicate, handleDrawerAddSubTask, handleDrawerStatusChange,
    // Form / Search
    formOpen, setFormOpen, handleFormSave, handleSearchProjects,
    // 파생
    assigneeSuggestions, allLabels,
  }
}
