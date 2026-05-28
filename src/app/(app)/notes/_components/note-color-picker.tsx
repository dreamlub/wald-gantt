'use client'

import type { NoteColor } from '@/types'

export const NOTE_COLORS: Record<NoteColor, { bg: string; dot: string; label: string }> = {
  default: { bg: 'bg-card',                                         dot: 'bg-ink-200',                           label: '기본' },
  yellow:  { bg: 'bg-amber-50 dark:bg-amber-950/40',                dot: 'bg-amber-300 dark:bg-amber-400',       label: '노랑' },
  blue:    { bg: 'bg-sky-50 dark:bg-sky-950/40',                    dot: 'bg-sky-300 dark:bg-sky-400',           label: '파랑' },
  green:   { bg: 'bg-emerald-50 dark:bg-emerald-950/40',            dot: 'bg-emerald-300 dark:bg-emerald-400',   label: '초록' },
  pink:    { bg: 'bg-pink-50 dark:bg-pink-950/40',                  dot: 'bg-pink-300 dark:bg-pink-400',         label: '분홍' },
  purple:  { bg: 'bg-violet-50 dark:bg-violet-950/40',              dot: 'bg-violet-300 dark:bg-violet-400',     label: '보라' },
}

const COLORS = Object.entries(NOTE_COLORS) as [NoteColor, (typeof NOTE_COLORS)[NoteColor]][]

interface Props {
  value: NoteColor
  onChange: (color: NoteColor) => void
}

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1">
      {COLORS.map(([key, c]) => (
        <button
          key={key}
          title={c.label}
          onClick={() => onChange(key)}
          className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${c.dot} ${
            value === key ? 'border-foreground' : 'border-transparent'
          }`}
        />
      ))}
    </div>
  )
}
