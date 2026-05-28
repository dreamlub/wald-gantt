'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pin, PinOff, Trash2 } from 'lucide-react'
import type { Note } from '@/types'
import { NOTE_COLORS, ColorPicker } from './note-color-picker'

interface Props {
  note: Note
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => void
  onDelete: (id: string) => void
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

export function NoteCard({ note, onUpdate, onDelete }: Props) {
  const [editing,  setEditing]  = useState(false)
  const [title,    setTitle]    = useState(note.title)
  const [content,  setContent]  = useState(note.content)
  const containerRef = useRef<HTMLDivElement>(null)
  const titleRef     = useRef<HTMLTextAreaElement>(null)
  const contentRef   = useRef<HTMLTextAreaElement>(null)

  // 텍스트 변경 시 높이 자동 조절
  useLayoutEffect(() => { autoResize(titleRef.current) },   [title])
  useLayoutEffect(() => { autoResize(contentRef.current) }, [content])

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

  function enterEdit() { setEditing(true) }

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
      className={`group relative rounded-2xl border border-border/60 p-4 transition-shadow hover:shadow-md ${bg}`}
    >
      {/* 제목 */}
      {(editing || title) && (
        <textarea
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={enterEdit}
          onKeyDown={e => { if (e.key === 'Escape') commit() }}
          rows={1}
          placeholder="제목"
          className="w-full resize-none bg-transparent text-sm font-semibold text-foreground placeholder:text-ink-300 outline-none mb-1.5 leading-snug overflow-hidden cursor-text"
        />
      )}

      {/* 본문 */}
      <textarea
        ref={contentRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        onFocus={enterEdit}
        onKeyDown={e => { if (e.key === 'Escape') commit() }}
        placeholder="메모 작성..."
        className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-ink-300 outline-none leading-relaxed min-h-[3rem] cursor-text"
      />

      {/* 제목 없는 카드에서 제목 입력 유도 — 본문만 있을 때 빈 위쪽 클릭 시 제목 포커스 */}
      {!title && !editing && (
        <div
          className="absolute inset-x-0 top-0 h-4 cursor-text"
          onClick={() => { enterEdit(); setTimeout(() => titleRef.current?.focus(), 10) }}
        />
      )}

      {/* 하단 툴바 */}
      <div
        onMouseDown={e => e.stopPropagation()} // 외부클릭 감지 차단 (저장 방지)
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
