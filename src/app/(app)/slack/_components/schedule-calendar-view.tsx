'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { Priority } from '../_lib/types'
import { brandColor } from '@/lib/history-service'

interface UpcomingEvent {
  title: string
  brand: string
  priority: Priority
  date: string        // 원본 문자열
  parsedDate: Date | null
  parsedEndDate: Date | null
  fuzzy: boolean
}

// 제목 정규화: 소문자 + 공백·특수문자 제거 후 앞 6자
// → "A미팅", "A미팅 확정", "A 미팅 준비" 등 조금씩 다른 표현을 같은 키로 묶음
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s\-_·,.!?~()\[\]「」『』【】]/g, '').slice(0, 6)
}

// 날짜 정규화: M/D or M월D일 → "M/D" 통일
// → "6/3", "6월 3일", "6월3일", "6/3(화)" 모두 같은 키
// ※ 룩비하인드로 "2025/6/3"에서 "25/6"이 잘못 매칭되는 케이스 방지
function normalizeDateKey(dateStr: string): string {
  const str = dateStr.trim()
  const kor = str.match(/(\d{1,2})월\s*(\d{1,2})/)
  if (kor) return `${parseInt(kor[1])}/${parseInt(kor[2])}`
  const slash = str.match(/(?<!\d)(\d{1,2})\/(\d{1,2})/)
  if (slash) return `${parseInt(slash[1])}/${parseInt(slash[2])}`
  return str.slice(0, 8)
}

