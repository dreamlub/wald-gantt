'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Calendar } from './calendar'

interface Props {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder: string
  disabledDates?: (date: Date) => boolean
}

function parseDateText(raw: string): Date | null {
  const s = raw.trim().replace(/[-/]/g, '.')
  // YYYY.MM.DD
  const full = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/)
  if (full) {
    const d = new Date(+full[1], +full[2] - 1, +full[3])
    if (!isNaN(d.getTime()) && d.getMonth() === +full[2] - 1) return d
  }
  // MM.DD → 올해 연도 적용
  const short = s.match(/^(\d{1,2})\.(\d{1,2})$/)
  if (short) {
    const d = new Date(new Date().getFullYear(), +short[1] - 1, +short[2])
    if (!isNaN(d.getTime()) && d.getMonth() === +short[1] - 1) return d
  }
  return null
}

export function DatePickerButton({ value, onChange, placeholder, disabledDates }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value ? format(value, 'yyyy.MM.dd') : '')

  // 달력 선택 등 외부에서 value가 바뀌면 input 텍스트 동기화
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(value ? format(value, 'yyyy.MM.dd') : '')
  }, [value])

  function commit() {
    if (!text.trim()) { onChange(undefined); return }
    const parsed = parseDateText(text)
    if (parsed) {
      onChange(parsed)
      setText(format(parsed, 'yyyy.MM.dd'))
    } else {
      // 잘못된 입력 → 이전 값으로 복원
      setText(value ? format(value, 'yyyy.MM.dd') : '')
    }
  }

  return (
    <div className="flex items-center h-8 w-full rounded-lg border border-border bg-card focus-within:border-lilac-300 transition-colors overflow-hidden">
      <input
        className="flex-1 min-w-0 text-sm px-2.5 bg-transparent outline-none text-foreground placeholder:text-ink-300 tabular-nums"
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="shrink-0 px-2 h-full flex items-center text-muted-foreground hover:text-foreground border-l border-border transition-colors focus:outline-none">
          <CalendarIcon size={13} />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value ?? new Date()}
            onSelect={d => { onChange(d); setOpen(false) }}
            locale={ko}
            disabled={disabledDates}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
