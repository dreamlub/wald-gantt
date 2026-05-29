import { createClient } from '@/lib/supabase/client'
import type { GanttTask, Priority, RecurrenceRule, TaskStatus, TaskType } from '@/types'
import { addDaysYMD, addMonthsYMD, kstDayRange } from '@/lib/kst'
import { removeTaskLinkFromNotes } from './note-service'

const db = () => createClient()

// ── Tasks ──────────────────────────────────────────────────

type TaskProjectJoin = { gantt_projects: { id: string; name: string; gantt_boards?: { name?: string } | null } }
type TaskRow = GanttTask & { gantt_task_projects?: TaskProjectJoin[] }

function mapTaskRow(row: TaskRow): GanttTask {
  return {
    ...row,
    projects: (row.gantt_task_projects ?? []).map((tp) => ({
      id: tp.gantt_projects.id,
      name: tp.gantt_projects.name,
      board_name: tp.gantt_projects.gantt_boards?.name ?? '',
    })),
  }
}

const TASK_SELECT = `
  *,
  gantt_task_projects (
    project_id,
    gantt_projects ( id, name, gantt_boards ( name ) )
  )
`

/** 워크스페이스의 모든 태스크 (연결된 프로젝트 포함, 삭제되지 않은 것만) */
export async function getTasks(workspaceId: string): Promise<GanttTask[]> {
  const { data, error } = await db()
    .from('gantt_tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('sort_order')
  if (error) throw error
  return (data as TaskRow[] ?? []).map(mapTaskRow)
}

export async function getDeletedTasksCount(workspaceId: string): Promise<number> {
  const { count, error } = await db()
    .from('gantt_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
  if (error) throw error
  return count ?? 0
}

export async function getDeletedTasks(workspaceId: string): Promise<GanttTask[]> {
  const { data, error } = await db()
    .from('gantt_tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return (data as TaskRow[] ?? []).map(mapTaskRow)
}

export async function addTask(
  workspaceId: string,
  fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels?: string[] | null; parent_id?: string | null; priority?: Priority | null; recurrence_rule?: RecurrenceRule | null; recurrence_interval?: number | null; series_id?: string | null },
  projectIds: string[] = []
): Promise<GanttTask> {
  const { data: existing } = await db()
    .from('gantt_tasks')
    .select('sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data: task, error } = await db()
    .from('gantt_tasks')
    .insert({ workspace_id: workspaceId, sort_order, ...fields })
    .select()
    .single()
  if (error) throw error

  if (projectIds.length > 0) {
    const { error: linkError } = await db()
      .from('gantt_task_projects')
      .insert(projectIds.map(project_id => ({ task_id: task.id, project_id })))
    if (linkError) throw linkError
  }

  return { ...task, projects: [] }
}

export async function updateTask(
  id: string,
  fields: Partial<Pick<GanttTask, 'title' | 'status' | 'type' | 'assignee' | 'start_date' | 'due_date' | 'memo' | 'labels' | 'priority' | 'sort_order' | 'recurrence_rule' | 'recurrence_interval' | 'series_id'>>,
  projectIds?: string[]
): Promise<void> {
  const { error } = await db()
    .from('gantt_tasks')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error

  if (projectIds !== undefined) {
    const { error: delError } = await db().from('gantt_task_projects').delete().eq('task_id', id)
    if (delError) throw delError
    if (projectIds.length > 0) {
      const { error: linkError } = await db()
        .from('gantt_task_projects')
        .insert(projectIds.map(project_id => ({ task_id: id, project_id })))
      if (linkError) throw linkError
    }
  }
}

export async function softDeleteTask(id: string): Promise<void> {
  const now = new Date().toISOString()
  await db().from('gantt_tasks').update({ deleted_at: now }).eq('parent_id', id)
  const { error } = await db()
    .from('gantt_tasks')
    .update({ deleted_at: now })
    .eq('id', id)
  if (error) throw error
  void removeTaskLinkFromNotes(id)  // 메모 링크 정리 (태스크 삭제와 독립적)
}

export async function restoreTask(id: string): Promise<void> {
  const { error } = await db()
    .from('gantt_tasks')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw error
  await db().from('gantt_tasks').update({ deleted_at: null }).eq('parent_id', id)
}

export async function permanentDeleteTask(id: string): Promise<void> {
  void removeTaskLinkFromNotes(id)  // 메모 링크 정리
  const { error } = await db().from('gantt_tasks').delete().eq('id', id)
  if (error) throw error
}

export async function emptyTaskTrash(workspaceId: string): Promise<void> {
  const { error } = await db()
    .from('gantt_tasks')
    .delete()
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
  if (error) throw error
}

export async function duplicateTask(workspaceId: string, task: GanttTask): Promise<GanttTask> {
  return addTask(workspaceId, {
    title: task.title + ' (복사)',
    status: task.status,
    type: task.type,
    assignee: task.assignee,
    start_date: task.start_date,
    due_date: task.due_date,
    memo: task.memo,
    labels: task.labels,
    priority: task.priority,
    parent_id: task.parent_id,
  }, task.projects?.map(p => p.id) ?? [])
}

// ── 반복 태스크 ────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  return addDaysYMD(dateStr, days)
}

function calcNextDates(
  start_date: string | null,
  due_date: string | null,
  rule: RecurrenceRule,
  interval: number
): { next_start: string | null; next_due: string | null } {
  const unit = rule === 'daily' ? interval
    : rule === 'weekly' ? interval * 7
    : null

  if (rule === 'daily' || rule === 'weekly') {
    return {
      next_start: start_date ? addDays(start_date, unit!) : null,
      next_due: due_date ? addDays(due_date, unit!) : null,
    }
  }

  const shiftMonth = addMonthsYMD

  const months = rule === 'monthly' ? interval : interval * 12
  return {
    next_start: start_date ? shiftMonth(start_date, months) : null,
    next_due: due_date ? shiftMonth(due_date, months) : null,
  }
}

export async function createNextRecurringInstance(
  workspaceId: string,
  task: GanttTask
): Promise<GanttTask | null> {
  if (!task.recurrence_rule) return null

  const interval = task.recurrence_interval ?? 1
  const { next_start, next_due } = calcNextDates(
    task.start_date,
    task.due_date,
    task.recurrence_rule,
    interval
  )

  if (!next_start && !next_due) return null

  const seriesId = task.series_id ?? task.id

  return addTask(workspaceId, {
    title: task.title,
    status: 'to-do',
    type: task.type,
    assignee: task.assignee,
    start_date: next_start,
    due_date: next_due,
    memo: task.memo,
    labels: task.labels,
    priority: task.priority,
    recurrence_rule: task.recurrence_rule,
    recurrence_interval: interval,
    series_id: seriesId,
  }, task.projects?.map(p => p.id) ?? [])
}

// ── Bulk Operations ───────────────────────────────────────

export async function bulkSoftDeleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db()
    .from('gantt_tasks')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
  void Promise.all(ids.map(id => removeTaskLinkFromNotes(id)))
}

export async function bulkUpdateTaskStatus(ids: string[], status: TaskStatus): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db()
    .from('gantt_tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
}

// ── Time Blocking ──────────────────────────────────────────

export async function getScheduledTasks(workspaceId: string, dateStr: string): Promise<GanttTask[]> {
  // scheduled_at은 캘린더 전반에서 KST 기준 instant로 다루므로 경계도 KST 반열린 구간으로 비교
  const { gte, lt } = kstDayRange(dateStr)
  const { data, error } = await db()
    .from('gantt_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .gte('scheduled_at', gte)
    .lt('scheduled_at', lt)
    .order('scheduled_at')
  if (error) throw error
  return (data ?? []).map(row => ({ ...row, projects: [] }))
}

export async function updateTaskSchedule(
  id: string,
  scheduled_at: string | null,
  duration_minutes: number | null
): Promise<void> {
  const { error } = await db()
    .from('gantt_tasks')
    .update({ scheduled_at, duration_minutes, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** 전체 보드 통합 프로젝트 검색 */
export async function searchProjects(workspaceId: string, query: string): Promise<{ id: string; name: string; board_name: string }[]> {
  const { data, error } = await db()
    .from('gantt_projects')
    .select('id, name, gantt_boards(name)')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .ilike('name', `%${query.replace(/[%_\\]/g, '\\$&')}%`)
    .limit(20)
  if (error) throw error
  type ProjectRow = { id: string; name: string; gantt_boards?: { name?: string } | null }
  return (data as ProjectRow[] ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    board_name: p.gantt_boards?.name ?? '',
  }))
}

// ── Archive ───────────────────────────────────────────────

const DEFAULT_ARCHIVE_DAYS = 7

/** 완료 후 N일 경과한 태스크를 자동 아카이브 */
export async function autoArchiveTasks(workspaceId: string, days: number = DEFAULT_ARCHIVE_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await db()
    .from('gantt_tasks')
    .update({ archived_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('status', 'done')
    .is('archived_at', null)
    .is('deleted_at', null)
    .lt('updated_at', cutoff)
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}

/** 아카이브된 태스크 목록 조회 */
export async function getArchivedTasks(workspaceId: string): Promise<GanttTask[]> {
  const { data, error } = await db()
    .from('gantt_tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .is('deleted_at', null)
    .order('archived_at', { ascending: false })
  if (error) throw error
  return (data as TaskRow[] ?? []).map(mapTaskRow)
}

/** 아카이브된 태스크 수 */
export async function getArchivedTasksCount(workspaceId: string): Promise<number> {
  const { count, error } = await db()
    .from('gantt_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .not('archived_at', 'is', null)
    .is('deleted_at', null)
  if (error) throw error
  return count ?? 0
}

/** 아카이브 해제 (복원) */
export async function unarchiveTask(id: string): Promise<void> {
  const { error } = await db()
    .from('gantt_tasks')
    .update({ archived_at: null })
    .eq('id', id)
  if (error) throw error
}
