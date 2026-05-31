'use client'

import { useRef } from 'react'
import { format } from 'date-fns'
import { ArrowUpRight, Pin, PinOff, Trash2, ClipboardList, CheckCheck } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Note } from '@/types'
import { NOTE_COLORS, ColorPicker } from './note-color-picker'
import { NoteMarkdown, parseCheckboxStats } from './note-markdown'

interface Props {
  note: Note
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'links' | 'status'>>) => void
  onDelete: (id: string) => void
  onOpen:   (id: string) => void
  onSendToReview?: (id: string) => void
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

// 드래그 오버레이 전용 — useSortable 없이 카드 외형만 렌더링
export function NoteCardOverlay({ note }: { note: Note }) {
  const bg     = NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.yellow.bg
  const date   = format(new Date(note.updated_at), 'M/d')
  const isLong = note.content.length > 300
  return (
    <div className={`rounded-2xl border border-border/60 p-4 shadow-2xl cursor-grabbing select-none ${bg}`}>
      {note.title && (
        <p className="text-sm font-semibold text-foreground mb-1.5 leading-snug">{note.title}</p>
      )}
      <div style={isLong ? {
        maxHeight: '10rem', overflow: 'hidden',
        maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
      } : undefined}>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words min-h-[2rem]">
          {note.content || <em className="text-ink-300 not-italic">빈 메모</em>}
        </p>
      </div>
      {(note.links?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1 mt-2 text-2xs text-lilac-500 dark:text-lilac-400">
          <ArrowUpRight size={10} />
          <span>{note.links.length}개 연결됨</span>
        </div>
      )}
      <div className="flex items-center gap-1 mt-3 pt-2 border-t border-black/5 dark:border-white/5">
        <span className="text-2xs text-ink-400 tabular-nums">{date}</span>
      </div>
    </div>
  )
}

export function NoteCard({ note, onUpdate, onDelete, onOpen, onSendToReview, highlight = '' }: Props) {
  const {
    attributes, listeners,
    setNodeRef, transform, transition,
    isDragging,
  } = useSortable({ id: note.id })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    // 드래그 중엔 완전 투명 — DragOverlay 클론이 대신 보임
    opacity: isDragging ? 0 : 1,
  }

  const bg        = NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.yellow.bg
  const date      = format(new Date(note.updated_at), 'M/d HH:mm')
  const isLong    = note.content.length > 300
  const checkboxes = note.content ? parseCheckboxStats(note.content) : null

  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseDown={e => { pointerStart.current = { x: e.clientX, y: e.clientY } }}
      onClick={e => {
        if (pointerStart.current) {
          const dx = e.clientX - pointerStart.current.x
          const dy = e.clientY - pointerStart.current.y
          if (Math.sqrt(dx * dx + dy * dy) > 5) return
        }
        onOpen(note.id)
      }}
      className={`group relative rounded-2xl border border-border/60 p-4 transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing select-none break-inside-avoid mb-4 ${bg}`}
    >
      {/* 고정 핀 */}
      {note.pinned && (
        <Pin
          size={13}
          className="absolute top-3 right-3 text-rose-500 fill-rose-500"
        />
      )}

      {note.title && (
        <p className="text-sm font-semibold text-foreground mb-1.5 leading-snug">
          <Highlight text={note.title} query={highlight} />
        </p>
      )}

      <div
        className="relative min-h-[2rem]"
        style={isLong ? {
          maxHeight: '10rem',
          overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
        } : undefined}
      >
        {note.content
          ? <NoteMarkdown content={note.content} />
          : <em className="text-sm text-ink-300 not-italic">빈 메모</em>
        }
      </div>

      {checkboxes && checkboxes.total > 0 && (
        <div className="flex items-center gap-1 mt-2 text-2xs text-ink-400">
          <span className="font-medium text-foreground">{checkboxes.checked}</span>
          <span>/ {checkboxes.total} 완료</span>
        </div>
      )}

      {(note.links?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1 mt-2 text-2xs text-lilac-500 dark:text-lilac-400">
          <ArrowUpRight size={10} />
          <span>{note.links.length}개 연결됨</span>
        </div>
      )}

      <div
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        className="mt-3 pt-2 border-t border-black/5 dark:border-white/5 space-y-1.5"
      >
        {/* 색상 팔레트 — 호버 시, 자동 개행 */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <ColorPicker value={note.color} onChange={color => onUpdate(note.id, { color })} />
        </div>

        {/* 핀·삭제·Review·처리됨(좌, 호버) + 일시(우, 상시) */}
        <div className="flex items-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
            <button
              onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
              title={note.pinned ? '고정 해제' : '상단 고정'}
              className="p-1 rounded-full text-ink-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              {note.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
            {onSendToReview && (
              <button
                onClick={() => onSendToReview(note.id)}
                title="Review로 보내기"
                className="p-1 rounded-full text-ink-400 hover:text-lilac-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <ClipboardList size={12} />
              </button>
            )}
            <button
              onClick={() => onUpdate(note.id, { status: 'archived' })}
              title="처리됨"
              className="p-1 rounded-full text-ink-400 hover:text-mint-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <CheckCheck size={12} />
            </button>
            <button
              onClick={() => onDelete(note.id)}
              title="삭제"
              className="p-1 rounded-full text-ink-400 hover:text-status-late hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="flex-1" />
          <span className="text-2xs text-ink-400 tabular-nums">{date}</span>
        </div>
      </div>
    </div>
  )
}
