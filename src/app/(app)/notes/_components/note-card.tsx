'use client'

import { format } from 'date-fns'
import { ArrowUpRight, Pin, PinOff, Trash2 } from 'lucide-react'
import type { Note } from '@/types'
import { NOTE_COLORS, ColorPicker } from './note-color-picker'

interface Props {
  note: Note
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'links'>>) => void
  onDelete: (id: string) => void
  onOpen:   (id: string) => void
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

export function NoteCard({ note, onUpdate, onDelete, onOpen, highlight = '' }: Props) {
  const bg     = NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.default.bg
  const date   = format(new Date(note.updated_at), 'M/d')
  const isLong = note.content.length > 300

  return (
    <div
      onClick={() => onOpen(note.id)}
      className={`group relative rounded-2xl border border-border/60 p-4 transition-shadow hover:shadow-md cursor-pointer select-none ${bg}`}
    >
      {/* 제목 */}
      {note.title && (
        <p className="text-sm font-semibold text-foreground mb-1.5 leading-snug">
          <Highlight text={note.title} query={highlight} />
        </p>
      )}

      {/* 본문 — 길면 mask-image 페이드 (배경색 독립적) */}
      <div
        className="relative"
        style={isLong ? {
          maxHeight: '10rem',
          overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
        } : undefined}
      >
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words min-h-[2rem]">
          {note.content
            ? <Highlight text={note.content} query={highlight} />
            : <em className="text-ink-300 not-italic">빈 메모</em>
          }
        </p>
      </div>

      {/* 연결 배지 */}
      {(note.links?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1 mt-2 text-2xs text-lilac-500 dark:text-lilac-400">
          <ArrowUpRight size={10} />
          <span>{note.links.length}개 연결됨</span>
        </div>
      )}

      {/* 하단 툴바: 색상·액션은 hover, 날짜는 항상 표시 */}
      <div
        onClick={e => e.stopPropagation()}
        className="flex items-center gap-1 mt-3 pt-2 border-t border-black/5 dark:border-white/5"
      >
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <ColorPicker value={note.color} onChange={color => onUpdate(note.id, { color })} />
        </div>
        <span className="text-2xs text-ink-400 ml-1.5 tabular-nums">{date}</span>
        <div className="flex-1" />
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          <button
            onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
            title={note.pinned ? '고정 해제' : '상단 고정'}
            className="p-1.5 rounded-full text-ink-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button
            onClick={() => onDelete(note.id)}
            title="삭제"
            className="p-1.5 rounded-full text-ink-400 hover:text-status-late hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
