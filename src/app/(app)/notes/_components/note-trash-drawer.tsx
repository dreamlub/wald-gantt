'use client'

import { Trash2, X } from 'lucide-react'
import { Drawer, DrawerHeader, DrawerBody } from '@/components/ui/drawer'
import { NoteTrashCard } from './note-trash-card'
import type { Note } from '@/types'

interface Props {
  open:                boolean
  trashNotes:          Note[]
  onClose:             () => void
  onRestore:           (id: string) => void
  onPermanentDelete:   (id: string) => void
  onEmptyTrash:        () => void
}

export function NoteTrashDrawer({
  open, trashNotes, onClose,
  onRestore, onPermanentDelete, onEmptyTrash,
}: Props) {
  return (
    <Drawer open={open} onClose={onClose} width={440}>
      <DrawerHeader>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Trash2 size={15} className="text-ink-400 shrink-0" />
          <span className="font-semibold text-sm truncate">휴지통</span>
          {trashNotes.length > 0 && (
            <span className="text-xs text-ink-400 tabular-nums">{trashNotes.length}개</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {trashNotes.length > 0 && (
            <button
              onClick={onEmptyTrash}
              className="text-xs px-2.5 py-1.5 rounded-lg text-status-late hover:bg-status-late/10 transition-colors"
            >
              모두 삭제
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </DrawerHeader>

      <DrawerBody className="p-4">
        {trashNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
            <span className="text-4xl">🗑️</span>
            <p className="text-sm font-medium text-muted-foreground">휴지통이 비어있습니다</p>
            <p className="text-xs text-ink-300">삭제한 메모는 여기에 보관됩니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {trashNotes.map(note => (
              <NoteTrashCard
                key={note.id}
                note={note}
                onRestore={id => { onRestore(id) }}
                onPermanentDelete={id => { onPermanentDelete(id) }}
              />
            ))}
          </div>
        )}
      </DrawerBody>
    </Drawer>
  )
}
