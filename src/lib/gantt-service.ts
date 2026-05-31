import { createClient } from '@/lib/supabase/client'
import type { GanttBoard, GanttCategory, GanttProject, Priority, ProjectHistoryEntry, TaskHistoryEntry, Workspace } from '@/types'

const db = () => createClient()

export type ProjectUpdateFields = Partial<Pick<
  GanttProject,
  | 'category_id'
  | 'parent_id'
  | 'name'
  | 'status'
  | 'start_date'
  | 'end_date'
  | 'sort_order'
  | 'team'
  | 'pm'
  | 'memo'
  | 'priority'
  | 'progress'
  | 'is_milestone'
>>

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
    .limit(500)
  if (error) throw error
  return data
}

export async function addProject(
  boardId: string,
  workspaceId: string,
  categoryId: string,
  parentId: string | null,
  fields: { name: string; status: string; start_date: string | null; end_date: string | null; team?: string | null; pm?: string | null; memo?: string | null; priority?: Priority | null; progress?: number; is_milestone?: boolean }
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

export async function updateProject(id: string, updates: ProjectUpdateFields): Promise<GanttProject> {
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
  const now = new Date().toISOString()
  // 자식(서브프로젝트)까지 함께 휴지통으로 — restoreTask 패턴과 동일
  await db().from('gantt_projects').update({ deleted_at: now }).eq('parent_id', id)
  const { error } = await db()
    .from('gantt_projects')
    .update({ deleted_at: now })
    .eq('id', id)
  if (error) throw error
}

/** 부모와 자식(서브프로젝트)을 함께 복원하고 복원된 전체 목록을 반환한다. */
export async function restoreProject(id: string): Promise<GanttProject[]> {
  const { data, error } = await db()
    .from('gantt_projects')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  const { data: children, error: childErr } = await db()
    .from('gantt_projects')
    .update({ deleted_at: null })
    .eq('parent_id', id)
    .select()
  if (childErr) throw childErr
  return [data, ...(children ?? [])]
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

