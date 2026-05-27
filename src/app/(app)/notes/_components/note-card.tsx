'use client'

import { useEffect, useRef, useState } from 'react'
import { Pin, PinOff, Trash2 } from 'lucide-react'
import type { Note, NoteColor } from '@/types'
import { NOTE_COLORS, ColorPicker } from './note-color-picker'

interface Props {
  note: Note
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => void
  onDelete: (id: string) => void
}

export function NoteCard({ note, onUpdate, onDelete }: Props) {
  const [editing,  setEditing]  = useState(false)
  const [title,    setTitle]    = useState(note.title)
  const [content,  setContent]  = useState(note.content)
  const containerRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 저장
  useEffect(() => {
    if (!editing) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) commit()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, title, content])

  // note prop 변경 반영 (다른 곳에서 업데이트됐을 때)
  useEffect(() => {
    if (!editing) { setTitle(note.title); setContent(note.content) }
  }, [note.title, note.content, editing])

  function commit() {
    setEditing(false)
    const t = title.trim()
    const c = content.trim()
    if (t !== note.title || c !== note.content) {
      onUpdate(note.id, { title: t, content: c })
    }
  }

  const bg = NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.default.bg

  return (
    <div
      ref={containerRef}
      onClick={() => { if (!editing) setEditing(true) }}
      className={`group relative rounded-2xl border border-border/60 p-4 cursor-text transition-shadow hover:shadow-md ${bg}`}
    >
      {/* 제목 */}
      {(editing || title) && (
        <textarea
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') commit() }}
          onClick={e => e.stopPropagation()}
          rows={1}
          placeholder="제목"
          className="w-full resize-none bg-transparent text-sm font-semibold text-foreground placeholder:text-ink-300 outline-none mb-1.5 leading-snug overflow-hidden"
          style={{ height: 'auto' }}
          onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
        />
      )}

      {/* 본문 */}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') commit() }}
        onClick={e => e.stopPropagation()}
        placeholder="메모 작성..."
        className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-ink-300 outline-none leading-relaxed min-h-[3rem]"
        style={{ height: 'auto' }}
        onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
      />

      {/* 하단 툴바 — 항상 표시 */}
      <div
        onClick={e => e.stopPropagation()}
        className={`flex items-center gap-1 mt-3 pt-2 border-t border-black/5 transition-opacity ${editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <ColorPicker
          value={note.color}
          onChange={color => onUpdate(note.id, { color })}
        />
        <div className="flex-1" />
        <button
          onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
          title={note.pinned ? '고정 해제' : '상단 고정'}
          className="p-1.5 rounded-full text-ink-400 hover:text-foreground hover:bg-black/5 transition-colors"
        >
          {note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button
          onClick={() => onDelete(note.id)}
          title="삭제"
          className="p-1.5 rounded-full text-ink-400 hover:text-status-late hover:bg-black/5 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
