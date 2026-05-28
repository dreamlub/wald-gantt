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
  const [highlighted, setHighlighted] = useState(-1)
  const [dropUp, setDropUp] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value)
  const close = useCallback(() => { setOpen(false); setHighlighted(-1) }, [])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlighted(-1)
  }, [value])

  useEffect(() => {
    if (!open || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropUp(rect.bottom + 200 > window.innerHeight)
  }, [open])

  useEffect(() => {
    if (highlighted < 0 || !listRef.current) return
    const el = listRef.current.children[highlighted] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { close(); return }

    if (!open || filtered.length === 0) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        setOpen(true)
        setHighlighted(0)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(i => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(i => (i <= 0 ? filtered.length - 1 : i - 1))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault()
      onChange(filtered[highlighted])
      close()
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        name={name}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul ref={listRef} className={`absolute z-50 left-0 right-0 bg-card border border-border rounded-md shadow-lg py-0.5 max-h-48 overflow-y-auto ${dropUp ? 'bottom-full mb-0.5' : 'top-full mt-0.5'}`}>
          {filtered.map((s, i) => (
            <li
              key={s}
              onPointerDown={e => { e.preventDefault(); onChange(s); close() }}
              onPointerEnter={() => setHighlighted(i)}
              className={`px-2.5 py-1.5 text-xs cursor-pointer ${
                i === highlighted
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
