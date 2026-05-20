'use client'

import { useState } from 'react'
import { Check, LayoutList, ChevronLeft, ChevronRight } from 'lucide-react'

import type { Client, Tag, HistoryItem, Priority } from '../_lib/types'
import { TAG_META, TAG_KEYS, PRIORITY_META, PRIORITY_KEYS } from '../_lib/mock-data'
import { PriorityBars } from './badges'

export type PriorityKey = 'all' | Priority
export type DateMode = 'occurred' | 'updated'

// ── 주 유틸 (export — shell에서도 사용) ─────────────────────
export function getMondayOfDate(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getWeekLabel(monday: Date): string {
  const month = monday.getMonth()
  const dow = new Date(monday.getFullYear(), month, 1).getDay()
  const firstMondayDate = 1 + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow)
  const weekNum = Math.floor((monday.getDate() - firstMondayDate) / 7) + 1
  return `${month + 1}월 ${weekNum}주`
}

export function getWeekDateRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${monday.getMonth() + 1}/${monday.getDate()} ~ ${sunday.getMonth() + 1}/${sunday.getDate()}`
}

export function getCurrentWeekStart(): string {
  return dateStr(getMondayOfDate(new Date()))
}

export function isCurrentWeek(weekStart: string): boolean {
  return weekStart === getCurrentWeekStart()
}

// ── Props ────────────────────────────────────────────────────
interface Props {
  view: 'table' | 'insight' | 'summary'
  clients: Client[]
  history: HistoryItem[]
  // table/summary용
  dateFrom: string
  dateTo: string
  dateMode: DateMode
  onDateFromChange: (s: string) => void
  onDateToChange: (s: string) => void
  onPresetClick: (preset: 'today' | 'week' | 'month' | 'all') => void
  onDateModeChange: (mode: DateMode) => void
  // insight용
  weekStart: string
  onWeekChange: (weekStart: string) => void
  // 공통
  brandId: string | 'all'
  selectedTags: Set<Tag>
  priorityKey: PriorityKey
  onBrandChange: (id: string | 'all') => void
  onToggleTag: (t: Tag) => void
  onPriorityChange: (p: PriorityKey) => void
}


export function HistorySidebar({
  view,
  clients, history,
  dateFrom, dateTo, dateMode, onDateFromChange, onDateToChange, onPresetClick, onDateModeChange,
  weekStart, onWeekChange,
  brandId, selectedTags, priorityKey,
  onBrandChange, onToggleTag, onPriorityChange,
}: Props) {
  const tagCounts: Record<string, number> = {}
  for (const t of TAG_KEYS) tagCounts[t] = 0
  for (const h of history) for (const t of h.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1

  const priCounts: Record<string, number> = { all: history.length }
  for (const p of PRIORITY_KEYS) priCounts[p] = 0
  for (const h of history) if (h.priority) priCounts[h.priority] = (priCounts[h.priority] ?? 0) + 1

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">

      {/* ── 기간 (뷰에 따라 다름) ─────────────────────────── */}
      {view === 'insight' ? (
        <WeekNavSection weekStart={weekStart} onWeekChange={onWeekChange} />
      ) : (
        <MonthGridSection
          dateFrom={dateFrom} dateMode={dateMode}
          onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
          onDateModeChange={onDateModeChange}
        />
      )}

      {/* ── 태그·중요도 (인사이트 탭 제외) ─────────────────── */}
      {view !== 'insight' && (
        <>
          <div className="mt-3">
            <GroupTitle>태그</GroupTitle>
            {TAG_KEYS.map(t => {
              const meta = TAG_META[t]
              const active = selectedTags.has(t)
              return (
                <button key={t} onClick={() => onToggleTag(t)} className={`sidebar-btn ${active ? 'sidebar-btn-active' : ''}`}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
                  <span className="flex-1 truncate text-left">{meta.label}</span>
                  {active && <Check size={12} className="shrink-0" />}
                  <span className="text-xs text-ink-400">{tagCounts[t] ?? 0}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-3">
            <GroupTitle>중요도</GroupTitle>
            <button onClick={() => onPriorityChange('all')} className={`sidebar-btn ${priorityKey === 'all' ? 'sidebar-btn-active' : ''}`}>
              <LayoutList size={12} className="shrink-0" />
              <span className="flex-1 truncate text-left">전체</span>
              <span className="text-xs text-ink-400">{priCounts.all}</span>
            </button>
            {PRIORITY_KEYS.filter(p => (priCounts[p] ?? 0) > 0).map(p => {
              const meta = PRIORITY_META[p]
              return (
                <button key={p} onClick={() => onPriorityChange(priorityKey === p ? 'all' : p)} className={`sidebar-btn ${priorityKey === p ? 'sidebar-btn-active' : ''}`}>
                  <PriorityBars priority={p} />
                  <span className="flex-1 truncate text-left">{meta.label}</span>
                  <span className="text-xs text-ink-400">{priCounts[p]}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── 주 네비게이션 (인사이트 전용) ───────────────────────────
function WeekNavSection({ weekStart, onWeekChange }: { weekStart: string; onWeekChange: (s: string) => void }) {
  const monday = new Date(weekStart + 'T00:00:00')
  const isCurrent = isCurrentWeek(weekStart)
  const thisMonday = getMondayOfDate(new Date())

  function movePrev() {
    const prev = new Date(monday)
    prev.setDate(monday.getDate() - 7)
    onWeekChange(dateStr(prev))
  }

  function moveNext() {
    if (!isCurrent) {
      const next = new Date(monday)
      next.setDate(monday.getDate() + 7)
      onWeekChange(dateStr(next))
    }
  }

  // 이번 주 포함 최근 4주
  const recentWeeks = Array.from({ length: 4 }, (_, i) => {
    const m = new Date(thisMonday)
    m.setDate(thisMonday.getDate() - i * 7)
    return m
  })

  function getShortLabel(m: Date, i: number): string {
    if (i === 0) return '이번 주'
    if (i === 1) return '지난 주'
    return getWeekLabel(m)
  }

  return (
    <div className="pb-1">
      <div className="px-2 mb-1.5 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">기간</div>

      {/* 상단 네비게이터 */}
      <div className="mx-2 flex items-stretch bg-card border border-border rounded overflow-hidden mb-2">
        <button onClick={movePrev}
          className="w-7 flex items-center justify-center text-ink-400 border-r border-border hover:bg-muted hover:text-foreground transition-colors">
          <ChevronLeft size={13} />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center py-1.5 px-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            {getWeekLabel(monday)}
            {isCurrent && (
              <span className="text-[9px] font-bold tracking-[0.04em] px-1 rounded-[2px] bg-lilac-100 text-lilac-600">NOW</span>
            )}
          </div>
          <div className="text-[10px] text-ink-400 mt-0.5">{getWeekDateRange(monday)}</div>
        </div>
        <button onClick={moveNext} disabled={isCurrent}
          className="w-7 flex items-center justify-center text-ink-400 border-l border-border hover:bg-muted hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed">
          <ChevronRight size={13} />
        </button>
      </div>

      {/* 최근 주 목록 */}
      {recentWeeks.map((m, i) => {
        const ws = dateStr(m)
        const isSelected = weekStart === ws
        return (
          <button key={ws} onClick={() => onWeekChange(ws)}
            className={`sidebar-btn ${isSelected ? 'sidebar-btn-active' : ''}`}>
            <span className="flex-1 flex items-center gap-1.5 truncate">
              {getShortLabel(m, i)}
              {i === 0 && (
                <span className="text-[9px] font-bold tracking-[0.04em] px-1 rounded-[2px] bg-lilac-100 text-lilac-600">NOW</span>
              )}
            </span>
            <span className="text-[11px] shrink-0 text-ink-400">
              {getWeekDateRange(m)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── 월 그리드 피커 (테이블/요약 전용) ───────────────────────
const DATE_MODES: { key: DateMode; label: string }[] = [
  { key: 'occurred', label: '발생일' },
  { key: 'updated',  label: '수정일' },
]

function MonthGridSection({ dateFrom, dateMode, onDateFromChange, onDateToChange, onDateModeChange }: {
  dateFrom: string; dateMode: DateMode
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
  onDateModeChange: (mode: DateMode) => void
}) {
  const today = new Date()
  const thisYear  = today.getFullYear()
  const thisMonth = today.getMonth() + 1
  const thisDate  = today.getDate()

  const [calYear, setCalYear] = useState(() =>
    dateFrom ? parseInt(dateFrom.slice(0, 4)) : thisYear
  )

  const selYear  = dateFrom ? parseInt(dateFrom.slice(0, 4)) : null
  const selMonth = dateFrom ? parseInt(dateFrom.slice(5, 7)) : null

  function selectMonth(year: number, month: number) {
    const mm   = String(month).padStart(2, '0')
    const last = new Date(year, month, 0).getDate()
    onDateFromChange(`${year}-${mm}-01`)
    onDateToChange(`${year}-${mm}-${String(last).padStart(2, '0')}`)
  }

  return (
    <div className="pb-1">
      <div className="px-2 mb-1.5 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">기간</div>

      {/* 발생일 / 수정일 토글 */}
      <div className="mx-2 flex items-center gap-0.5 bg-muted rounded-md p-0.5 mb-2">
        {DATE_MODES.map(({ key, label }) => (
          <button key={key} onClick={() => onDateModeChange(key)}
            className={`flex-1 text-[11px] py-0.5 rounded transition-colors text-center ${
              dateMode === key
                ? 'bg-card text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* 연도 네비게이터 */}
      <div className="mx-2 flex items-stretch bg-card border border-border rounded overflow-hidden mb-2">
        <button onClick={() => setCalYear(y => y - 1)}
          className="w-7 flex items-center justify-center text-ink-400 border-r border-border hover:bg-muted hover:text-foreground transition-colors">
          <ChevronLeft size={13} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5">
          <span className="text-xs font-semibold text-foreground">{calYear}</span>
          {calYear === thisYear && (
            <span className="text-[9px] font-bold tracking-[0.04em] px-1 rounded-[2px] bg-lilac-100 text-lilac-600">NOW</span>
          )}
        </div>
        <button onClick={() => setCalYear(y => y + 1)} disabled={calYear >= thisYear}
          className="w-7 flex items-center justify-center text-ink-400 border-l border-border hover:bg-muted hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed">
          <ChevronRight size={13} />
        </button>
      </div>

      {/* 월 그리드 (3행 × 4열) */}
      <div className="mx-2 grid grid-cols-4 gap-1">
        {Array.from({ length: 12 }, (_, i) => {
          const m        = i + 1
          const isSelected = selYear === calYear && selMonth === m
          const isCurrent  = calYear === thisYear && m === thisMonth
          const isFuture   = calYear > thisYear || (calYear === thisYear && m > thisMonth)

          return (
            <button key={m}
              onClick={() => { if (!isFuture) selectMonth(calYear, m) }}
              disabled={isFuture}
              className={[
                'relative flex flex-col items-center justify-center rounded py-2 text-xs font-medium transition-colors',
                isSelected ? 'bg-foreground text-background' : '',
                !isSelected && !isFuture ? 'hover:bg-muted text-foreground' : '',
                isFuture ? 'text-ink-200 cursor-not-allowed' : '',
              ].join(' ')}>
              {/* 현재 날짜 뱃지 (상단 우측) */}
              {isCurrent && (
                <span className={[
                  'absolute top-0.5 right-1 text-[9px] font-semibold leading-none',
                  isSelected ? 'text-background/60' : 'text-lilac-500',
                ].join(' ')}>
                  {thisDate}
                </span>
              )}
              <span>{m}</span>
              {/* 현재 월 점 (하단) */}
              {isCurrent && (
                <span className={['w-1 h-1 rounded-full mt-0.5', isSelected ? 'bg-background/60' : 'bg-foreground'].join(' ')} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-2 mb-1 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{children}</div>
}
