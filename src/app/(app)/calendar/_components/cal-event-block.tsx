'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import type { CalEvent } from '@/types'
import { GoogleIcon } from './event-block'

interface BlockProps {
  event: CalEvent
  top: number
  height: number
  colIndex?: number
  totalCols?: number
  onDelete: (id: string) => void
  onEditTitle: (id: string, title: string) => void
}

/** 캘린더 전용 이벤트 블록 (할일·구글 이벤트와 구분되는 라일락 스타일) */
export function CalEventBlock({ event, top, height, colIndex = 0, totalCols = 1, onDelete, onEditTitle }: BlockProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(event.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const leftPct  = (colIndex / totalCols) * 100
  const widthPct = (1 / totalCols) * 100

  const commit = () => {
    setEditing(false)
    const t = val.trim()
    if (t && t !== event.title) onEditTitle(event.id, t)
    else setVal(event.title)
  }

  return (
    <div
      className="absolute rounded px-1.5 py-0.5 overflow-hidden group z-10"
      style={{
        top,
        height: height - 2,
        left:  `calc(${leftPct}% + ${colIndex > 0 ? 1 : 0}px)`,
        width: `calc(${widthPct}% - ${colIndex === totalCols - 1 ? 4 : 2}px)`,
        backgroundColor: 'var(--color-ink-100)',
        borderLeft: '3px solid var(--color-ink-300)',
      }}
      onClick={e => { e.stopPropagation(); if (!editing) setEditing(true) }}
    >
      <div className="flex items-center gap-1 leading-tight pr-4">
        <GoogleIcon />
        {editing ? (
          <input
            ref={inputRef}
            value={val}
            autoFocus
            onChange={e => setVal(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setVal(event.title); setEditing(false) }
            }}
            onBlur={commit}
            className="flex-1 min-w-0 text-2xs font-medium bg-white/80 rounded px-1 outline-none ring-1 ring-ink-300 text-foreground"
          />
        ) : (
          <p className="text-2xs font-medium text-foreground truncate flex-1">
            {event.title}
          </p>
        )}
      </div>

      <button
        onClick={e => { e.stopPropagation(); onDelete(event.id) }}
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
      >
        <X size={10} />
      </button>
    </div>
  )
}

interface CreateProps {
  top: number
  onSubmit: (title: string) => void
  onCancel: () => void
}

/** 빈 시간대 클릭 시 뜨는 제목 입력 (Enter 생성 / Esc·blur 취소) */
export function EventCreateInput({ top, onSubmit, onCancel }: CreateProps) {
  const [val, setVal] = useState('')
  return (
    <div
      className="absolute left-0 right-0 px-1 z-20"
      style={{ top }}
      onClick={e => e.stopPropagation()}
    >
      <input
        autoFocus
        value={val}
        placeholder="일정 제목…"
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSubmit(val)
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => (val.trim() ? onSubmit(val) : onCancel())}
        className="w-full text-2xs font-medium rounded px-1.5 py-1 outline-none ring-2 ring-lilac-400 bg-card text-foreground shadow-sm"
      />
    </div>
  )
}
