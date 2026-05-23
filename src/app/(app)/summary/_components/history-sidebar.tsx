'use client'

import { useState } from 'react'
import { Check, LayoutList, ChevronLeft, ChevronRight, DatabaseZap } from 'lucide-react'

import type { Client, Tag, HistoryItem, Priority } from '../_lib/types'
import { TAG_META, TAG_KEYS, PRIORITY_META, PRIORITY_KEYS } from '../_lib/mock-data'
import { PriorityBars } from './badges'

export type PriorityKey = 'all' | Priority

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
  view: 'table' | 'timeline' | 'insight' | 'summary' | 'rawdata'
  history: HistoryItem[]
  // table/summary용
  dateFrom: string
  dateTo: string
  onDateFromChange: (s: string) => void
  onDateToChange: (s: string) => void
  onPresetClick: (preset: 'today' | 'week' | 'month' | 'all') => void
  // insight용
  weekStart: string
  onWeekChange: (weekStart: string) => void
  // 공통
  selectedTags: Set<Tag>
  priorityKey: PriorityKey
  onToggleTag: (t: Tag) => void
  onPriorityChange: (p: PriorityKey) => void
}


export function HistorySidebar({
  view,
  history,
  dateFrom, onDateFromChange, onDateToChange, onPresetClick,
  weekStart, onWeekChange,
  selectedTags, priorityKey,
  onToggleTag, onPriorityChange,
}: Props) {
  const tagCounts: Record<string, number> = {}
  for (const t of TAG_KEYS) tagCounts[t] = 0
  for (const h of history) for (const t of h.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1

  const priCounts: Record<string, number> = { all: history.length }
  for (const p of PRIORITY_KEYS) priCounts[p] = 0
  for (const h of history) if (h.priority) priCounts[h.priority] = (priCounts[h.priority] ?? 0) + 1

  if (view === 'rawdata') {
    return <RawDataSidebarPanel />
  }

  if (view === 'insight') {
    const selectedDate = dateFrom || dateStr(new Date())
    const dayItems = history.filter(h => h.occurred_at.slice(0, 10) === selectedDate)
    const dayTagCounts: Record<string, number> = {}
    for (const t of TAG_KEYS) dayTagCounts[t] = 0
    for (const h of dayItems) for (const t of h.tags ?? []) dayTagCounts[t] = (dayTagCounts[t] ?? 0) + 1

    const brandCounts: Record<string, number> = {}
    for (const h of dayItems) {
      const b = h.brand_name ?? '미분류'
      brandCounts[b] = (brandCounts[b] ?? 0) + 1
    }
    const topBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)

    return (
      <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">
        <MonthGridSection
          dateFrom={dateFrom} history={history}
          onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
        />

        <div className="mt-3 mx-2 rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2">
            {selectedDate} 요약
          </div>
          <div className="text-xs text-foreground font-semibold mb-2">전체 {dayItems.length}건</div>
          <div className="space-y-0.5">
            {TAG_KEYS.filter(t => dayTagCounts[t] > 0).map(t => {
              const meta = TAG_META[t]
              return (
                <div key={t} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                  <span className="text-ink-500">{meta.label}</span>
                  <span className="ml-auto text-ink-400">{dayTagCounts[t]}</span>
                </div>
              )
            })}
          </div>
        </div>

        {topBrands.length > 0 && (
          <div className="mt-2 mx-2 rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2">브랜드</div>
            <div className="space-y-0.5">
              {topBrands.map(([name, count]) => (
                <button
                  key={name}
                  onClick={() => onDateFromChange(selectedDate)}
                  className="w-full flex items-center gap-1.5 text-[11px] py-0.5 hover:text-foreground transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-300 shrink-0" />
                  <span className="flex-1 text-left text-ink-600 truncate">{name}</span>
                  <span className="text-ink-400">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">

      {/* ── 기간 ─────────────────────────── */}
      <MonthGridSection
        dateFrom={dateFrom} history={history}
        onDateFromChange={onDateFromChange} onDateToChange={onDateToChange}
      />

      {/* ── 태그·중요도 ─────────────────── */}
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

// ── 일별 캘린더 (테이블/요약 전용) ──────────────────────────
const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const

function MonthGridSection({ dateFrom, history, onDateFromChange, onDateToChange }: {
  dateFrom: string; history: HistoryItem[]
  onDateFromChange: (s: string) => void; onDateToChange: (s: string) => void
}) {
  const today = new Date()
  const todayYmd = dateStr(today)
  const todayY = today.getFullYear()
  const todayM = today.getMonth()
  const todayMs = new Date(todayY, todayM, today.getDate()).getTime()

  const [calYear, setCalYear]   = useState(() => dateFrom ? parseInt(dateFrom.slice(0, 4)) : todayY)
  const [calMonth, setCalMonth] = useState(() => dateFrom ? parseInt(dateFrom.slice(5, 7)) - 1 : todayM)

  // 일별 카운트 (점 표시)
  const dayCounts = (() => {
    const m: Record<string, number> = {}
    for (const h of history) {
      const ymd = h.occurred_at.slice(0, 10)
      m[ymd] = (m[ymd] ?? 0) + 1
    }
    return m
  })()

  // 6주 × 7일 = 42 셀
  const cells = (() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay()
    const start = new Date(calYear, calMonth, 1 - firstDow)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return d
    })
  })()

  function selectDay(d: Date) {
    const ymd = dateStr(d)
    if (ymd === dateFrom) {
      onDateFromChange('')
      onDateToChange('')
    } else {
      onDateFromChange(ymd)
      onDateToChange(ymd)
    }
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }

  const atCurrentMonth = calYear === todayY && calMonth === todayM
  function nextMonth() {
    if (atCurrentMonth) return
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  return (
    <div className="pb-1">
      <div className="mx-2 rounded-lg border border-border bg-card p-2">

        {/* 월 네비게이터 */}
        <div className="flex items-center mb-1">
          <button onClick={prevMonth}
            className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors">
            <ChevronLeft size={12} />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5">
            <span className="text-[11px] font-semibold text-foreground">{calYear}년 {calMonth + 1}월</span>
            {atCurrentMonth && (
              <span className="text-[9px] font-bold tracking-[0.04em] px-1 rounded-[2px] bg-lilac-100 text-lilac-600">NOW</span>
            )}
          </div>
          <button onClick={nextMonth} disabled={atCurrentMonth}
            className="w-6 h-6 flex items-center justify-center text-ink-400 hover:text-foreground transition-colors disabled:text-ink-200 disabled:cursor-not-allowed">
            <ChevronRight size={12} />
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-0.5">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={`text-[9px] text-center py-0.5 ${
                i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-ink-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          const dow      = d.getDay()
          const inMonth  = d.getMonth() === calMonth
          const ymd      = dateStr(d)
          const isSelected = ymd === dateFrom
          const isToday    = ymd === todayYmd
          const isFuture   = d.getTime() > todayMs
          const hasItems   = (dayCounts[ymd] ?? 0) > 0

          let colorClass = ''
          if (isFuture) colorClass = 'text-ink-200'
          else if (!inMonth) colorClass = dow === 0 ? 'text-rose-200' : dow === 6 ? 'text-blue-200' : 'text-ink-200'
          else colorClass = dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-blue-500' : 'text-foreground'

          return (
            <button
              key={i}
              onClick={() => !isFuture && selectDay(d)}
              disabled={isFuture}
              className={[
                'relative h-6 flex items-center justify-center rounded text-[11px] transition-colors',
                isSelected
                  ? 'bg-lilac-500 text-white font-semibold hover:bg-lilac-500'
                  : isFuture
                    ? 'cursor-not-allowed'
                    : 'hover:bg-muted',
                !isSelected ? colorClass : '',
              ].join(' ')}
              title={ymd}
            >
              <span>{d.getDate()}</span>
              {isToday && !isSelected && (
                <span className="absolute -top-0.5 right-1 text-[8px] font-bold text-lilac-500 leading-none">·</span>
              )}
              {hasItems && (
                <span className={[
                  'absolute bottom-0.5 w-1 h-1 rounded-full',
                  isSelected ? 'bg-white/70' : 'bg-current opacity-40',
                ].join(' ')} />
              )}
            </button>
          )
        })}
        </div>
      </div>
    </div>
  )
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-2 mb-1 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{children}</div>
}

// ── Raw Data 전용 사이드바 ───────────────────────────────────
function RawDataSidebarPanel() {
  const [from, setFrom] = useState('2026-04-01')
  const [to, setTo]     = useState('2026-04-30')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy]     = useState(false)

  async function handleCollectRaw() {
    if (busy) return
    setBusy(true)
    setStatus('준비 중...')
    try {
      const res = await fetch('/api/slack/collect-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          let eventType = '', eventData = ''
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: ')) eventData = line.slice(6)
          }
          if (!eventData) continue
          const data = JSON.parse(eventData) as Record<string, unknown>
          if (eventType === 'status') setStatus(data.message as string)
          else if (eventType === 'result') setStatus(`✓ ${data.message as string}`)
          else if (eventType === 'error') setStatus(`오류: ${data.message as string}`)
        }
      }
    } catch (e) {
      setStatus(`오류: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[11px] text-ink-400 leading-relaxed">
        날짜별 수집 현황을 확인하고 재수집을 실행합니다.
      </p>

      <div className="border border-border rounded-lg p-3 flex flex-col gap-2">
        <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-0.5">기간 Raw 수집</div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-ink-400 w-6 shrink-0">from</span>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              disabled={busy}
              className="flex-1 text-[11px] bg-muted border border-border rounded px-1.5 py-1 text-foreground disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-ink-400 w-6 shrink-0">to</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              disabled={busy}
              className="flex-1 text-[11px] bg-muted border border-border rounded px-1.5 py-1 text-foreground disabled:opacity-50"
            />
          </div>
        </div>
        <button
          onClick={handleCollectRaw}
          disabled={busy || !from || !to || from > to}
          className="mt-0.5 flex items-center justify-center gap-1.5 w-full text-[11px] font-medium px-3 py-1.5 rounded border border-border text-ink-500 hover:text-foreground hover:border-ink-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <DatabaseZap size={11} className={busy ? 'animate-pulse' : ''} />
          {busy ? 'Raw 수집 중...' : 'Raw 수집'}
        </button>
        {status && (
          <p className="text-[10px] text-ink-400 leading-relaxed break-all">{status}</p>
        )}
      </div>
    </div>
  )
}
