import { createClient } from '@/lib/supabase/client'
import type { GanttCategory, GanttProject, Workspace } from '@/types'

const supabase = createClient()

// ── Workspace ──────────────────────────────────────────────

export async function getOrCreateWorkspace(): Promise<Workspace> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // check existing membership
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(*)')
    .eq('user_id', user.id)
    .single()

  if (member?.workspace_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (member as any).workspaces as Workspace
  }

  // create new workspace atomically via RPC (bypasses RLS ordering issue)
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
  // Find user by email via auth - in practice you'd use an invite flow
  // For simplicity: insert by looking up the user
  const { data, error } = await supabase.rpc('invite_member_by_email', {
    p_workspace_id: workspaceId,
    p_email: email,
  })
  if (error) throw error
  return data
}

// ── Categories ─────────────────────────────────────────────

export async function getCategories(workspaceId: string): Promise<GanttCategory[]> {
  const { data, error } = await supabase
    .from('gantt_categories')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('sort_order')

  if (error) throw error
  return data
}

export async function addCategory(workspaceId: string, name: string, color: string): Promise<GanttCategory> {
  const { data: existing } = await supabase
    .from('gantt_categories')
    .select('sort_order')
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data, error } = await supabase
    .from('gantt_categories')
    .insert({ workspace_id: workspaceId, name, color, sort_order })
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

export async function getProjects(workspaceId: string): Promise<GanttProject[]> {
  const { data, error } = await supabase
    .from('gantt_projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('sort_order')

  if (error) throw error
  return data
}

export async function addProject(
  workspaceId: string,
  categoryId: string,
  parentId: string | null,
  fields: { name: string; status: string; start_month: string | null; end_month: string | null; team?: string | null; pm?: string | null }
): Promise<GanttProject> {
  const { data: existing } = await supabase
    .from('gantt_projects')
    .select('sort_order')
    .eq('workspace_id', workspaceId)
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sort_order = existing ? existing.sort_order + 1 : 0

  const { data, error } = await supabase
    .from('gantt_projects')
    .insert({
      workspace_id: workspaceId,
      category_id: categoryId,
      parent_id: parentId,
      sort_order,
      ...fields,
    })
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

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('gantt_projects').delete().eq('id', id)
  if (error) throw error
}
