'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { NoteColor } from '@/types'
import { ColorPicker } from './note-color-picker'
import { NOTE_COLORS } from './note-color-picker'

interface Props {
  onCreate: (params: { title: string; content: string; color: NoteColor }) => void
}

export function NoteCreateBar({ onCreate }: Props) {
  const [open,    setOpen]    = useState(false)
  const [title,   setTitle]   = useState('')
  const [content, setContent] = useState('')
  const [color,   setColor]   = useState<NoteColor>('default')
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) commit()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, content, color])

  function commit() {
    const t = title.trim()
    const c = content.trim()
    if (t || c) onCreate({ title: t, content: c, color })
    setTitle('')
    setContent('')
    setColor('default')
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setTitle(''); setContent(''); setColor('default') }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit()
  }

  const bg = NOTE_COLORS[color].bg

  if (!open) {
    return (
      <div
        onClick={() => { setOpen(true); setTimeout(() => contentRef.current?.focus(), 50) }}
        className="w-full max-w-xl mx-auto flex items-center gap-3 px-4 py-3 rounded-2xl border border-border bg-card shadow-sm cursor-text hover:shadow-md transition-shadow"
      >
        <Plus size={16} className="text-ink-300 shrink-0" />
        <span className="text-sm text-ink-300 select-none">메모 작성...</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`w-full max-w-xl mx-auto rounded-2xl border border-border shadow-md p-4 ${bg}`}
    >
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="제목"
        className="w-full bg-transparent text-sm font-semibold text-foreground placeholder:text-ink-300 outline-none mb-2"
      />
      <textarea
        ref={contentRef}
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="메모 작성... (Ctrl+Enter 저장, Esc 취소)"
        rows={3}
        className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-ink-300 outline-none leading-relaxed"
      />
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-black/5">
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex-1" />
        <button
          onClick={() => { setOpen(false); setTitle(''); setContent(''); setColor('default') }}
          className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-black/5 transition-colors"
        >
          취소
        </button>
        <button
          onClick={commit}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-foreground text-background hover:bg-ink-800 transition-colors"
        >
          저장
        </button>
      </div>
    </div>
  )
}
