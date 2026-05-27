'use client'

import { useCallback, useRef, useState } from 'react'
import {
  pointerWithin, rectIntersection,
  type DragEndEvent, type DragStartEvent, type DragOverEvent, type CollisionDetection,
} from '@dnd-kit/core'
import { toast } from 'sonner'
import { updateTask } from '@/lib/task-service'
import { useDndSensorsPointer, computeReorder } from '@/lib/dnd-utils'
import type { GanttTask, TaskStatus } from '@/types'
import { isOverdue } from '../_utils'

const errMsg = (e: unknown) => e instanceof Error ? e.message : '오류가 발생했습니다.'

export function useTaskDrag(
  tasks: GanttTask[],
  setTasks: React.Dispatch<React.SetStateAction<GanttTask[]>>,
  expandedParents: Set<string>,
  setExpandedParents: React.Dispatch<React.SetStateAction<Set<string>>>,
  handleStatusChange: (id: string, status: TaskStatus) => Promise<void>,
  load: () => Promise<void>,
) {
  const [draggingTask,  setDraggingTask]  = useState<GanttTask | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)
  const dragExpandedRef = useRef<string | null>(null)

  const sensors = useDndSensorsPointer()

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
    return rectIntersection(args)
  }, [])

  function restoreDragExpanded() {
    setDragOverGroup(null)
    if (dragExpandedRef.current) {
      const id = dragExpandedRef.current
      dragExpandedRef.current = null
      setExpandedParents(prev => new Set([...prev, id]))
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find(t => t.id === event.active.id)
    if (task) {
      setDraggingTask(task)
      setDragOverGroup(null)
      if (expandedParents.has(task.id)) {
        dragExpandedRef.current = task.id
        setExpandedParents(prev => { const next = new Set(prev); next.delete(task.id); return next })
      } else {
        dragExpandedRef.current = null
      }
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event
    if (!over) { setDragOverGroup(null); return }
    const statusValues = ['backlog', 'to-do', 'in-progress', 'done', 'pending']
    if (statusValues.includes(over.id as string)) {
      setDragOverGroup(over.id as string)
    } else {
      const overTask = tasks.find(t => t.id === over.id)
      if (overTask) {
        const overGroup = isOverdue(overTask.due_date, overTask.status) ? '__overdue__' : overTask.status
        setDragOverGroup(overGroup)
      }
    }
  }

  function handleDragCancel() {
    setDraggingTask(null)
    restoreDragExpanded()
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTask(null)
    restoreDragExpanded()
    const { active, over } = event
    if (!over || active.id === over.id) return

    const task = tasks.find(t => t.id === active.id)
    if (!task) return

    const statusValues: string[] = ['backlog', 'to-do', 'in-progress', 'done', 'pending']
    if (statusValues.includes(over.id as string)) {
      const newStatus = over.id as TaskStatus
      if (task.status !== newStatus) handleStatusChange(task.id, newStatus)
      return
    }

    const overTask = tasks.find(t => t.id === over.id)
    if (!overTask) return

    const sameGroup = task.status === overTask.status
    const targetStatus = overTask.status

    const targetGroupTasks = tasks.filter(t => !t.parent_id && t.status === targetStatus && t.id !== task.id)
    const insertIdx = targetGroupTasks.findIndex(t => t.id === over.id)
    if (insertIdx === -1) return

    // setTasks에 sort_order 업데이트 반영 + 정렬
    function applyOrderUpdates(updates: { id: string; sort_order: number }[], statusChange?: { taskId: string; status: TaskStatus }) {
      setTasks(prev => {
        const orderMap = new Map(updates.map(u => [u.id, u.sort_order]))
        return prev.map(t => {
          const newOrder = orderMap.get(t.id)
          if (statusChange && t.id === statusChange.taskId) return { ...t, status: statusChange.status, sort_order: newOrder ?? t.sort_order }
          return newOrder != null ? { ...t, sort_order: newOrder } : t
        }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      })
    }

    if (sameGroup) {
      const groupWithActive = tasks.filter(t => !t.parent_id && t.status === targetStatus)
      const updates = computeReorder(groupWithActive, active.id as string, over.id as string)
      if (updates.length === 0) return

      applyOrderUpdates(updates)
      Promise.all(updates.map(u => updateTask(u.id, { sort_order: u.sort_order })))
        .catch(e => { toast.error(errMsg(e)); load() })
    } else {
      const reordered = [...targetGroupTasks]
      reordered.splice(insertIdx, 0, { ...task, status: targetStatus })
      const updates = reordered.map((t, i) => ({ id: t.id, sort_order: i }))

      applyOrderUpdates(updates, { taskId: task.id, status: targetStatus })
      Promise.all([
        updateTask(task.id, { status: targetStatus, sort_order: updates.find(u => u.id === task.id)?.sort_order }),
        ...updates.filter(u => u.id !== task.id).map(u => updateTask(u.id, { sort_order: u.sort_order })),
      ]).catch(e => { toast.error(errMsg(e)); load() })
    }
  }

  function getSortableIds(groupKey: string, groupTasks: GanttTask[]) {
    const ids = groupTasks.map(t => t.id)
    if (!draggingTask) return ids
    const dragId = draggingTask.id
    const dragGroup = isOverdue(draggingTask.due_date, draggingTask.status) ? '__overdue__' : draggingTask.status
    const isSource = dragGroup === groupKey
    const isTarget = dragOverGroup === groupKey

    if (isSource && !isTarget) {
      return ids.filter(id => id !== dragId)
    }
    return ids
  }

  return {
    draggingTask,
    sensors, collisionDetection,
    handleDragStart, handleDragOver, handleDragEnd, handleDragCancel,
    getSortableIds,
  }
}
