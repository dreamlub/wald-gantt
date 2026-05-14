'use client'

import { useState } from 'react'
import { todayStrKST } from '@/lib/gantt-utils'

interface Props {
  taskDates: Set<string>
  onDateSelect: (d: string | null) => void
  selectedDate: string | null
}

export function MiniCalendar({ taskDates, onDateSelect, selectedDate }: Props) {
  const [cur, setCur] = useState(() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() }
  })
  const todayKST = todayStrKST()
  const [ty, tm, td] = todayKST.split('-').map(Number)
  const firstDay = new Date(cur.year, cur.month, 1).getDay()
  const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate()

  // Always 42 cells (6 rows) to prevent height jump
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length < 42) cells.push(null)

  function toKey(d: number) {
    return `${cur.year}-${String(cur.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">{cur.year}년 {cur.month + 1}월</span>
        <div className="flex items-center gap-1">
          {selectedDate && (
            <button
              onClick={() => onDateSelect(null)}
              className="flex items-center gap-0.5 text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full hover:bg-indigo-100 transition-colors"
            >
              {selectedDate.slice(5).replace('-', '/')}
              <span className="ml-0.5 text-indigo-400">✕</span>
            </button>
          )}
          <button
            onClick={() => setCur(c => { const d = new Date(c.year, c.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
          >‹</button>
          <button
            onClick={() => setCur(c => { const d = new Date(c.year, c.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
          >›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {['일','월','화','수','목','금','토'].map(d => (
          <div key={d} className="text-[9px] text-gray-400 py-0.5">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return (
            <div key={i} className="flex flex-col items-center py-0.5">
              <span className="w-6 h-6" />
              <span className="w-1 h-1 mt-0.5" />
            </div>
          )
          const key = toKey(d)
          const isToday = ty === cur.year && (tm - 1) === cur.month && td === d
          const isSelected = selectedDate === key
          const hasTasks = taskDates.has(key)
          return (
            <div key={i} className="flex flex-col items-center py-0.5">
              <button
                onClick={() => onDateSelect(isSelected ? null : key)}
                className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full leading-none transition-colors
                  ${isSelected
                    ? 'bg-indigo-600 text-white font-bold'
                    : isToday
                      ? 'bg-indigo-100 text-indigo-700 font-bold'
                      : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {d}
              </button>
              {hasTasks
                ? <span className="w-1 h-1 rounded-full mt-0.5 bg-indigo-400" />
                : <span className="w-1 h-1 mt-0.5" />
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}
