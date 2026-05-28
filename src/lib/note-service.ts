import { createClient } from '@/lib/supabase/client'
import type { Note, NoteColor, NoteLink } from '@/types'

const db = () => createClient()

export async function getNotes(): Promise<Note[]> {
  const { data, error } = await db()
    .from('notes')
    .select('*')
    .order('pinned', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
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
      color:      params.color      ?? 'default',
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

export async function deleteNote(id: string): Promise<void> {
  const { error } = await db().from('notes').delete().eq('id', id)
  if (error) throw error
}

/**
 * 태스크가 삭제될 때 연결된 모든 메모에서 해당 링크를 제거합니다.
 * 태스크 삭제 성공 여부에는 영향을 주지 않으므로 에러는 조용히 처리합니다.
 */
export async function removeTaskLinkFromNotes(taskId: string): Promise<void> {
  try {
    // links JSONB 배열 안에 해당 taskId를 가진 객체가 있는 notes 조회
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
