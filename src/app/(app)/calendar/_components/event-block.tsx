'use client'

import type { CalendarEvent } from '@/types'

interface Props {
  event: CalendarEvent
  top: number
  height: number
  colIndex?: number
  totalCols?: number
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function EventBlock({ event, top, height, colIndex = 0, totalCols = 1 }: Props) {
  const leftPct  = (colIndex / totalCols) * 100
  const widthPct = (1 / totalCols) * 100

  return (
    <div
      className="absolute rounded px-2 py-1 overflow-hidden select-none z-10"
      style={{
        top,
        height,
        left: `calc(${leftPct}% + ${colIndex > 0 ? 1 : 0}px)`,
        width: `calc(${widthPct}% - ${colIndex === totalCols - 1 ? 4 : 2}px)`,
        backgroundColor: event.color ? `${event.color}33` : 'var(--color-ink-100)',
        borderLeft: `3px solid ${event.color ?? 'var(--color-ink-400)'}`,
      }}
      title={event.location ? `${event.title}\n${event.location}` : event.title}
    >
      <p className="text-[11px] font-medium text-foreground truncate leading-tight">
        {event.title}
      </p>
      {height >= 36 && (
        <p className="text-[10px] text-muted-foreground">
          {fmtTime(event.start)} – {fmtTime(event.end)}
        </p>
      )}
    </div>
  )
}
