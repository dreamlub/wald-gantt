import { createClient } from '@/lib/supabase/client'
import type { GanttBoard, GanttCategory, GanttProject, GanttTask, Priority, ProjectHistoryEntry, TaskHistoryEntry, TaskStatus, TaskType, Workspace } from '@/types'

const db = () => createClient()

// ── Workspace ──────────────────────────────────────────────

export async function getOrCreateWorkspace(): Promise<Workspace> {
  const { data: { user } } = await db().auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await db()
    .from('workspace_members')
    .select('workspace_id, workspaces(*)')
    .eq('user_id', user.id)
    .single()

  if (member?.workspace_id) {
    return (member as unknown as { workspaces: Workspace }).workspaces
  }

  const { data: ws, error } = await db().rpc('create_workspace_for_user', {
    workspace_name: (user.email?.split('@')[0] ?? 'My') + "'s workspace",
  })
  if (error) throw error
  return ws as Workspace
}

// ── Share Tokens ───────────────────────────────────────────

export async function getShareToken(boardId: string): Promise<string | null> {
  const { data } = await db()
    .from('board_share_tokens')
    .select('token')
    .eq('board_id', boardId)
    .single()
  return data?.token ?? null
}

export async function createShareToken(boardId: string): Promise<string> {
  const { data, error } = await db()
    .from('board_share_tokens')
    .insert({ board_id: boardId })
    .select('token')
    .single()
  if (error) throw error
  return data.token
}

export async function deleteShareToken(boardId: string): Promise<void> {
  const { error } = await db()
    .from('board_share_tokens')
    .delete()
    .eq('board_id', boardId)
  if (error) throw error
}

// ── Boards ─────────────────────────────────────────────────

