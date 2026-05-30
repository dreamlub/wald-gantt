'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { toast } from 'sonner'
import type { Note, NoteColor } from '@/types'
import {
  getNotes, createNote, updateNote,
  softDeleteNote, restoreNote, permanentDeleteNote, getTrashedNotes,
} from '@/lib/note-service'
import { NoteCard, NoteCardOverlay }  from './_components/note-card'
import { NoteCreateBar }              from './_components/note-create-bar'
import { NoteEditModal }              from './_components/note-edit-modal'
import { NoteTrashCard }              from './_components/note-trash-card'
import { NotesSidebar, type NoteQuickFilter } from './_components/notes-sidebar'

export default function NotesPage() {
  const [notes,        setNotes]        = useState<Note[]>([])
  const [trashNotes,   setTrashNotes]   = useState<Note[]>([])
  const [loading,      setLoading]      = useState(true)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [colorFilter,  setColorFilter]  = useState<Set<NoteColor>>(new Set())
  const [quickFilter,  setQuickFilter]  = useState<NoteQuickFilter>('all')
  const [trashOpen,    setTrashOpen]    = useState(false)
  const [activeId,     setActiveId]     = useState<string | null>(null)
  const pinReqRef = useRef(0)

  function toggleColorFilter(color: NoteColor) {
    setColorFilter(prev => {
      const next = new Set(prev)
      if (next.has(color)) next.delete(color)
      else next.add(color)
      return next
    })
  }

  const load = useCallback(async () => {
    try {
      const [active, trashed] = await Promise.all([getNotes(), getTrashedNotes()])
      setNotes(active)
      setTrashNotes(trashed)
    } catch { toast.error('메모를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void (async () => { await load() })() }, [load])

  async function handleCreate(params: { title: string; content: string; color: NoteColor }) {
    try {
      const minOrder = notes.filter(n => !n.pinned).reduce((m, n) => Math.min(m, n.sort_order), 0)
      const note = await createNote({ ...params, sort_order: minOrder - 10 })
      setNotes(prev => [note, ...prev])
    } catch { toast.error('메모 생성에 실패했습니다.') }
  }

  async function handleUpdate(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'links'>>) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n))
    try {
      await updateNote(id, patch)
      if ('pinned' in patch) {
        const seq = ++pinReqRef.current
        const fresh = await getNotes()
        if (seq === pinReqRef.current) setNotes(fresh)
      }
    } catch { toast.error('메모 수정에 실패했습니다.'); load() }
  }

  function handleDelete(id: string) {
    const deleted = notes.find(n => n.id === id)
    if (!deleted) return
    const now = new Date().toISOString()
    const deletedNote = { ...deleted, deleted_at: now, pinned: false }
    setNotes(prev => prev.filter(n => n.id !== id))
    setTrashNotes(prev => [deletedNote, ...prev])
    if (selectedId === id) setSelectedId(null)

    let undone = false
    const timer = setTimeout(async () => {
      if (undone) return
      try { await softDeleteNote(id) } catch { toast.error('삭제 실패'); load() }
    }, 5000)

    toast('메모를 휴지통에 이동했습니다.', {
      duration: 5000,
      action: {
        label: '실행취소',
        onClick: () => {
          undone = true
          clearTimeout(timer)
          setTrashNotes(prev => prev.filter(n => n.id !== id))
          setNotes(prev => [...prev, deleted].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          }))
        },
      },
    })
  }

  async function handleRestore(id: string) {
    const note = trashNotes.find(n => n.id === id)
    if (!note) return
    setTrashNotes(prev => prev.filter(n => n.id !== id))
    setNotes(prev => [{ ...note, deleted_at: null, pinned: false }, ...prev])
    try { await restoreNote(id) }
    catch { toast.error('복원에 실패했습니다.'); load() }
    toast.success('메모를 복원했습니다.')
  }

  async function handlePermanentDelete(id: string) {
    setTrashNotes(prev => prev.filter(n => n.id !== id))
    try { await permanentDeleteNote(id) }
    catch { toast.error('영구삭제에 실패했습니다.'); load() }
    toast('메모를 영구삭제했습니다.')
  }

  async function handleEmptyTrash() {
    const ids = trashNotes.map(n => n.id)
    setTrashNotes([])
    try { await Promise.all(ids.map(permanentDeleteNote)) }
    catch { toast.error('일부 메모 삭제에 실패했습니다.'); load() }
    toast('휴지통을 비웠습니다.')
  }

  // ── 드래그 정렬 ───────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    if (searchQuery || colorFilter.size > 0 || quickFilter !== 'all') return

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
  const q = searchQuery.toLowerCase()
  const filtered = notes
    .filter(n => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    .filter(n => colorFilter.size === 0 || colorFilter.has(n.color))
    .filter(n => quickFilter === 'pinned' ? n.pinned : true)

  const pinnedNotes  = filtered.filter(n =>  n.pinned)
  const regularNotes = filtered.filter(n => !n.pinned)
  const selectedNote = selectedId ? notes.find(n => n.id === selectedId) ?? null : null
  const activeNote   = activeId   ? notes.find(n => n.id === activeId)   ?? null : null

  const isTrash = quickFilter === 'trash'

  const sharedProps = {
    onUpdate: handleUpdate, onDelete: handleDelete, onOpen: setSelectedId, highlight: q,
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 사이드바 */}
      <NotesSidebar
        quickFilter={quickFilter}
        onQuickFilterChange={filter => {
          setQuickFilter(filter)
          setSearchQuery('')
          setColorFilter(new Set())
        }}
        totalCount={notes.length}
        pinnedCount={notes.filter(n => n.pinned).length}
        colorFilter={colorFilter}
        onColorFilterChange={toggleColorFilter}
        onColorFilterClear={() => setColorFilter(new Set())}
        trashCount={trashNotes.length}
        onTrashOpen={() => setTrashOpen(true)}
      />

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* 상단 바 */}
        <div className="h-12 border-b bg-card flex items-center px-4 gap-2 shrink-0">
          <span className="text-sm font-semibold text-foreground">
            {loading ? '' : colorFilter.size > 0 || quickFilter !== 'all'
              ? `${filtered.length}/${notes.length}개`
              : `${notes.length}개`
            }
          </span>

          <div className="flex items-center gap-1">
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
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* ── 휴지통 뷰 ───────────────────────────────── */}
          {isTrash ? (
            loading ? (
              <div className="flex items-center justify-center py-20 text-sm text-ink-300">로딩 중...</div>
            ) : trashNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
                <span className="text-3xl">🗑️</span>
                <p className="text-sm font-medium text-muted-foreground">휴지통이 비어있습니다</p>
              </div>
            ) : (
              <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
                {trashNotes.map(note => (
                  <NoteTrashCard
                    key={note.id}
                    note={note}
                    onRestore={handleRestore}
                    onPermanentDelete={handlePermanentDelete}
                  />
                ))}
              </div>
            )
          ) : (
            /* ── 일반 메모 뷰 ──────────────────────────── */
            <>
              {!searchQuery && quickFilter !== 'pinned' && (
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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveId(null)}
                >
                  {pinnedNotes.length > 0 && (
                    <section className="mb-6">
                      <NoteCollection notes={pinnedNotes} {...sharedProps} />
                    </section>
                  )}
                  {regularNotes.length > 0 && (
                    <section>
                      {pinnedNotes.length > 0 && quickFilter !== 'pinned' && (
                        <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider block mb-3">기타</span>
                      )}
                      <NoteCollection notes={regularNotes} {...sharedProps} />
                    </section>
                  )}
                  <DragOverlay>
                    {activeNote && <NoteCardOverlay note={activeNote} />}
                  </DragOverlay>
                </DndContext>
              )}
            </>
          )}
        </div>
      </div>

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
  notes:    Note[]
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'links'>>) => void
  onDelete: (id: string) => void
  onOpen:   (id: string) => void
  highlight: string
}

function NoteCollection({ notes, onUpdate, onDelete, onOpen, highlight }: CollectionProps) {
  return (
    <SortableContext items={notes.map(n => n.id)} strategy={rectSortingStrategy}>
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
        {notes.map(note => (
          <NoteCard
            key={note.id} note={note}
            onUpdate={onUpdate} onDelete={onDelete} onOpen={onOpen}
            highlight={highlight}
          />
        ))}
      </div>
    </SortableContext>
  )
}
