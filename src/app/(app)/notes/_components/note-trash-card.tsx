'use client'

import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { Note } from '@/types'
import { NOTE_COLORS } from './note-color-picker'
import { NoteMarkdown } from './note-markdown'

interface Props {
  note:            Note
  onRestore:       (id: string) => void
  onPermanentDelete: (id: string) => void
}

export function NoteTrashCard({ note, onRestore, onPermanentDelete }: Props) {
  const bg      = NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.yellow.bg
  const deleted = note.deleted_at ? format(new Date(note.deleted_at), 'M월 d일 삭제', { locale: ko }) : ''
  const isLong  = note.content.length > 200

  return (
    <div className={`group relative rounded-2xl border border-border/60 p-4 opacity-75 break-inside-avoid mb-4 ${bg}`}>
      {/* 삭제일 */}
      <p className="text-2xs text-ink-400 mb-2">{deleted}</p>

      {/* 제목 */}
      {note.title && (
        <p className="text-sm font-semibold text-foreground mb-1.5 leading-snug line-clamp-2">
          {note.title}
        </p>
      )}

      {/* 본문 */}
      <div
        className="relative min-h-[1.5rem]"
        style={isLong ? {
          maxHeight: '8rem',
          overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
        } : undefined}
      >
        {note.content
          ? <NoteMarkdown content={note.content} />
          : <em className="text-sm text-ink-300 not-italic">빈 메모</em>
        }
      </div>

      {/* 하단 액션 */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-black/5 dark:border-white/5">
        <button
          onClick={() => onRestore(note.id)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-foreground transition-colors"
        >
          <RotateCcw size={11} />
          복원
        </button>
        <button
          onClick={() => onPermanentDelete(note.id)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-status-late hover:bg-status-late/10 transition-colors ml-auto"
        >
          <Trash2 size={11} />
          영구삭제
        </button>
      </div>
    </div>
  )
}