// M/D → 연도 추론: 현재 연도 기준, 이미 3개월 이상 지난 월이면 다음 연도로 간주
function parseEventDate(dateStr: string): { start: Date | null; end: Date | null; fuzzy: boolean } {
  const now = new Date()
  const YEAR = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()
  const str = dateStr.trim()

  // 완전 미정
  if (/^(TBD|미정|추후|설\s*이후|차주|차차주)/.test(str)) {
    return { start: null, end: null, fuzzy: true }
  }

  // N월, N월 초/중/말
  const monthOnly = str.match(/^(\d{1,2})월\s*(초|중|말)?/)
  if (monthOnly) {
    const m = parseInt(monthOnly[1])
    let d = 1
    if (monthOnly[2] === '중') d = 10
    if (monthOnly[2] === '말') d = 20
    return { start: new Date(YEAR, m - 1, d), end: null, fuzzy: true }
  }

  // M/D 기반
  const mdMatch = str.match(/^(\d{1,2})\/(\d{1,2})/)
  if (mdMatch) {
    const m = parseInt(mdMatch[1])
    const d = parseInt(mdMatch[2])
    const start = new Date(YEAR, m - 1, d)

    // 범위: ~M/D 또는 ~D
    const rest = str.slice(mdMatch[0].length)
    const rangeMatch = rest.match(/[~\-](\d{1,2})(?:\/(\d{1,2}))?/)
    let end: Date | null = null
    if (rangeMatch) {
      if (rangeMatch[2]) {
        end = new Date(YEAR, parseInt(rangeMatch[1]) - 1, parseInt(rangeMatch[2]))
      } else {
        end = new Date(YEAR, m - 1, parseInt(rangeMatch[1]))
      }
    }

    const fuzzy = /이후|이내/.test(rest)
    return { start, end, fuzzy }
  }

  return { start: null, end: null, fuzzy: true }
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']


export function ScheduleCalendarView() {
  const [events, setEvents] = useState<UpcomingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [activeBrands, setActiveBrands] = useState<Set<string>>(new Set())
  const [brandQuery, setBrandQuery] = useState('')
  const [overflow, setOverflow] = useState<{ key: string; x: number; y: number } | null>(null)

  useEffect(() => {
    async function load() {
      const sb = createClient()
      const { data } = await sb
        .from('daily_reports')
        .select('report_date, content')
        .order('report_date', { ascending: false })

      if (!data) { setLoading(false); return }

      // 중복 제거: brand + 정규화 날짜 + 정규화 제목(앞 12자) 기준, 최신 리포트 우선
      // → 같은 일정이 여러 날의 리포트에 조금씩 다른 표현으로 등장해도 1건만 유지
      const seen = new Map<string, UpcomingEvent>()
      for (const row of data) {
        const upcoming: Array<{ title: string; brand: string; priority: string; date: string }> =
          (row.content as Record<string, unknown>)?.upcoming as typeof upcoming ?? []
        for (const item of upcoming) {
          const key = `${item.brand}|${normalizeDateKey(item.date)}|${normalizeTitle(item.title)}`
          if (!seen.has(key)) {
            const { start, end, fuzzy } = parseEventDate(item.date)
            seen.set(key, {
              title: item.title,
              brand: item.brand,
              priority: (item.priority as Priority) ?? 'medium',
              date: item.date,
              parsedDate: start,
              parsedEndDate: end,
              fuzzy,
            })
          }
        }
      }

      setEvents([...seen.values()])
      setLoading(false)
    }
    load()
  }, [])

  const allBrands = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) {
      if (!e.brand || e.brand === '미분류') continue
      for (const b of e.brand.split(/\s*\/\s*/)) {
        const t = b.trim()
        if (t) set.add(t)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [events])

  const brandEventCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of events) {
      for (const b of e.brand.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean)) {
        if (b !== '미분류') counts.set(b, (counts.get(b) ?? 0) + 1)
      }
    }
    return counts
  }, [events])

  const visibleBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase()
    return q ? allBrands.filter(b => b.toLowerCase().includes(q)) : allBrands
  }, [allBrands, brandQuery])

  const filteredEvents = useMemo(() => {
    if (activeBrands.size === 0) return events
    return events.filter(e => {
      const brands = e.brand.split(/\s*\/\s*/).map(b => b.trim())
      return brands.some(b => activeBrands.has(b))
    })
  }, [events, activeBrands])

  // 날짜별 이벤트 맵
  const eventsByDate = useMemo(() => {
    const map = new Map<string, UpcomingEvent[]>()
    for (const e of filteredEvents) {
      if (!e.parsedDate) continue
      const k = dateKey(e.parsedDate)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)

      // 범위 이벤트: 종료일까지 모든 날짜에 추가
      if (e.parsedEndDate) {
        const cur = new Date(e.parsedDate)
        cur.setDate(cur.getDate() + 1)
        while (cur <= e.parsedEndDate) {
          const rk = dateKey(cur)
          if (!map.has(rk)) map.set(rk, [])
          if (!map.get(rk)!.includes(e)) map.get(rk)!.push(e)
          cur.setDate(cur.getDate() + 1)
        }
      }
    }
    return map
  }, [filteredEvents])

  const undatedEvents = useMemo(() => filteredEvents.filter(e => !e.parsedDate), [filteredEvents])

  // 캘린더 그리드 생성
  const calendarDays = useMemo(() => {
    const y = currentMonth.getFullYear()
    const mo = currentMonth.getMonth()
    const firstDow = new Date(y, mo, 1).getDay()
    const lastDate = new Date(y, mo + 1, 0).getDate()
    const days: (Date | null)[] = []
    for (let i = 0; i < firstDow; i++) days.push(null)
    for (let d = 1; d <= lastDate; d++) days.push(new Date(y, mo, d))
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [currentMonth])

  const today = useMemo(() => new Date(), [])

  const prevMonth = () => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
  const goToday  = () => { const n = new Date(); setCurrentMonth(new Date(n.getFullYear(), n.getMonth(), 1)) }

  const toggleBrand = (brand: string) =>
    setActiveBrands(prev => {
      const next = new Set(prev)
      if (next.has(brand)) next.delete(brand)
      else next.add(brand)
      return next
    })

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <CalendarDays size={16} className="animate-pulse text-ink-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* 좌측 브랜드 사이드바 */}
      <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col min-h-0">
        {/* 검색 */}
        <div className="h-12 flex items-center px-3 border-b border-border shrink-0">
          <div className="relative w-full">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
            <input
              value={brandQuery}
              onChange={e => setBrandQuery(e.target.value)}
              placeholder="브랜드 검색"
              className="w-full h-8 rounded-md border border-border bg-background pl-7 pr-2 text-sm outline-none focus:border-lilac-300"
            />
          </div>
        </div>
        {/* 브랜드 목록 */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="px-1 py-2 text-2xs font-semibold text-ink-400 uppercase tracking-wider">
            브랜드 {allBrands.length}
          </div>
          {/* 전체 */}
          <button
            onClick={() => setActiveBrands(new Set())}
            className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
              activeBrands.size === 0 ? 'bg-muted text-foreground' : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 bg-ink-300" />
              <span className="flex-1 truncate text-sm font-semibold">전체</span>
              <span className="text-sm tabular-nums text-ink-400">{events.length}</span>
            </div>
          </button>
          {visibleBrands.map(brand => {
            const active = activeBrands.has(brand)
            const color = brandColor(brand)
            const count = brandEventCounts.get(brand) ?? 0
            return (
              <button
                key={brand}
                onClick={() => toggleBrand(brand)}
                className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                  active ? 'bg-muted text-foreground' : 'text-ink-500 hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="flex-1 truncate text-sm font-semibold">{brand}</span>
                  <span className="text-sm tabular-nums text-ink-400">{count}</span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* 우측 캘린더 */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* 월 내비게이션 */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-foreground w-28 text-center">
            {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
          </span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors">
            <ChevronRight size={15} />
          </button>
          <button
            onClick={goToday}
            className="ml-1 text-sm px-2 py-1 rounded border border-border text-ink-500 hover:bg-muted transition-colors"
          >
            이번 달
          </button>
          <span className="ml-auto text-sm text-ink-400">
            {filteredEvents.filter(e => e.parsedDate).length}건 표시
            {undatedEvents.length > 0 && ` · 날짜 미정 ${undatedEvents.length}건`}
            {activeBrands.size > 0 && <span className="ml-1 text-lilac-500 font-medium">· {activeBrands.size}개 브랜드 필터</span>}
          </span>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 border-b bg-muted/50 shrink-0">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`py-2 text-center text-2xs font-semibold tracking-wide ${
                i === 0 ? 'text-status-late/80' : i === 6 ? 'text-lilac-400' : 'text-ink-400'
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 캘린더 + 미정 목록 */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {/* 날짜 그리드 */}
        <div
          className="grid grid-cols-7"
          style={{ gridAutoRows: `minmax(${calendarDays.length <= 35 ? 118 : 100}px, 1fr)` }}
        >
          {calendarDays.map((day, idx) => {
            const isLastRow = idx >= calendarDays.length - 7
            const isLastCol = idx % 7 === 6

            if (!day) return (
              <div
                key={`empty-${idx}`}
                className={`bg-muted/20 ${!isLastRow ? 'border-b' : ''} ${!isLastCol ? 'border-r' : ''} border-border`}
              />
            )

            const k = dateKey(day)
            const dayEvents = eventsByDate.get(k) ?? []
            const isToday = day.toDateString() === today.toDateString()
            const isSun = day.getDay() === 0
            const isSat = day.getDay() === 6
            const MAX = 3

            return (
              <div
                key={k}
                className={`flex flex-col p-1.5 transition-colors
                  ${!isLastRow ? 'border-b' : ''} ${!isLastCol ? 'border-r' : ''} border-border
                  ${isToday ? 'bg-lilac-50/60' : 'bg-card hover:bg-muted/30'}`}
              >
                {/* 날짜 숫자 */}
                <div className="flex items-center justify-end px-0.5 pb-1 shrink-0">
                  <span className={`text-2xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-lilac-500 text-white font-semibold' :
                    isSun   ? 'text-status-late' :
                    isSat   ? 'text-lilac-400' :
                              'text-ink-500'
                  }`}>
                    {day.getDate()}
                  </span>
                </div>

                {/* 이벤트 칩 */}
                <div className="flex flex-col gap-0.5 px-1 pb-1 overflow-hidden">
                  {dayEvents.slice(0, MAX).map((e, i) => {
                    const color = brandColor(e.brand)
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger
                          render={
                            <div
                              className={`text-xs px-1.5 py-0.5 rounded border-l-2 leading-tight truncate cursor-default font-medium text-foreground ${
                                e.fuzzy ? 'opacity-60' : ''
                              }`}
                              style={{
                                background: `color-mix(in srgb, ${color} 22%, white)`,
                                borderLeftColor: color,
                              }}
                            />
                          }
                        >
                          {e.title}
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <span className="font-medium">{e.brand}</span> · {e.title}
                          {e.fuzzy && <span className="ml-1 opacity-60">({e.date})</span>}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                  {dayEvents.length > MAX && (
                    <button
                      onClick={e => { e.stopPropagation(); setOverflow({ key: k, x: e.clientX, y: e.clientY }) }}
                      className="text-xs text-ink-400 hover:text-foreground px-1.5 py-0.5 text-left hover:bg-muted rounded transition-colors"
                    >
                      +{dayEvents.length - MAX}건 더
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 날짜 미정 */}
        {undatedEvents.length > 0 && (
          <div className="px-4 pt-4 pb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-ink-400 uppercase tracking-wider">날짜 미정</span>
              <span className="text-sm text-ink-300">{undatedEvents.length}건</span>
            </div>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {undatedEvents.map((e, i) => {
                const color = brandColor(e.brand)
                return (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-border last:border-b-0 hover:bg-ink-50">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="flex-1 text-sm text-foreground">{e.title}</span>
                    <span className="text-sm text-ink-400 shrink-0">{e.brand}</span>
                    <span className="text-sm px-1.5 py-0.5 rounded-full bg-ink-100 text-ink-500 shrink-0 font-medium">{e.date}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 날짜 오버플로우 팝오버 */}
      {overflow && (() => {
        const popEvents = eventsByDate.get(overflow.key) ?? []
        const [, mo, d] = overflow.key.split('-').map(Number)
        const label = `${mo + 1}월 ${d}일`
        const left = Math.min(overflow.x, window.innerWidth - 224)
        const top  = overflow.y + 8 + (window.innerHeight - overflow.y < 260 ? -260 : 0)
        return (
          <>
            <div className="fixed inset-0 z-overlay" onClick={() => setOverflow(null)} />
            <div
              className="fixed z-dialog w-56 bg-card border border-border rounded-xl shadow-lg py-2 overflow-hidden"
              style={{ left, top }}
            >
              <div className="flex items-center justify-between px-3 pb-1.5 border-b border-border mb-1">
                <span className="text-sm font-semibold text-foreground">{label}</span>
                <span className="text-sm text-muted-foreground">{popEvents.length}건</span>
              </div>
              <div className="flex flex-col gap-0.5 px-2 max-h-52 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {popEvents.map((e, i) => {
                  const color = brandColor(e.brand)
                  return (
                    <div
                      key={i}
                      className={`text-xs px-1.5 py-0.5 rounded border-l-2 truncate font-medium text-foreground ${e.fuzzy ? 'opacity-60' : ''}`}
                      style={{
                        background: `color-mix(in srgb, ${color} 22%, white)`,
                        borderLeftColor: color,
                      }}
                      title={`[${e.brand}] ${e.title}`}
                    >
                      {e.title}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )
      })()}
      </div>{/* 우측 캘린더 끝 */}
    </div>
  )
}
