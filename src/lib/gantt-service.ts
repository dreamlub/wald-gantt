import { createClient } from '@/lib/supabase/client'
import type { GanttBoard, GanttCategory, GanttProject, ProjectHistoryEntry, Workspace } from '@/types'

const supabase = createClient()

// ── Workspace ──────────────────────────────────────────────

export async function getOrCreateWorkspace(): Promise<Workspace> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(*)')
    .eq('user_id', user.id)
    .single()

  if (member?.workspace_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (member as any).workspaces as Workspace
  }

  const { data: ws, error } = await supabase.rpc('create_workspace_for_user', {
    workspace_name: (user.email?.split('@')[0] ?? 'My') + "'s workspace",
  })
  if (error) throw error
  return ws as Workspace
}

export async function getWorkspaceMembers(workspaceId: string) {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return data
}

export async function inviteMember(workspaceId: string, email: string) {
  const { data, error } = await supabase.rpc('invite_member_by_email', {
    p_workspace_id: workspaceId,
    p_email: email,
  })
  if (error) throw error
  return data
}

// ── Boards ─────────────────────────────────────────────────

export async function getBoards(workspaceId: string): Promise<GanttBoard[]> {
  const { data, error } = await supabase
    .from('gantt_boards')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getOrCreateDefaultBoard(workspaceId: string): Promise<GanttBoard> {
  const { data } = await supabase
    .from('gantt_boards')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('sort_order')
    .limit(1)
    .single()

  if (data) return data

  const { data: board, error } = await supabase
    .from('gantt_boards')
    .insert({ workspace_id: workspaceId, name: '기본 보드', sort_order: 0 })
    .select()
    .single()
  if (error) throw error
  return board
}

export async function addBoard(workspaceId: string, name: string): Promise<GanttBoard> {
  const { data: existing } = await supabase
    .from('gantt_boards')
    .select('sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data, error } = await supabase
    .from('gantt_boards')
    .insert({ workspace_id: workspaceId, name, sort_order })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBoard(id: string, updates: Partial<Pick<GanttBoard, 'name' | 'sort_order'>>): Promise<GanttBoard> {
  const { data, error } = await supabase
    .from('gantt_boards')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBoard(id: string): Promise<void> {
  const { error } = await supabase.from('gantt_boards').delete().eq('id', id)
  if (error) throw error
}

// ── Categories ─────────────────────────────────────────────

export async function getCategories(boardId: string): Promise<GanttCategory[]> {
  const { data, error } = await supabase
    .from('gantt_categories')
    .select('*')
    .eq('board_id', boardId)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function addCategory(boardId: string, workspaceId: string, name: string, color: string): Promise<GanttCategory> {
  const { data: existing } = await supabase
    .from('gantt_categories')
    .select('sort_order')
    .eq('board_id', boardId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data, error } = await supabase
    .from('gantt_categories')
    .insert({ board_id: boardId, workspace_id: workspaceId, name, color, sort_order })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCategory(id: string, updates: Partial<Pick<GanttCategory, 'name' | 'color' | 'sort_order'>>): Promise<GanttCategory> {
  const { data, error } = await supabase
    .from('gantt_categories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('gantt_categories').delete().eq('id', id)
  if (error) throw error
}

// ── Projects ───────────────────────────────────────────────

export async function getProjects(boardId: string): Promise<GanttProject[]> {
  const { data, error } = await supabase
    .from('gantt_projects')
    .select('*')
    .eq('board_id', boardId)
    .is('deleted_at', null)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function getDeletedProjects(boardId: string): Promise<GanttProject[]> {
  const { data, error } = await supabase
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
  fields: { name: string; status: string; start_date: string | null; end_date: string | null; team?: string | null; pm?: string | null }
): Promise<GanttProject> {
  const { data: existing } = await supabase
    .from('gantt_projects')
    .select('sort_order')
    .eq('board_id', boardId)
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data, error } = await supabase
    .from('gantt_projects')
    .insert({ board_id: boardId, workspace_id: workspaceId, category_id: categoryId, parent_id: parentId, sort_order, ...fields })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProject(id: string, updates: Partial<GanttProject>): Promise<GanttProject> {
  const { data, error } = await supabase
    .from('gantt_projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function softDeleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('gantt_projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreProject(id: string): Promise<GanttProject> {
  const { data, error } = await supabase
    .from('gantt_projects')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function permanentDeleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('gantt_projects').delete().eq('id', id)
  if (error) throw error
}

export async function emptyTrash(boardId: string): Promise<void> {
  const { error } = await supabase
    .from('gantt_projects')
    .delete()
    .eq('board_id', boardId)
    .not('deleted_at', 'is', null)
  if (error) throw error
}

// ── Project History ────────────────────────────────────────

export async function getProjectHistory(projectId: string): Promise<ProjectHistoryEntry[]> {
  const { data, error } = await supabase
    .from('gantt_project_history')
    .select('*')
    .eq('project_id', projectId)
    .order('changed_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export type GhostDates = Record<string, { start_date: string | null; end_date: string | null }>

/** 보드 내 프로젝트들의 가장 최근 이전 날짜(old_value)를 가져옴 */
export async function getProjectsGhostDates(projectIds: string[]): Promise<GhostDates> {
  if (projectIds.length === 0) return {}
  const { data, error } = await supabase
    .from('gantt_project_history')
    .select('project_id, field_name, old_value, changed_at')
    .in('project_id', projectIds)
    .in('field_name', ['start_date', 'end_date', 'start_month', 'end_month'])
    .order('changed_at', { ascending: false })
  if (error) throw error

  const result: GhostDates = {}
  const seen = new Set<string>()
  for (const entry of data ?? []) {
    const key = `${entry.project_id}:${entry.field_name}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!result[entry.project_id]) result[entry.project_id] = { start_date: null, end_date: null }
    const val = entry.old_value as string | null
    const normalized = val && val.length === 7 ? val + '-01' : val
    if (entry.field_name === 'start_date' || entry.field_name === 'start_month') {
      result[entry.project_id].start_date = normalized
    } else {
      result[entry.project_id].end_date = normalized
    }
  }
  return result
}
