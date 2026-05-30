import { createClient } from '@/lib/supabase/client'
import type { Note, NoteColor, NoteLink } from '@/types'

const db = () => createClient()

export async function getNotes(): Promise<Note[]> {
  const { data, error } = await db()
    .from('notes')
    .select('*')
    .is('deleted_at', null)
    .order('pinned', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getTrashedNotes(): Promise<Note[]> {
  const { data, error } = await db()
    .from('notes')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createNote(params: {
  title?: string
  content?: string
  color?: NoteColor
  pinned?: boolean
  sort_order?: number
}): Promise<Note> {
  const { data: { user } } = await db().auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')
  const { data, error } = await db()
    .from('notes')
    .insert({
      user_id:    user.id,
      title:      params.title      ?? '',
      content:    params.content    ?? '',
      color:      params.color      ?? 'yellow',
      pinned:     params.pinned     ?? false,
      sort_order: params.sort_order ?? 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'sort_order' | 'links'>>): Promise<void> {
  const { error } = await db()
    .from('notes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** 소프트 삭제: deleted_at 설정 */
export async function softDeleteNote(id: string): Promise<void> {
  const { error } = await db()
    .from('notes')
    .update({ deleted_at: new Date().toISOString(), pinned: false })
    .eq('id', id)
  if (error) throw error
}

/** 휴지통에서 복원: deleted_at 제거 */
export async function restoreNote(id: string): Promise<void> {
  const { error } = await db()
    .from('notes')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw error
}

/** 영구 삭제 */
export async function permanentDeleteNote(id: string): Promise<void> {
  const { error } = await db().from('notes').delete().eq('id', id)
  if (error) throw error
}

/** 휴지통 전체 비우기 */
export async function emptyTrashNotes(): Promise<void> {
  const { error } = await db()
    .from('notes')
    .delete()
    .not('deleted_at', 'is', null)
  if (error) throw error
}

/** 하위 호환용 — 즉시 영구 삭제 */
export { permanentDeleteNote as deleteNote }

/**
 * 태스크가 삭제될 때 연결된 모든 메모에서 해당 링크를 제거합니다.
 */
export async function removeTaskLinkFromNotes(taskId: string): Promise<void> {
  try {
    const { data: notes } = await db()
      .from('notes')
      .select('id, links')
      .filter('links', 'cs', JSON.stringify([{ id: taskId }]))

    if (!notes?.length) return

    await Promise.all(
      notes.map(note => {
        const filtered = (note.links as NoteLink[]).filter(l => l.id !== taskId)
        return db().from('notes').update({ links: filtered }).eq('id', note.id)
      })
    )
  } catch {
    // 태스크 삭제는 이미 완료됐으므로 링크 정리 실패는 무시
  }
}
