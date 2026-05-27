'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { addTask } from '@/lib/task-service'
import type { GanttTask, TaskStatus, Workspace } from '@/types'

const errMsg = (e: unknown) => e instanceof Error ? e.message : '오류가 발생했습니다.'

export function useQuickAdd(
  workspace: Workspace | null,
  tasks: GanttTask[],
  setExpandedParents: React.Dispatch<React.SetStateAction<Set<string>>>,
  load: () => Promise<void>,
) {
  const [quickAddStatus,   setQuickAddStatus]   = useState<TaskStatus | null>(null)
  const [quickAddParentId, setQuickAddParentId] = useState<string | null>(null)
  const [quickAddTitle,    setQuickAddTitle]    = useState('')

  // ── 상태 그룹 퀵 등록 ───────────────────────────────────────
  const commitQuickAdd = useCallback(async (status: TaskStatus) => {
    if (!workspace) return
    const title = quickAddTitle.trim()
    if (!title) { setQuickAddStatus(null); setQuickAddTitle(''); return }
    try {
      await addTask(workspace.id, {
        title, status, type: 'mine', assignee: null,
        start_date: null, due_date: null, memo: null, priority: 2, labels: [],
      }, [])
      setQuickAddTitle('')
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }, [workspace, quickAddTitle, load])

  const cancelQuickAdd = useCallback(() => {
    setQuickAddStatus(null); setQuickAddTitle('')
  }, [])

  // ── 하위 태스크 퀵 등록 ─────────────────────────────────────
  const openAddSubTask = useCallback((parentId: string) => {
    setExpandedParents(prev => new Set([...prev, parentId]))
    setQuickAddParentId(parentId)
    setQuickAddStatus(null)
    setQuickAddTitle('')
  }, [setExpandedParents])

  const commitQuickAddSub = useCallback(async (parentId: string) => {
    if (!workspace) return
    const parent = tasks.find(t => t.id === parentId)
    if (!parent) return
    const title = quickAddTitle.trim()
    if (!title) { setQuickAddParentId(null); setQuickAddTitle(''); return }
    try {
      await addTask(workspace.id, {
        title,
        status: parent.status,
        type: parent.type ?? 'mine',
        assignee: parent.assignee ?? null,
        start_date: parent.start_date ?? null,
        due_date: parent.due_date ?? null,
        memo: null,
        priority: parent.priority ?? 2,
        labels: parent.labels ?? [],
        parent_id: parentId,
      }, parent.projects?.map(p => p.id) ?? [])
      setQuickAddTitle('')
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }, [workspace, tasks, quickAddTitle, load])

  const cancelQuickAddSub = useCallback(() => {
    setQuickAddParentId(null); setQuickAddTitle('')
  }, [])

  // ── ListView / KanbanView 용 퀵 생성 ────────────────────────
  const listQuickCreate = useCallback(async (title: string, status: TaskStatus) => {
    if (!workspace) return
    try {
      await addTask(workspace.id, {
        title, status, type: 'mine', assignee: null,
        start_date: null, due_date: null, memo: null, priority: 2, labels: [],
      }, [])
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }, [workspace, load])

  // ── Inbox 전용 퀵 캡처 ─────────────────────────────────────
  const inboxQuickCreate = useCallback(async (title: string) => {
    if (!workspace) return
    try {
      await addTask(workspace.id, {
        title, status: 'inbox', type: 'mine', assignee: null,
        start_date: null, due_date: null, memo: null, priority: 0, labels: [],
      }, [])
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }, [workspace, load])

  const listSubQuickCreate = useCallback(async (parentId: string, title: string) => {
    if (!workspace) return
    const parent = tasks.find(t => t.id === parentId)
    if (!parent) return
    try {
      await addTask(workspace.id, {
        title,
        status: parent.status,
        type: parent.type ?? 'mine',
        assignee: parent.assignee ?? null,
        start_date: parent.start_date ?? null,
        due_date: parent.due_date ?? null,
        memo: null,
        priority: parent.priority ?? 2,
        labels: parent.labels ?? [],
        parent_id: parentId,
      }, parent.projects?.map(p => p.id) ?? [])
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }, [workspace, tasks, load])

  return {
    quickAddStatus, setQuickAddStatus,
    quickAddParentId, setQuickAddParentId,
    quickAddTitle, setQuickAddTitle,
    commitQuickAdd, cancelQuickAdd,
    openAddSubTask, commitQuickAddSub, cancelQuickAddSub,
    listQuickCreate, listSubQuickCreate,
    inboxQuickCreate,
  }
}
