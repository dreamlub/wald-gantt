'use client'

import { GripVertical, Pin, PinOff, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Note } from '@/types'
import { NOTE_COLORS } from './note-color-picker'

interface Props {
  note:      Note
  onUpdate:  (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => void
  onDelete:  (id: string) => void
  onOpen:    (id: string) => void
  highlight?: string
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/60 rounded-sm px-0.5 text-foreground not-italic">{p}</mark>
          : p
      )}
    </>
  )
}

export function NoteListItem({ note, onUpdate, onDelete, onOpen, highlight = '' }: Props) {
  const {
    attributes, listeners,
    setNodeRef, transform, transition,
    isDragging,
  } = useSortable({ id: note.id })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.4 : 1,
  }

  const dot     = NOTE_COLORS[note.color]?.dot ?? NOTE_COLORS.default.dot
  const date    = format(new Date(note.updated_at), 'M/d')
  const preview = note.content.replace(/\n+/g, ' ').trim()

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen(note.id)}
      className="group flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/50 bg-card hover:bg-muted/40 cursor-pointer transition-colors"
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
        className="shrink-0 text-ink-300 hover:text-ink-500 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity touch-none"
      >
        <GripVertical size={14} />
      </button>

      {/* 색상 점 */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />

      {/* 제목 + 미리보기 */}
      <div className="flex-1 flex items-baseline gap-2 min-w-0">
        {note.title ? (
          <>
            <span className="text-sm font-semibold text-foreground shrink-0 max-w-[40%] truncate">
              <Highlight text={note.title} query={highlight} />
            </span>
            <span className="text-sm text-ink-400 truncate">
              {preview ? <Highlight text={preview} query={highlight} /> : '내용 없음'}
            </span>
          </>
        ) : (
          <span className="text-sm text-foreground truncate">
            {preview ? <Highlight text={preview} query={highlight} /> : <em className="text-ink-300 not-italic">빈 메모</em>}
          </span>
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
