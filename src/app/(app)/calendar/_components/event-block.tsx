'use client'

import type { CalendarEvent } from '@/types'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { fmtTime } from '../_utils'

interface Props {
  event: CalendarEvent
  top: number
  height: number
  colIndex?: number
  totalCols?: number
}

export function GoogleIcon({ size = 9 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export function EventBlock({ event, top, height, colIndex = 0, totalCols = 1 }: Props) {
  const leftPct  = (colIndex / totalCols) * 100
  const widthPct = (1 / totalCols) * 100

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="absolute rounded px-1.5 py-0.5 overflow-hidden select-none z-10"
            style={{
              top,
              height: height - 2,
              left: `calc(${leftPct}% + ${colIndex > 0 ? 1 : 0}px)`,
              width: `calc(${widthPct}% - ${colIndex === totalCols - 1 ? 4 : 2}px)`,
              backgroundColor: 'var(--color-ink-100)',
              borderLeft: '3px solid var(--color-ink-300)',
            }}
          />
        }
      >
        <div className="flex items-center gap-1 leading-tight">
          <GoogleIcon />
          <p className="text-[11px] font-medium text-foreground truncate flex-1">
            {event.title}
          </p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="font-medium">{event.title}</p>
        <p className="text-xs text-muted-foreground">{fmtTime(event.start)} – {fmtTime(event.end)}</p>
        {event.location && <p className="text-xs text-muted-foreground">{event.location}</p>}
        {event.description && <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>}
      </TooltipContent>
    </Tooltip>
  )
}
