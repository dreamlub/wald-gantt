'use client'

import { format } from 'date-fns'
import { TrashDrawer } from '@/components/ui/trash-drawer'
import { NOTE_COLORS } from './note-color-picker'
import { getTrashedNotes, restoreNote, permanentDeleteNote, emptyTrashNotes } from '@/lib/note-service'
import type { Note } from '@/types'

interface Props {
  open:    boolean
  onClose: () => void
  onRestore: (note: Note) => void
}

export function NoteTrashDrawer({ open, onClose, onRestore }: Props) {
  return (
    <TrashDrawer<Note>
      open={open}
      onClose={onClose}
      fetchDeleted={getTrashedNotes}
      restoreItem={restoreNote}
      permanentDeleteItem={permanentDeleteNote}
      emptyAll={emptyTrashNotes}
      onRestore={onRestore}
      getItemName={n => n.title || '(제목 없음)'}
      label="메모"
      renderItem={note => {
        const dot = NOTE_COLORS[note.color]?.dot ?? NOTE_COLORS.yellow.dot
        const deletedAt = note.deleted_at
          ? format(new Date(note.deleted_at), 'yyyy.MM.dd')
          : ''
        return (
          <>
            <div className="text-sm font-medium text-foreground truncate">
              {note.title || <em className="text-ink-300 not-italic text-sm">제목 없음</em>}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${dot}`} />
              {note.content && (
                <span className="text-sm text-muted-foreground truncate max-w-[160px]">
                  {note.content.replace(/\n+/g, ' ').slice(0, 40)}
                </span>
              )}
              <span className="text-sm text-ink-300 shrink-0">{deletedAt}</span>
            </div>
          </>
        )
      }}
    />
  )
}
