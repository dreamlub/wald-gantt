'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Maximize2, Pin, PinOff, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import type { Note } from '@/types'
import { NOTE_COLORS, ColorPicker } from './note-color-picker'

interface Props {
  note: Note
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned'>>) => void
  onDelete: (id: string) => void
  onOpen: (id: string) => void
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

export function NoteCard({ note, onUpdate, onDelete, onOpen }: Props) {
  const [editing,  setEditing]  = useState(false)
  const [title,    setTitle]    = useState(note.title)
  const [content,  setContent]  = useState(note.content)
  const containerRef = useRef<HTMLDivElement>(null)
  const titleRef     = useRef<HTMLTextAreaElement>(null)
  const contentRef   = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => { autoResize(titleRef.current) },   [title])
  useLayoutEffect(() => { autoResize(contentRef.current) }, [content, editing])

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

  // note prop 변경 반영
  useEffect(() => {
    if (!editing) { setTitle(note.title); setContent(note.content) }
  }, [note.title, note.content, editing])

  function commit() {
    setEditing(false)
    const t = title.trim()
    const c = content.trim()
    if (t !== note.title || c !== note.content) onUpdate(note.id, { title: t, content: c })
  }

  function handleExpand() {
    commit()
    // commit이 state를 업데이트하므로 setTimeout으로 모달 열기
    setTimeout(() => onOpen(note.id), 0)
  }

  const bg   = NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.default.bg
  const date = format(new Date(note.updated_at), 'M/d')
  // 내용이 길면 카드에서 페이드 처리
  const isLong = !editing && content.length > 200

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
          onFocus={() => setEditing(true)}
          onKeyDown={e => { if (e.key === 'Escape') commit() }}
          rows={1}
          placeholder="제목"
          className="w-full resize-none bg-transparent text-sm font-semibold text-foreground placeholder:text-ink-300 outline-none mb-1.5 leading-snug overflow-hidden cursor-text"
        />
      )}

      {/* 본문 — 비편집 시 최대 높이 제한 */}
      <div
        className="relative"
        style={!editing ? { maxHeight: '10rem', overflow: 'hidden' } : undefined}
      >
        <textarea
          ref={contentRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          onFocus={() => setEditing(true)}
          onKeyDown={e => { if (e.key === 'Escape') commit() }}
          placeholder="메모 작성..."
          className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-ink-300 outline-none leading-relaxed min-h-[3rem] cursor-text"
        />
        {/* 긴 내용 페이드 오버레이 */}
        {isLong && (
          <div
            className="absolute bottom-0 inset-x-0 h-10 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--color-background, white))' }}
          />
        )}
      </div>

      {/* 하단 툴바 */}
      <div
        onMouseDown={e => e.stopPropagation()}
        className={`flex items-center gap-1 mt-3 pt-2 border-t border-black/5 transition-opacity ${editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <ColorPicker value={note.color} onChange={color => onUpdate(note.id, { color })} />
        <span className="text-2xs text-ink-400 ml-1 tabular-nums">{date}</span>
        <div className="flex-1" />
        <button
          onClick={handleExpand}
          title="전체화면 편집"
          className="p-1.5 rounded-full text-ink-400 hover:text-foreground hover:bg-black/5 transition-colors"
        >
          <Maximize2 size={13} />
        </button>
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
