'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getOrCreateWorkspace } from '@/lib/gantt-service'
import {
  getTasks, addTask, updateTask, softDeleteTask,
  getDeletedTasksCount, restoreTask, duplicateTask,
  bulkSoftDeleteTasks, bulkUpdateTaskStatus,
  autoArchiveTasks, getArchivedTasksCount,
  createNextRecurringInstance,
} from '@/lib/task-service'
import type { GanttTask, TaskStatus, TaskType, Priority, RecurrenceRule, Workspace } from '@/types'

const errMsg = (e: unknown) => e instanceof Error ? e.message : '오류가 발생했습니다.'

export function useTasksData() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [tasks,     setTasks]     = useState<GanttTask[]>([])
  const [loading,   setLoading]   = useState(true)
  const [trashCount, setTrashCount] = useState(0)
  const [archiveCount, setArchiveCount] = useState(0)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set<string>())

  const load = useCallback(async () => {
    try {
      const ws = await getOrCreateWorkspace()
      setWorkspace(ws)
      // 자동 아카이브 실행 (완료 후 7일 경과 태스크)
      await autoArchiveTasks(ws.id)
      const [list, cnt, arcCnt] = await Promise.all([getTasks(ws.id), getDeletedTasksCount(ws.id), getArchivedTasksCount(ws.id)])
      setTasks(list)
      setTrashCount(cnt)
      setArchiveCount(arcCnt)
      const statuses: TaskStatus[] = ['backlog', 'to-do', 'in-progress', 'done', 'pending']
      setCollapsed(new Set(
        statuses.filter(s => s === 'pending' || list.filter(t => t.status === s).length === 0)
      ))
      const parentIds = new Set(list.filter(t => t.parent_id).map(t => t.parent_id as string))
      setExpandedParents(parentIds)
    } catch (e) { toast.error(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const handleSave = useCallback(async (
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; priority: Priority; labels: string[]; recurrence_rule: RecurrenceRule | null; recurrence_interval: number | null },
    projectIds: string[],
    parentId: string | null,
  ) => {
    if (!workspace) return
    try {
      await addTask(workspace.id, { ...fields, parent_id: parentId }, projectIds)
      await load()
    } catch (e) { toast.error(errMsg(e)); throw e }
  }, [workspace, load])

  const handleDelete = useCallback(async (id: string) => {
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
  }, [load])

  const handleStatusChange = useCallback(async (id: string, status: TaskStatus) => {
    let updatedTasks = tasks.map(t => t.id === id ? { ...t, status } : t)

    if (status === 'done') {
      const children = updatedTasks.filter(t => t.parent_id === id && t.status !== 'done')
      if (children.length > 0) {
        updatedTasks = updatedTasks.map(t => t.parent_id === id ? { ...t, status: 'done' as TaskStatus } : t)
      }
      const changedTask = updatedTasks.find(t => t.id === id)
      if (changedTask?.parent_id) {
        const siblings = updatedTasks.filter(t => t.parent_id === changedTask.parent_id)
        if (siblings.length > 0 && siblings.every(t => t.status === 'done')) {
          updatedTasks = updatedTasks.map(t => t.id === changedTask.parent_id ? { ...t, status: 'done' as TaskStatus } : t)
        }
      }
    }

    setTasks(updatedTasks)
    try {
      const changed = updatedTasks.filter((t, i) => t.status !== tasks[i]?.status || t.id === id)
      await Promise.all(changed.map(t => updateTask(t.id, { status: t.status })))

      const changedTask = updatedTasks.find(t => t.id === id)
      const children = tasks.filter(t => t.parent_id === id && t.status !== 'done')
      if (status === 'done' && children.length > 0) {
        toast(`하위 태스크 ${children.length}개도 함께 완료했어요`)
      } else if (status === 'done' && changedTask?.parent_id) {
        const siblings = updatedTasks.filter(t => t.parent_id === changedTask.parent_id)
        if (siblings.every(t => t.status === 'done')) {
          toast('하위 태스크가 모두 완료되어 상위 태스크도 완료했어요')
        }
      }

      // 반복 태스크 완료 시 다음 인스턴스 생성
      if (status === 'done' && workspace && changedTask?.recurrence_rule) {
        const next = await createNextRecurringInstance(workspace.id, changedTask)
        if (next) {
          await load()
          const label = { daily: '매일', weekly: '매주', monthly: '매월', yearly: '매년' }[changedTask.recurrence_rule]
          const nextDate = next.due_date ?? next.start_date
          const dateStr = nextDate ? ` (${nextDate.slice(5).replace('-', '/')})` : ''
          toast(`반복 태스크 완료 — 다음 인스턴스를 생성했어요${dateStr}`, { description: label })
          return
        }
      }
    }
    catch (e) { toast.error(errMsg(e)); await load() }
  }, [tasks, workspace, load])

  const handleDuplicate = useCallback(async (task: GanttTask) => {
    if (!workspace) return
    try {
      await duplicateTask(workspace.id, task)
      await load()
      toast(`"${task.title}" 복제했어요`)
    } catch (e) { toast.error(errMsg(e)) }
  }, [workspace, load])

  const handleTaskDateChange = useCallback(async (id: string, start_date: string | null, due_date: string | null) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, start_date, due_date } : t))
    try {
      await updateTask(id, { start_date, due_date })
    } catch (e) { toast.error(errMsg(e)); await load() }
  }, [load])

  const handleDrawerSave = useCallback(async (
    task: GanttTask,
    fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels: string[]; priority: Priority; recurrence_rule: RecurrenceRule | null; recurrence_interval: number | null },
    projectIds: string[]
  ) => {
    try {
      await updateTask(task.id, fields, projectIds)
      await load()
    } catch (e) { toast.error(errMsg(e)); throw e }
  }, [load])

  const handleAddSubTask = useCallback(async (parentId: string, title: string, status: TaskStatus) => {
    if (!workspace) return
    const parent = tasks.find(t => t.id === parentId)
    await addTask(workspace.id, {
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
    }, parent?.projects?.map(p => p.id) ?? [])
    await load()
  }, [workspace, tasks, load])

  const handleKanbanReorder = useCallback(async (updates: { id: string; sort_order: number }[]) => {
    setTasks(prev => prev.map(t => {
      const upd = updates.find(u => u.id === t.id)
      return upd ? { ...t, sort_order: upd.sort_order } : t
    }))
    try {
      await Promise.all(updates.map(u => updateTask(u.id, { sort_order: u.sort_order })))
    } catch (e) { toast.error(errMsg(e)); await load() }
  }, [load])

  const handleBulkDelete = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      await bulkSoftDeleteTasks(ids)
      const idSet = new Set(ids)
      setTasks(prev => prev.filter(t => !idSet.has(t.id)))
      setTrashCount(prev => prev + ids.length)
      toast(`${ids.length}개 태스크를 휴지통으로 이동했어요`, {
        action: {
          label: '되돌리기',
          onClick: async () => {
            await Promise.all(ids.map(id => restoreTask(id)))
            setTrashCount(prev => Math.max(0, prev - ids.length))
            await load()
          },
        },
      })
    } catch (e) { toast.error(errMsg(e)) }
  }, [load])

  const handleBulkStatusChange = useCallback(async (ids: string[], status: TaskStatus) => {
    if (ids.length === 0) return
    try {
      await bulkUpdateTaskStatus(ids, status)
      const idSet = new Set(ids)
      setTasks(prev => prev.map(t => idSet.has(t.id) ? { ...t, status } : t))
      toast(`${ids.length}개 태스크 상태를 변경했어요`)
    } catch (e) { toast.error(errMsg(e)) }
  }, [])

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  const toggleExpanded = useCallback((parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId)
      return next
    })
  }, [])

  return {
    workspace, tasks, setTasks, loading, trashCount, setTrashCount, archiveCount, setArchiveCount,
    collapsed, toggleCollapse,
    expandedParents, setExpandedParents, toggleExpanded,
    load,
    handleSave, handleDelete, handleStatusChange, handleDuplicate,
    handleTaskDateChange, handleDrawerSave, handleAddSubTask,
    handleKanbanReorder, handleBulkDelete, handleBulkStatusChange,
  }
}
