import { createClient } from '@/lib/supabase/client'
import type { Note, NoteColor } from '@/types'

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
}): Promise<Note> {
  const { data: { user } } = await db().auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다')
  const { data, error } = await db()
    .from('notes')
    .insert({
      user_id: user.id,
      title:   params.title   ?? '',
      content: params.content ?? '',
      color:   params.color   ?? 'default',
      pinned:  params.pinned  ?? false,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'sort_order'>>): Promise<void> {
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
