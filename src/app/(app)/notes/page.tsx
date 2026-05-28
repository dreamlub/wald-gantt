'use client'

import { useEffect, useState, useCallback } from 'react'
import { Pin } from 'lucide-react'
import { toast } from 'sonner'
import type { Note, NoteColor } from '@/types'
import { getNotes, createNote, updateNote, deleteNote } from '@/lib/note-service'
import { NoteCard } from './_components/note-card'
import { NoteCreateBar } from './_components/note-create-bar'

export default function NotesPage() {
  const [notes,   setNotes]   = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setNotes(await getNotes())
    } catch {
      toast.error('메모를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void (async () => { await load() })() }, [load])

  async function handleCreate(params: { title: string; content: string; color: NoteColor }) {
    try {
      const note = await createNote(params)
      setNotes(prev => [note, ...prev])
    } catch {
      toast.error('메모 생성에 실패했습니다.')
    }
  }

  async function handleUpdate(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n))
    try {
      await updateNote(id, patch)
      // pinned 변경 시 서버 순서 반영
      if ('pinned' in patch) setNotes(await getNotes())
    } catch {
      toast.error('메모 수정에 실패했습니다.')
      load()
    }
  }

  async function handleDelete(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id))
    try {
      await deleteNote(id)
    } catch {
      toast.error('삭제에 실패했습니다.')
      load()
    }
  }

  const pinned  = notes.filter(n => n.pinned)
  const regular = notes.filter(n => !n.pinned)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* 상단 바 */}
      <div className="h-12 border-b bg-card flex items-center px-5 shrink-0">
        <span className="text-sm font-semibold text-foreground">메모장</span>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* 빠른 입력 */}
        <div className="mb-8">
          <NoteCreateBar onCreate={handleCreate} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-ink-300">로딩 중...</div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
            <span className="text-3xl">📝</span>
            <p className="text-sm font-medium text-muted-foreground">메모가 없습니다</p>
            <p className="text-sm text-ink-300">위 입력란을 클릭해 첫 메모를 만들어 보세요</p>
          </div>
        ) : (
          <>
            {/* 고정 섹션 */}
            {pinned.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center gap-1.5 mb-3">
                  <Pin size={11} className="text-ink-400" />
                  <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider">고정됨</span>
                </div>
                <NoteGrid notes={pinned} onUpdate={handleUpdate} onDelete={handleDelete} />
              </section>
            )}

            {/* 일반 섹션 */}
            {regular.length > 0 && (
              <section>
                {pinned.length > 0 && (
                  <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider block mb-3">기타</span>
                )}
                <NoteGrid notes={regular} onUpdate={handleUpdate} onDelete={handleDelete} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function NoteGrid({ notes, onUpdate, onDelete }: {
  notes: Note[]
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
      {notes.map(note => (
        <div key={note.id} className="break-inside-avoid">
          <NoteCard note={note} onUpdate={onUpdate} onDelete={onDelete} />
        </div>
      ))}
    </div>
  )
}
