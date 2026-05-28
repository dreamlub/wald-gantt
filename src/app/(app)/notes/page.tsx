'use client'

import { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, List, Pin, Search, X } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { toast } from 'sonner'
import type { Note, NoteColor } from '@/types'
import { getNotes, createNote, updateNote, deleteNote } from '@/lib/note-service'
import { NoteCard }       from './_components/note-card'
import { NoteCreateBar }  from './_components/note-create-bar'
import { NoteEditModal }  from './_components/note-edit-modal'
import { NoteListItem }   from './_components/note-list-item'

type ViewMode = 'grid' | 'list'

export default function NotesPage() {
  const [notes,       setNotes]       = useState<Note[]>([])
  const [loading,     setLoading]     = useState(true)
  const [viewMode,    setViewMode]    = useState<ViewMode>(() =>
    (typeof window !== 'undefined' ? localStorage.getItem('notes-view') as ViewMode : null) ?? 'grid'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [searchOpen,  setSearchOpen]  = useState(false)

  const load = useCallback(async () => {
    try { setNotes(await getNotes()) }
    catch { toast.error('메모를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  function changeView(v: ViewMode) {
    setViewMode(v)
    localStorage.setItem('notes-view', v)
  }

  async function handleCreate(params: { title: string; content: string; color: NoteColor }) {
    try {
      const maxOrder = notes.filter(n => !n.pinned).reduce((m, n) => Math.max(m, n.sort_order), -1)
      const note = await createNote({ ...params, sort_order: maxOrder + 10 })
      setNotes(prev => [note, ...prev])
    } catch { toast.error('메모 생성에 실패했습니다.') }
  }

  async function handleUpdate(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'links'>>) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n))
    try {
      await updateNote(id, patch)
      if ('pinned' in patch) setNotes(await getNotes())
    } catch { toast.error('메모 수정에 실패했습니다.'); load() }
  }

  function handleDelete(id: string) {
    const deleted = notes.find(n => n.id === id)
    if (!deleted) return
    setNotes(prev => prev.filter(n => n.id !== id))
    if (selectedId === id) setSelectedId(null)

    let undone = false
    const timer = setTimeout(async () => {
      if (undone) return
      try { await deleteNote(id) } catch { toast.error('삭제 실패'); load() }
    }, 5000)

    toast('메모를 삭제했습니다.', {
      duration: 5000,
      action: {
        label: '실행취소',
        onClick: () => {
          undone = true
          clearTimeout(timer)
          setNotes(prev => [...prev, deleted].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          }))
        },
      },
    })
  }

  // ── 드래그 정렬 (list 뷰에서만 활성) ─────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeNote = notes.find(n => n.id === active.id)
    const overNote   = notes.find(n => n.id === over.id)
    if (!activeNote || !overNote || activeNote.pinned !== overNote.pinned) return

    const section  = activeNote.pinned ? pinnedNotes : regularNotes
    const oldIndex = section.findIndex(n => n.id === active.id)
    const newIndex  = section.findIndex(n => n.id === over.id)
    const reordered = arrayMove(section, oldIndex, newIndex)

    setNotes(prev =>
      activeNote.pinned
        ? [...reordered, ...prev.filter(n => !n.pinned)]
        : [...prev.filter(n => n.pinned), ...reordered]
    )

    try {
      await Promise.all(reordered.map((n, i) => updateNote(n.id, { sort_order: i * 10 })))
    } catch { toast.error('순서 저장에 실패했습니다.'); load() }
  }

  // ── 필터 ─────────────────────────────────────────────────────
  const q        = searchQuery.toLowerCase()
  const filtered = q
    ? notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    : notes

  const pinnedNotes  = filtered.filter(n =>  n.pinned)
  const regularNotes = filtered.filter(n => !n.pinned)
  const selectedNote = selectedId ? notes.find(n => n.id === selectedId) ?? null : null

  const sharedProps = {
    viewMode, onUpdate: handleUpdate, onDelete: handleDelete, onOpen: setSelectedId, highlight: q,
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* 상단 바 */}
      <div className="h-12 border-b bg-card flex items-center px-4 gap-2 shrink-0">
        <span className="text-sm font-semibold text-foreground">메모장</span>
        <span className="text-xs text-ink-400 tabular-nums">
          {loading ? '' : `${notes.length}개`}
        </span>

        {/* 검색 */}
        <div className="flex items-center gap-1 ml-1">
          {searchOpen || searchQuery ? (
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2 text-ink-300 pointer-events-none" />
              <input
                autoFocus={searchOpen}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }}
                placeholder="검색"
                className="text-sm pl-6 pr-6 py-1 border rounded-lg w-44 outline-none focus:ring-1 focus:ring-lilac-300 text-foreground placeholder:text-ink-300 bg-background"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchOpen(false) }} className="absolute right-1.5 text-ink-300 hover:text-foreground">
                  <X size={11} />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="p-1.5 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
              title="검색"
            >
              <Search size={14} />
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* 뷰 토글 */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => changeView('grid')}
            title="그리드 뷰"
            className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-ink-400 hover:text-foreground hover:bg-muted/50'}`}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => changeView('list')}
            title="리스트 뷰"
            className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-muted text-foreground' : 'text-ink-400 hover:text-foreground hover:bg-muted/50'}`}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* 빠른 입력 */}
        {!searchQuery && (
          <div className="mb-8">
            <NoteCreateBar onCreate={handleCreate} />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-ink-300">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
            <span className="text-3xl">{searchQuery ? '🔍' : '📝'}</span>
            <p className="text-sm font-medium text-muted-foreground">
              {searchQuery ? `"${searchQuery}" 검색 결과 없음` : '메모가 없습니다'}
            </p>
            {!searchQuery && <p className="text-sm text-ink-300">위 입력란을 클릭해 첫 메모를 만들어 보세요</p>}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {pinnedNotes.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center gap-1.5 mb-3">
                  <Pin size={11} className="text-ink-400" />
                  <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider">고정됨</span>
                </div>
                <NoteCollection notes={pinnedNotes} {...sharedProps} />
              </section>
            )}
            {regularNotes.length > 0 && (
              <section>
                {pinnedNotes.length > 0 && (
                  <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider block mb-3">기타</span>
                )}
                <NoteCollection notes={regularNotes} {...sharedProps} />
              </section>
            )}
          </DndContext>
        )}
      </div>

      {/* 전체화면 편집 모달 */}
      {selectedNote && (
        <NoteEditModal
          note={selectedNote}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ── NoteCollection ────────────────────────────────────────────
interface CollectionProps {
  notes:     Note[]
  viewMode:  ViewMode
  onUpdate:  (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'links'>>) => void
  onDelete:  (id: string) => void
  onOpen:    (id: string) => void
  highlight: string
}

function NoteCollection({ notes, viewMode, onUpdate, onDelete, onOpen, highlight }: CollectionProps) {
  if (viewMode === 'list') {
    return (
      <SortableContext items={notes.map(n => n.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5">
          {notes.map(note => (
            <NoteListItem
              key={note.id} note={note}
              onUpdate={onUpdate} onDelete={onDelete} onOpen={onOpen}
              highlight={highlight}
            />
          ))}
        </div>
      </SortableContext>
    )
  }
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
      {notes.map(note => (
        <div key={note.id} className="break-inside-avoid">
          <NoteCard
            note={note}
            onUpdate={onUpdate} onDelete={onDelete} onOpen={onOpen}
            highlight={highlight}
          />
        </div>
      ))}
    </div>
  )
}
