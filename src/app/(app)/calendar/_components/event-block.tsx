'use client'

import type { CalendarEvent } from '@/types'

interface Props {
  event: CalendarEvent
  top: number
  height: number
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function EventBlock({ event, top, height }: Props) {
  return (
    <div
      className="absolute left-14 right-2 rounded px-2 py-1 overflow-hidden select-none z-10"
      style={{
        top,
        height,
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
