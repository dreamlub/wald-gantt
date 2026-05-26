'use client'

import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { useClickAway } from '@/hooks/use-click-away'
import { labelColor } from '../_utils'

interface Props {
  labels: string[]
  setLabels: React.Dispatch<React.SetStateAction<string[]>>
  labelSuggestions: string[]
}

export function DrawerLabelSection({ labels, setLabels, labelSuggestions }: Props) {
  const [labelInput, setLabelInput] = useState('')
  const [labelOpen,  setLabelOpen]  = useState(false)
  const labelRef = useClickAway<HTMLDivElement>(labelOpen, () => setLabelOpen(false))

  function addLabel() {
    const val = labelInput.trim()
    if (!val || labels.includes(val)) { setLabelInput(''); return }
    setLabels(prev => [...prev, val])
    setLabelInput('')
  }

  return (
    <div ref={labelRef}>
      <label className="text-sm font-semibold text-ink-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
        <Tag size={10} /> 라벨
      </label>
      <div className="flex flex-wrap gap-1.5">
        {labels.map(l => (
          <button
            key={l}
            onClick={() => setLabels(prev => prev.filter(x => x !== l))}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium hover:opacity-80 transition-opacity"
            style={{ backgroundColor: labelColor(l) }}
            title="클릭해서 삭제"
          >
            {l} <X size={9} />
          </button>
        ))}
        <div className="relative">
          <input
            className="text-sm px-2 py-0.5 rounded-full border border-dashed border-border outline-none focus:border-lilac-300 text-muted-foreground placeholder:text-ink-300 min-w-[100px]"
            placeholder="입력 후 Enter"
            value={labelInput}
            onChange={e => { setLabelInput(e.target.value); setLabelOpen(true) }}
            onFocus={() => setLabelOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel() }
              if (e.key === 'Escape') setLabelOpen(false)
            }}
          />
          {labelOpen && (() => {
            const suggestions = labelSuggestions.filter(s =>
              !labels.includes(s) && s.toLowerCase().includes(labelInput.toLowerCase())
            )
            if (suggestions.length === 0) return null
            return (
              <ul className="absolute z-50 left-0 top-full mt-0.5 bg-card border border-border rounded-md shadow-lg py-0.5 max-h-40 overflow-y-auto min-w-[140px]">
                {suggestions.map(s => (
                  <li
                    key={s}
                    onPointerDown={e => {
                      e.preventDefault()
                      setLabels(prev => [...prev, s])
                      setLabelInput('')
                      setLabelOpen(false)
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm hover:bg-accent cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: labelColor(s) }} />
                    {s}
                  </li>
                ))}
              </ul>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
