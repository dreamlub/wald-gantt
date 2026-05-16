'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon, X, ChevronsUpDown, Check, LayoutList } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import type { Client, Tag, HistoryItem, Priority } from '../_lib/types'
import { TAG_META, TAG_KEYS, PRIORITY_META, PRIORITY_KEYS } from '../_lib/mock-data'
import { PriorityBars } from './badges'

export type PriorityKey = 'all' | Priority

interface Props {
  clients: Client[]
  history: HistoryItem[]
  dateFrom: string
  dateTo: string
  brandId: string | 'all'
  selectedTags: Set<Tag>
  priorityKey: PriorityKey
  onDateFromChange: (s: string) => void
  onDateToChange: (s: string) => void
  onPresetClick: (preset: 'today' | 'week' | 'month' | 'all') => void
  onBrandChange: (id: string | 'all') => void
  onToggleTag: (t: Tag) => void
  onPriorityChange: (p: PriorityKey) => void
  onReset?: () => void
}

const PRESETS: { key: 'today' | 'week' | 'month' | 'all'; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'week',  label: '이번 주' },
  { key: 'month', label: '한 달' },
  { key: 'all',   label: '전체' },
]

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function activePreset(from: string, to: string): 'today' | 'week' | 'month' | 'all' | null {
  if (!from && !to) return 'all'
  const now = new Date()
  const today = dateStr(now)
  if (from === today && to === today) return 'today'
  if (to === today) {
    const week = dateStr(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000))
    if (from === week) return 'week'
    const month = dateStr(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000))
    if (from === month) return 'month'
  }
  return null
}

