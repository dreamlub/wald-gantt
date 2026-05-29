'use client'

import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { Pencil, X } from 'lucide-react'
import type { CalEvent } from '@/types'
import { GoogleIcon } from './event-block'
import { BlockTooltip } from './block-tooltip'
import { SNAP_MIN, HOUR_H, START_H, END_H } from '../_constants'
import { snapToGrid, clamp, pxToMinutes, fmtTime } from '../_utils'
import { setActiveDragOffsetY } from './drag-state'

interface BlockProps {
  event: CalEvent
  top: number
  height: number
  colIndex?: number
  totalCols?: number
  onResize: (id: string, durationMinutes: number) => void
  onDelete: (id: string) => void
  onOpenEditor: (event: CalEvent) => void
}

/** 캘린더 전용 이벤트 블록 (구글 이벤트와 동일한 ink 스타일, 이동·리사이즈·편집드로어·삭제) */
export function CalEventBlock({ event, top, height, colIndex = 0, totalCols = 1, onResize, onDelete, onOpenEditor }: BlockProps) {
  const blockRef = useRef<HTMLDivElement>(null)
  const clickStart = useRef<{ x: number; y: number } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = blockRef.current
    if (!el) return
    const enter = () => {
      const rect = el.getBoundingClientRect()
      setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
    }
    const leave = () => setTooltipPos(null)
    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)
    return () => { el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave) }
  }, [])

  const leftPct  = (colIndex / totalCols) * 100
  const widthPct = (1 / totalCols) * 100

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

  /* ── 클릭 vs 드래그 구분 → 클릭이면 편집 드로어 열기 ── */
  const handleMouseDown = (e: React.MouseEvent) => { clickStart.current = { x: e.clientX, y: e.clientY } }
  const handleMouseUp = (e: React.MouseEvent) => {
    if (!clickStart.current) return
    const dx = Math.abs(e.clientX - clickStart.current.x)
    const dy = Math.abs(e.clientY - clickStart.current.y)
    if (dx < 4 && dy < 4) onOpenEditor(event)
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

  const endIso = new Date(new Date(event.scheduled_at).getTime() + event.duration_minutes * 60_000).toISOString()

  const blockStyle: CSSProperties = {
    top,
    height: height - 2,
    backgroundColor: 'var(--color-ink-100)',
    borderLeft: '3px solid var(--color-ink-300)',
    left:  `calc(${leftPct}% + ${colIndex > 0 ? 1 : 0}px)`,
    width: `calc(${widthPct}% - ${colIndex === totalCols - 1 ? 4 : 2}px)`,
  }

  return (
    <>
      <div
        ref={blockRef}
        draggable
        onDragStart={handleDragStart}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        className="absolute rounded px-1.5 py-0.5 overflow-hidden group z-10 cursor-grab active:cursor-grabbing"
        style={blockStyle}
      >
        <div className="flex items-center gap-1 leading-tight pr-9">
          <GoogleIcon />
          <p className="text-2xs font-medium text-foreground truncate flex-1">
            {event.title}
          </p>
        </div>

        {/* 편집 드로어 열기 */}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onOpenEditor(event) }}
          title="편집"
          className="absolute top-0.5 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
        >
          <Pencil size={10} />
        </button>

        {/* 삭제 */}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(event.id) }}
          title="삭제"
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

      {tooltipPos && (
        <BlockTooltip x={tooltipPos.x} y={tooltipPos.y}>
          <p className="font-medium">{event.title}</p>
          <p className="opacity-70">{fmtTime(event.scheduled_at)} – {fmtTime(endIso)}</p>
        </BlockTooltip>
      )}
    </>
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
