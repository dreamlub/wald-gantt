'use client'

import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, CalendarIcon, FileText } from 'lucide-react'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

type RangePreset = 'today' | 'this-week' | 'this-month' | 'all'

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today',      label: '오늘' },
  { key: 'this-week',  label: '이번 주' },
  { key: 'this-month', label: '이번 달' },
  { key: 'all',        label: '전체' },
]

function getPresetDates(preset: RangePreset): { start: Date | undefined; end: Date | undefined } {
  const now = new Date()
  switch (preset) {
    case 'today':      return { start: startOfDay(now), end: endOfDay(now) }
    case 'this-week':  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
    case 'this-month': return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'all':        return { start: undefined, end: undefined }
  }
}

function DatePickerButton({ value, onChange, placeholder, disabledDates }: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder: string
  disabledDates?: (date: Date) => boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-border bg-card px-2 text-xs h-8 font-normal transition-colors hover:bg-muted focus:outline-none focus:border-lilac-300">
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

export default function WeeklyPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [preset, setPreset]           = useState<RangePreset | null>('this-month')
  const [startDate, setStartDate]     = useState<Date | undefined>(() => startOfMonth(new Date()))
  const [endDate, setEndDate]         = useState<Date | undefined>(() => endOfMonth(new Date()))

  function handlePreset(key: RangePreset) {
    setPreset(key)
    const { start, end } = getPresetDates(key)
    setStartDate(start)
    setEndDate(end)
  }

  function handleStartDate(d: Date | undefined) {
    setStartDate(d)
    setPreset(null)
  }

  function handleEndDate(d: Date | undefined) {
    setEndDate(d)
    setPreset(null)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 사이드바 */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: sidebarOpen ? 200 : 0 }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0 gap-2">
          <h1 className="flex-1 text-xs font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">Weekly</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors"
            title="사이드바 닫기"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <div className="flex flex-col p-2 overflow-y-auto flex-1 min-h-0">
          {/* 기간 프리셋 */}
          <div className="px-2 mb-1 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">기간</div>
          <div className="flex flex-col gap-0.5">
            {PRESETS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handlePreset(key)}
                className={`sidebar-btn ${preset === key ? 'sidebar-btn-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 직접 날짜 선택 */}
          <div className="mt-4 flex flex-col gap-2 px-1">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">시작일</label>
              <div className="mt-1.5">
                <DatePickerButton
                  value={startDate}
                  onChange={handleStartDate}
                  placeholder="날짜 선택"
                  disabledDates={endDate ? d => d > endDate : undefined}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">마감일</label>
              <div className="mt-1.5">
                <DatePickerButton
                  value={endDate}
                  onChange={handleEndDate}
                  placeholder="날짜 선택"
                  disabledDates={startDate ? d => d < startDate : undefined}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="h-12 border-b bg-card flex items-center px-4 gap-2 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="사이드바 열기"
            >
              <PanelLeftOpen size={15} />
            </button>
          )}
          <span className="text-sm font-semibold text-foreground">Weekly</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-muted">
          <FileText size={40} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">주간보고 준비 중</p>
            <p className="text-xs mt-1 text-muted-foreground">내용을 채워 넣을게요</p>
          </div>
        </div>
      </div>
    </div>
  )
}