export function HistorySidebar({
  clients, history, dateFrom, dateTo,
  brandId, selectedTags, priorityKey,
  onDateFromChange, onDateToChange, onPresetClick,
  onBrandChange, onToggleTag, onPriorityChange,
}: Props) {
  // tag counts
  const tagCounts: Record<string, number> = {}
  for (const t of TAG_KEYS) tagCounts[t] = 0
  for (const h of history) for (const t of h.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1

  // priority counts
  const priCounts: Record<string, number> = { all: history.length }
  for (const p of PRIORITY_KEYS) priCounts[p] = 0
  for (const h of history) if (h.priority) priCounts[h.priority] = (priCounts[h.priority] ?? 0) + 1

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">
      <div className="px-2 mb-1 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">필터</div>

      {/* 기간 — from~to */}
      <div className="px-2 pt-0.5 pb-1 flex flex-col gap-1.5">
        <DateField label="시작" value={dateFrom} onChange={onDateFromChange} />
        <DateField label="끝"   value={dateTo}   onChange={onDateToChange} />
      </div>

      {/* 프리셋 */}
      {(() => {
        const active = activePreset(dateFrom, dateTo)
        return (
          <div className="px-2 pt-1 pb-0.5 flex flex-wrap gap-1">
            {PRESETS.map(({ key, label }) => {
              const isActive = active === key
              return (
                <button
                  key={key}
                  onClick={() => onPresetClick(key)}
                  className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                    isActive
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* 브랜드 — 콤보박스 */}
      <div className="mt-3">
        <GroupTitle>브랜드</GroupTitle>
        <BrandCombobox
          clients={clients}
          history={history}
          brandId={brandId}
          onChange={onBrandChange}
        />
      </div>

      {/* 태그 — 다중 선택 (AND) */}
      <div className="mt-3">
        <GroupTitle>태그</GroupTitle>
        {TAG_KEYS.map(t => {
          const meta = TAG_META[t]
          const active = selectedTags.has(t)
          const c = tagCounts[t] ?? 0
          return (
            <button
              key={t}
              onClick={() => onToggleTag(t)}
              className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              {active && <Check size={12} className="shrink-0" />}
              <span className="text-xs text-ink-400">{c}</span>
            </button>
          )
        })}
      </div>

      {/* 중요도 */}
      <div className="mt-3">
        <GroupTitle>중요도</GroupTitle>
        <button
          onClick={() => onPriorityChange('all')}
          className={`sidebar-btn ${priorityKey === 'all' ? 'sidebar-btn-active' : ''}`}
        >
          <LayoutList size={12} className="shrink-0" />
          <span className="flex-1 truncate text-left">전체</span>
          <span className="text-xs text-ink-400">{priCounts.all}</span>
        </button>
        {PRIORITY_KEYS.filter(p => (priCounts[p] ?? 0) > 0).map(p => {
          const meta = PRIORITY_META[p]
          return (
            <button
              key={p}
              onClick={() => onPriorityChange(priorityKey === p ? 'all' : p)}
              className={`sidebar-btn ${priorityKey === p ? 'sidebar-btn-active' : ''}`}
            >
              <PriorityBars priority={p} />
              <span className="flex-1 truncate text-left">{meta.label}</span>
              <span className="text-xs text-ink-400">{priCounts[p]}</span>
            </button>
          )
        })}
      </div>

    </div>
  )
}

// ── 브랜드 콤보박스 ───────────────────────────────────────────
function BrandCombobox({
  clients, history, brandId, onChange,
}: {
  clients: Client[]
  history: HistoryItem[]
  brandId: string | 'all'
  onChange: (id: string | 'all') => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of history) m.set(h.client_id, (m.get(h.client_id) ?? 0) + 1)
    return m
  }, [history])

  const selected = clients.find(c => c.id === brandId) ?? null
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...clients].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    if (!q) return sorted
    return sorted.filter(c => c.name.toLowerCase().includes(q) || c.name_en.toLowerCase().includes(q))
  }, [clients, counts, query])

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery('') }}>
      <PopoverTrigger className="w-full inline-flex items-center gap-2 px-2 py-1.5 rounded text-xs text-ink-700 bg-card border border-border hover:border-ink-300 transition-colors">
        {selected ? (
          <>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selected.color }} />
            <span className="flex-1 truncate text-left">{selected.name}</span>
            <span className="text-xs text-ink-400">{counts.get(selected.id) ?? 0}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-left text-muted-foreground">전체 브랜드</span>
        )}
        <ChevronsUpDown size={12} className="shrink-0 text-ink-400" />
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="p-2 border-b border-border">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="브랜드 검색"
            className="w-full text-[11px] px-2 py-1 border border-border rounded bg-card text-foreground outline-none focus:border-lilac-300 placeholder:text-ink-300"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          <button
            onClick={() => { onChange('all'); setOpen(false); setQuery('') }}
            className={`sidebar-btn ${brandId === 'all' ? 'sidebar-btn-active' : ''}`}
          >
            <LayoutList size={12} className="shrink-0" />
            <span className="flex-1 truncate text-left">전체</span>
            <span className="text-xs text-ink-400">{history.length}</span>
          </button>
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-center text-[11px] text-ink-400">결과 없음</div>
          ) : (
            filtered.map(c => {
              const active = brandId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => { onChange(c.id); setOpen(false); setQuery('') }}
                  className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="flex-1 truncate text-left">{c.name}</span>
                  <span className="text-xs text-ink-400">{counts.get(c.id) ?? 0}</span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 mb-1 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">
      {children}
    </div>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const dateValue = value ? new Date(value + 'T00:00:00') : undefined

  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-700">
      <span className="w-7 text-ink-400 font-medium shrink-0">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex-1 min-w-0 inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 h-7 text-[11px] font-normal text-foreground transition-colors hover:bg-muted focus:outline-none focus:border-lilac-300">
          <CalendarIcon size={11} className="text-muted-foreground shrink-0" />
          {dateValue
            ? <span className="flex-1 text-left truncate">{format(dateValue, 'yyyy.MM.dd', { locale: ko })}</span>
            : <span className="flex-1 text-left text-ink-300">날짜 선택</span>
          }
          {dateValue && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onChange('') }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange('') } }}
              className="text-ink-300 hover:text-muted-foreground"
              title="지우기"
            >
              <X size={10} />
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            defaultMonth={dateValue}
            onSelect={d => {
              if (d) {
                const y = d.getFullYear()
                const m = String(d.getMonth() + 1).padStart(2, '0')
                const day = String(d.getDate()).padStart(2, '0')
                onChange(`${y}-${m}-${day}`)
              } else {
                onChange('')
              }
              setOpen(false)
            }}
            locale={ko}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

