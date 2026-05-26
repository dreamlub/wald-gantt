'use client'

import { RotateCw } from 'lucide-react'
import type { RecurrenceRule } from '@/types'

const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: 'daily',   label: '매일' },
  { value: 'weekly',  label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly',  label: '매년' },
]

interface Props {
  recurrenceRule: RecurrenceRule | null
  setRecurrenceRule: (v: RecurrenceRule | null) => void
  recurrenceInterval: number
  setRecurrenceInterval: (v: number) => void
}

export function DrawerRecurrenceSection({
  recurrenceRule, setRecurrenceRule,
  recurrenceInterval, setRecurrenceInterval,
}: Props) {
  return (
    <div className="pt-2 border-t border-border">
      <label className="text-sm font-semibold text-ink-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
        <RotateCw size={10} /> 반복
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setRecurrenceRule(null)}
          className={`text-sm px-2.5 py-1 rounded border transition-colors ${
            recurrenceRule === null
              ? 'border-lilac-400 bg-lilac-50 text-lilac-600 font-medium'
              : 'border-border text-ink-400 hover:border-ink-300'
          }`}
        >
          없음
        </button>
        {RECURRENCE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRecurrenceRule(opt.value)}
            className={`text-sm px-2.5 py-1 rounded border transition-colors ${
              recurrenceRule === opt.value
                ? 'border-lilac-400 bg-lilac-50 text-lilac-600 font-medium'
                : 'border-border text-ink-400 hover:border-ink-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {recurrenceRule && recurrenceRule !== 'yearly' && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            min={1}
            max={99}
            value={recurrenceInterval}
            onChange={e => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 text-sm text-center border border-border rounded px-2 py-1 outline-none focus:border-lilac-300"
          />
          <span className="text-sm text-ink-400">
            {recurrenceRule === 'daily' ? '일마다' : recurrenceRule === 'weekly' ? '주마다' : '개월마다'}
          </span>
        </div>
      )}
    </div>
  )
}