export async function getBoards(workspaceId: string): Promise<GanttBoard[]> {
  const { data, error } = await db()
    .from('gantt_boards')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getOrCreateDefaultBoard(workspaceId: string): Promise<GanttBoard> {
  const { data } = await db()
    .from('gantt_boards')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
    .limit(1)
    .single()

  if (data) return data

  const { data: board, error } = await db()
    .from('gantt_boards')
    .insert({ workspace_id: workspaceId, name: '기본 보드', sort_order: 0 })
    .select()
    .single()
  if (error) throw error
  return board
}

export async function addBoard(workspaceId: string, name: string): Promise<GanttBoard> {
  const { data: existing } = await db()
    .from('gantt_boards')
    .select('sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data, error } = await db()
    .from('gantt_boards')
    .insert({ workspace_id: workspaceId, name, sort_order })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBoard(id: string, updates: Partial<Pick<GanttBoard, 'name' | 'sort_order'>>): Promise<GanttBoard> {
  const { data, error } = await db()
    .from('gantt_boards')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBoard(id: string): Promise<void> {
  const { error } = await db().from('gantt_boards').delete().eq('id', id)
  if (error) throw error
}

// ── Categories ─────────────────────────────────────────────

export async function getCategories(boardId: string): Promise<GanttCategory[]> {
  const { data, error } = await db()
    .from('gantt_categories')
    .select('*')
    .eq('board_id', boardId)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function addCategory(boardId: string, workspaceId: string, name: string, color: string): Promise<GanttCategory> {
  const { data: existing } = await db()
    .from('gantt_categories')
    .select('sort_order')
    .eq('board_id', boardId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data, error } = await db()
    .from('gantt_categories')
    .insert({ board_id: boardId, workspace_id: workspaceId, name, color, sort_order })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCategory(id: string, updates: Partial<Pick<GanttCategory, 'name' | 'color' | 'sort_order'>>): Promise<GanttCategory> {
  const { data, error } = await db()
    .from('gantt_categories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await db().from('gantt_categories').delete().eq('id', id)
  if (error) throw error
}

// ── Projects ───────────────────────────────────────────────

export async function getProjects(boardId: string): Promise<GanttProject[]> {
  const { data, error } = await db()
    .from('gantt_projects')
    .select('*')
    .eq('board_id', boardId)
    .is('deleted_at', null)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getDeletedProjectsCount(boardId: string): Promise<number> {
  const { count, error } = await db()
    .from('gantt_projects')
    .select('*', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .not('deleted_at', 'is', null)
  if (error) throw error
  return count ?? 0
}

export async function getDeletedProjects(boardId: string): Promise<GanttProject[]> {
  const { data, error } = await db()
    .from('gantt_projects')
    .select('*')
    .eq('board_id', boardId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addProject(
  boardId: string,
  workspaceId: string,
  categoryId: string,
  parentId: string | null,
  fields: { name: string; status: string; start_date: string | null; end_date: string | null; team?: string | null; pm?: string | null; memo?: string | null; priority?: Priority | null }
): Promise<GanttProject> {
  const { data: existing } = await db()
    .from('gantt_projects')
    .select('sort_order')
    .eq('board_id', boardId)
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data, error } = await db()
    .from('gantt_projects')
    .insert({ board_id: boardId, workspace_id: workspaceId, category_id: categoryId, parent_id: parentId, sort_order, ...fields })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProject(id: string, updates: Partial<GanttProject>): Promise<GanttProject> {
  const { data, error } = await db()
    .from('gantt_projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function softDeleteProject(id: string): Promise<void> {
  const { error } = await db()
    .from('gantt_projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreProject(id: string): Promise<GanttProject> {
  const { data, error } = await db()
    .from('gantt_projects')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function permanentDeleteProject(id: string): Promise<void> {
  const { error } = await db().from('gantt_projects').delete().eq('id', id)
  if (error) throw error
}

export async function emptyTrash(boardId: string): Promise<void> {
  const { error } = await db()
    .from('gantt_projects')
    .delete()
    .eq('board_id', boardId)
    .not('deleted_at', 'is', null)
  if (error) throw error
}

// ── Project History ────────────────────────────────────────

export async function getProjectHistory(projectId: string): Promise<ProjectHistoryEntry[]> {
  const { data, error } = await db()
    .from('gantt_project_history')
    .select('*')
    .eq('project_id', projectId)
    .order('changed_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function getTaskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
  const { data, error } = await db()
    .from('gantt_task_history')
    .select('*')
    .eq('task_id', taskId)
    .order('changed_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

// ── Tasks ──────────────────────────────────────────────────

/** 워크스페이스의 모든 태스크 (연결된 프로젝트 포함, 삭제되지 않은 것만) */
export async function getTasks(workspaceId: string): Promise<GanttTask[]> {
  const { data, error } = await db()
    .from('gantt_tasks')
    .select(`
      *,
      gantt_task_projects (
        project_id,
        gantt_projects ( id, name, gantt_boards ( name ) )
      )
    `)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('sort_order')
  if (error) throw error

  type TaskRow = GanttTask & { gantt_task_projects?: TaskProjectJoin[] }
  type TaskProjectJoin = { gantt_projects: { id: string; name: string; gantt_boards?: { name?: string } | null } }
  return (data as TaskRow[] ?? []).map((row) => ({
    ...row,
    projects: (row.gantt_task_projects ?? []).map((tp) => ({
      id: tp.gantt_projects.id,
      name: tp.gantt_projects.name,
      board_name: tp.gantt_projects.gantt_boards?.name ?? '',
    })),
  }))
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
    .select(`
      *,
      gantt_task_projects (
        project_id,
        gantt_projects ( id, name, gantt_boards ( name ) )
      )
    `)
    .eq('workspace_id', workspaceId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw error

  type TaskRow = GanttTask & { gantt_task_projects?: TaskProjectJoin[] }
  type TaskProjectJoin = { gantt_projects: { id: string; name: string; gantt_boards?: { name?: string } | null } }
  return (data as TaskRow[] ?? []).map((row) => ({
    ...row,
    projects: (row.gantt_task_projects ?? []).map((tp) => ({
      id: tp.gantt_projects.id,
      name: tp.gantt_projects.name,
      board_name: tp.gantt_projects.gantt_boards?.name ?? '',
    })),
  }))
}

export async function addTask(
  workspaceId: string,
  fields: { title: string; status: TaskStatus; type: TaskType; assignee: string | null; start_date: string | null; due_date: string | null; memo: string | null; labels?: string[] | null; parent_id?: string | null; priority?: Priority | null },
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
  fields: Partial<Pick<GanttTask, 'title' | 'status' | 'type' | 'assignee' | 'start_date' | 'due_date' | 'memo' | 'labels' | 'priority' | 'sort_order'>>,
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
  // 자식 태스크도 같이 soft delete
  await db().from('gantt_tasks').update({ deleted_at: now }).eq('parent_id', id)
  const { error } = await db()
    .from('gantt_tasks')
    .update({ deleted_at: now })
    .eq('id', id)
  if (error) throw error
}

export async function restoreTask(id: string): Promise<void> {
  const { error } = await db()
    .from('gantt_tasks')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw error
  // 같이 삭제된 자식도 복구
  await db().from('gantt_tasks').update({ deleted_at: null }).eq('parent_id', id)
}

export async function permanentDeleteTask(id: string): Promise<void> {
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

export async function bulkSoftDeleteTasks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db()
    .from('gantt_tasks')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
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
  const dayStart = `${dateStr}T00:00:00.000Z`
  const dayEnd   = `${dateStr}T23:59:59.999Z`
  const { data, error } = await db()
    .from('gantt_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)
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
