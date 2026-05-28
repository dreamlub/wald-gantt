'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Check, Pin, PinOff, Trash2 } from 'lucide-react'
import type { Note } from '@/types'
import { NOTE_COLORS, ColorPicker } from './note-color-picker'

interface Props {
  note: Note
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function NoteEditModal({ note, onUpdate, onDelete, onClose }: Props) {
  const [title,   setTitle]   = useState(note.title)
  const [content, setContent] = useState(note.content)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [content])

  function commit() {
    const t = title.trim()
    const c = content.trim()
    if (t !== note.title || c !== note.content) {
      onUpdate(note.id, { title: t, content: c })
    }
    onClose()
  }

  const bg = NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.default.bg

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) commit() }}
    >
      <div
        onKeyDown={e => {
          if (e.key === 'Escape') commit()
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit()
        }}
        className={`w-full max-w-2xl flex flex-col rounded-2xl border border-border shadow-2xl overflow-hidden ${bg}`}
        style={{ maxHeight: '80vh' }}
      >
        {/* 제목 */}
        <div className="px-6 pt-6 pb-3 shrink-0">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full bg-transparent text-base font-semibold text-foreground placeholder:text-ink-300 outline-none"
          />
        </div>

        {/* 본문 — 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
          <textarea
            ref={contentRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="메모 작성..."
            className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-ink-300 outline-none leading-relaxed"
            style={{ minHeight: '12rem' }}
          />
        </div>

        {/* 툴바 */}
        <div className="shrink-0 flex items-center gap-1 px-5 py-3 border-t border-black/10">
          <ColorPicker value={note.color} onChange={color => onUpdate(note.id, { color })} />
          <div className="flex-1" />
          <button
            onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
            title={note.pinned ? '고정 해제' : '상단 고정'}
            className="p-1.5 rounded-full text-ink-400 hover:text-foreground hover:bg-black/5 transition-colors"
          >
            {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            onClick={() => { onDelete(note.id); onClose() }}
            title="삭제"
            className="p-1.5 rounded-full text-ink-400 hover:text-status-late hover:bg-black/5 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <div className="w-px h-4 bg-border/60 mx-1" />
          <button
            onClick={commit}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-foreground text-background hover:bg-ink-800 transition-colors"
          >
            <Check size={12} />
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
