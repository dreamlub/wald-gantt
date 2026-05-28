'use client'

import { Pin, PinOff, Trash2, Maximize2 } from 'lucide-react'
import { format } from 'date-fns'
import type { Note } from '@/types'
import { NOTE_COLORS } from './note-color-picker'

interface Props {
  note: Note
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => void
  onDelete: (id: string) => void
  onOpen: (id: string) => void
}

export function NoteListItem({ note, onUpdate, onDelete, onOpen }: Props) {
  const dot   = NOTE_COLORS[note.color]?.dot ?? NOTE_COLORS.default.dot
  const date  = format(new Date(note.updated_at), 'M/d')
  const preview = note.content.replace(/\n+/g, ' ').trim()

  return (
    <div
      onClick={() => onOpen(note.id)}
      className="group flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border/50 bg-card hover:bg-muted/40 cursor-pointer transition-colors"
    >
      {/* 색상 점 */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />

      {/* 제목 + 미리보기 */}
      <div className="flex-1 flex items-baseline gap-2 min-w-0">
        {note.title ? (
          <>
            <span className="text-sm font-semibold text-foreground shrink-0 max-w-[40%] truncate">{note.title}</span>
            <span className="text-sm text-ink-400 truncate">{preview || '내용 없음'}</span>
          </>
        ) : (
          <span className="text-sm text-foreground truncate">{preview || <em className="text-ink-300">빈 메모</em>}</span>
        )}
      </div>

      {/* 날짜 + 핀 */}
      <div className="shrink-0 flex items-center gap-1.5 text-2xs text-ink-400">
        {note.pinned && <Pin size={10} />}
        <span>{date}</span>
      </div>

      {/* 호버 액션 */}
      <div
        onClick={e => e.stopPropagation()}
        className="shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          onClick={() => onOpen(note.id)}
          title="전체화면 편집"
          className="p-1.5 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
        >
          <Maximize2 size={12} />
        </button>
        <button
          onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
          title={note.pinned ? '고정 해제' : '고정'}
          className="p-1.5 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
        >
          {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
        <button
          onClick={() => onDelete(note.id)}
          title="삭제"
          className="p-1.5 rounded text-ink-400 hover:text-status-late hover:bg-muted transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
