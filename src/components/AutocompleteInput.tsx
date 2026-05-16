'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  name?: string
}

export function AutocompleteInput({ value, onChange, suggestions, placeholder, className, name }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close])

  return (
    <div ref={containerRef} className="relative">
      <input
        name={name}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') close() }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-card border border-border rounded-md shadow-lg py-0.5 max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <li
              key={s}
              onPointerDown={e => { e.preventDefault(); onChange(s); close() }}
              className="px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
