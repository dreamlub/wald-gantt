'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import type { CalEvent } from '@/types'
import { GoogleIcon } from './event-block'
import { SNAP_MIN, HOUR_H, START_H, END_H } from '../_constants'
import { snapToGrid, clamp, pxToMinutes } from '../_utils'
import { setActiveDragOffsetY } from './drag-state'

interface BlockProps {
  event: CalEvent
  top: number
  height: number
  colIndex?: number
  totalCols?: number
  onResize: (id: string, durationMinutes: number) => void
  onDelete: (id: string) => void
  onEditTitle: (id: string, title: string) => void
}

/** 캘린더 전용 이벤트 블록 (구글 이벤트와 동일한 ink 스타일, 이동·리사이즈·제목수정·삭제) */
export function CalEventBlock({ event, top, height, colIndex = 0, totalCols = 1, onResize, onDelete, onEditTitle }: BlockProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(event.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const blockRef = useRef<HTMLDivElement>(null)
  const clickStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const leftPct  = (colIndex / totalCols) * 100
  const widthPct = (1 / totalCols) * 100

  const commit = () => {
    setEditing(false)
    const t = val.trim()
    if (t && t !== event.title) onEditTitle(event.id, t)
    else setVal(event.title)
  }

  /* ── 이동 드래그 ── */
  const handleDragStart = (e: React.DragEvent) => {
    if (!blockRef.current) return
    const offset = e.clientY - blockRef.current.getBoundingClientRect().top
    setActiveDragOffsetY(offset)
    e.dataTransfer.setData('calEventId', event.id)
    e.dataTransfer.setData('offsetY', String(offset))
    e.dataTransfer.setData('source', 'cal-event')
    e.dataTransfer.effectAllowed = 'move'
  }

  /* ── 클릭 vs 드래그 구분 → 클릭이면 제목 편집 ── */
  const handleMouseDown = (e: React.MouseEvent) => { clickStart.current = { x: e.clientX, y: e.clientY } }
  const handleMouseUp = (e: React.MouseEvent) => {
    if (!clickStart.current) return
    const dx = Math.abs(e.clientX - clickStart.current.x)
    const dy = Math.abs(e.clientY - clickStart.current.y)
    if (dx < 4 && dy < 4 && !editing) setEditing(true)
    clickStart.current = null
  }

  /* ── 하단 핸들 리사이즈 ── */
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startHeight = height
    let moved = false

    const onMove = (me: MouseEvent) => {
      moved = true
      const newPx = Math.max(startHeight + (me.clientY - startY), HOUR_H / 4)
      const snapped = clamp(snapToGrid(pxToMinutes(newPx)), SNAP_MIN, (END_H - START_H) * 60)
      if (blockRef.current) blockRef.current.style.height = `${(snapped / 60) * HOUR_H}px`
    }
    const onUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!moved) return
      const newPx = Math.max(startHeight + (me.clientY - startY), HOUR_H / 4)
      const snapped = clamp(snapToGrid(pxToMinutes(newPx)), SNAP_MIN, (END_H - START_H) * 60)
      onResize(event.id, snapped)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={blockRef}
      draggable={!editing}
      onDragStart={handleDragStart}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      className="absolute rounded px-1.5 py-0.5 overflow-hidden group z-10 cursor-grab active:cursor-grabbing"
      style={{
        top,
        height: height - 2,
        left:  `calc(${leftPct}% + ${colIndex > 0 ? 1 : 0}px)`,
        width: `calc(${widthPct}% - ${colIndex === totalCols - 1 ? 4 : 2}px)`,
        backgroundColor: 'var(--color-ink-100)',
        borderLeft: '3px solid var(--color-ink-300)',
      }}
    >
      <div className="flex items-center gap-1 leading-tight pr-4">
        <GoogleIcon />
        {editing ? (
          <input
            ref={inputRef}
            value={val}
            autoFocus
            onChange={e => setVal(e.target.value)}
            onMouseDown={e => e.stopPropagation()}
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
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete(event.id) }}
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
      >
        <X size={10} />
      </button>

      {/* 리사이즈 핸들 */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
      />
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
  // Enter 제출 → 인풋 언마운트 → blur 재발화로 onSubmit이 두 번 호출되는 중복 생성 방지
  const doneRef = useRef(false)
  const submit = (v: string) => {
    if (doneRef.current) return
    doneRef.current = true
    onSubmit(v)
  }
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
          if (e.key === 'Enter') submit(val)
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => (val.trim() ? submit(val) : onCancel())}
        className="w-full text-2xs font-medium rounded px-1.5 py-1 outline-none ring-2 ring-lilac-400 bg-card text-foreground shadow-sm"
      />
    </div>
  )
}
