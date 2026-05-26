'use client'

import { useState } from 'react'
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

export function DatePickerButton({ value, onChange, placeholder, disabledDates }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-border bg-card px-2 text-sm h-8 font-normal transition-colors hover:bg-muted focus:outline-none focus:border-lilac-300">
        <CalendarIcon size={13} className="text-muted-foreground shrink-0" />
        {value
          ? <span className="text-foreground">{format(value, 'yyyy.MM.dd', { locale: ko })}</span>
          : <span className="text-ink-300">{placeholder}</span>
        }
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value}
          onSelect={d => { onChange(d); setOpen(false) }}
          locale={ko}
          disabled={disabledDates}
        />
      </PopoverContent>
    </Popover>
  )
}
