'use client'

import type { NoteColor } from '@/types'

export const NOTE_COLORS: Record<NoteColor, { bg: string; dot: string; label: string }> = {
  yellow: { bg: 'bg-amber-50 dark:bg-amber-950/40',       dot: 'bg-amber-300 dark:bg-amber-400',     label: '노랑' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950/40',     dot: 'bg-orange-300 dark:bg-orange-400',   label: '주황' },
  red:    { bg: 'bg-rose-50 dark:bg-rose-950/40',         dot: 'bg-rose-300 dark:bg-rose-400',       label: '빨강' },
  pink:   { bg: 'bg-pink-50 dark:bg-pink-950/40',         dot: 'bg-pink-300 dark:bg-pink-400',       label: '분홍' },
  purple: { bg: 'bg-violet-50 dark:bg-violet-950/40',     dot: 'bg-violet-300 dark:bg-violet-400',   label: '보라' },
  blue:   { bg: 'bg-sky-50 dark:bg-sky-950/40',           dot: 'bg-sky-300 dark:bg-sky-400',         label: '파랑' },
  teal:   { bg: 'bg-teal-50 dark:bg-teal-950/40',         dot: 'bg-teal-300 dark:bg-teal-400',       label: '청록' },
  green:  { bg: 'bg-emerald-50 dark:bg-emerald-950/40',   dot: 'bg-emerald-300 dark:bg-emerald-400', label: '초록' },
  gray:   { bg: 'bg-zinc-100 dark:bg-zinc-800/60',        dot: 'bg-zinc-400 dark:bg-zinc-500',       label: '회색' },
}

const COLORS = Object.entries(NOTE_COLORS) as [NoteColor, (typeof NOTE_COLORS)[NoteColor]][]

interface Props {
  value: NoteColor
  onChange: (color: NoteColor) => void
}

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
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
