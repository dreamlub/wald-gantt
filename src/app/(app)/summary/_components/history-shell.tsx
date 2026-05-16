'use client'

import { useMemo, useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, RefreshCw, X, PanelLeftClose, PanelLeftOpen,
  Table2, ScrollText, Sparkles,
} from 'lucide-react'

import type { Client, HistoryItem, Tag } from '../_lib/types'

import { HistorySidebar, type PriorityKey } from './history-sidebar'
import { TableView } from './table-view'
import { TimelineView } from './timeline-view'
import { SummaryView } from './summary-view'

type ViewKey = 'table' | 'timeline' | 'summary'

interface Props {
  initialClients: Client[]
  initialHistory: HistoryItem[]
}

const VIEW_TABS: { key: ViewKey; label: string; icon: typeof Table2 }[] = [
  { key: 'table',    label: '테이블',   icon: Table2 },
  { key: 'timeline', label: '타임라인', icon: ScrollText },
  { key: 'summary',  label: '요약',     icon: Sparkles },
]

function relativeFromNow(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return '방금'
  if (m < 60)  return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}시간 전`
  const d = Math.floor(h / 24)
  return `${d}일 전`
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function presetDates(preset: 'today' | 'week' | 'month' | 'all'): { from: string; to: string } {
  if (preset === 'all') return { from: '', to: '' }
  const now = new Date()
  const today = dateStr(now)
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week')  return { from: dateStr(new Date(now.getTime() - 6  * 24 * 60 * 60 * 1000)), to: today }
  /* month */              return { from: dateStr(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)), to: today }
}

export function HistoryShell({ initialClients, initialHistory }: Props) {
  const router = useRouter()
  const [isRefreshing, startTransition] = useTransition()

  const [view,         setView]         = useState<ViewKey>('table')
  const [dateFrom,     setDateFrom]     = useState<string>('')
  const [dateTo,       setDateTo]       = useState<string>('')
  const [brandId,      setBrandId]      = useState<string | 'all'>('all')
  const [selectedTags, setSelectedTags] = useState<Set<Tag>>(new Set())
  const [priorityKey,  setPriorityKey]  = useState<PriorityKey>('all')
  const [sidebarOpen,  setSidebarOpen]  = useState(true)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [searchOpen,   setSearchOpen]   = useState(false)
  const searchRef       = useRef<HTMLDivElement>(null)
  const searchInputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { if (searchOpen) searchInputRef.current?.focus() }, [searchOpen])
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!searchRef.current?.contains(e.target as Node) && !searchQuery) setSearchOpen(false)
    }
    if (searchOpen) document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [searchOpen, searchQuery])

  function resetFilters() {
    setDateFrom(''); setDateTo(''); setBrandId('all'); setSelectedTags(new Set())
    setPriorityKey('all'); setSearchQuery('')
  }

  function applyPreset(preset: 'today' | 'week' | 'month' | 'all') {
    const { from, to } = presetDates(preset)
    setDateFrom(from); setDateTo(to)
  }

  function toggleTag(t: Tag) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }

  const filtered = useMemo(() => {
    const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : 0
    const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : Date.now()
    let list = initialHistory.filter(h => {
      const t = new Date(h.occurred_at).getTime()
      return t >= fromMs && t <= toMs
    })
    // 태그: AND — 선택된 모든 태그를 포함해야 함
    if (selectedTags.size > 0) {
      list = list.filter(h => {
        const has = new Set(h.tags ?? [])
        for (const t of selectedTags) if (!has.has(t)) return false
        return true
      })
    }
    if (brandId !== 'all')     list = list.filter(h => h.client_id === brandId)
    if (priorityKey !== 'all') list = list.filter(h => h.priority === priorityKey)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(h =>
        h.title.toLowerCase().includes(q) ||
        (h.body ?? '').toLowerCase().includes(q) ||
        h.channel.toLowerCase().includes(q) ||
        (h.author ?? '').toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  }, [initialHistory, dateFrom, dateTo, selectedTags, brandId, priorityKey, searchQuery])

  const lastCollected = useMemo(() => {
    if (initialHistory.length === 0) return null
    return initialHistory.reduce((latest, h) =>
      h.occurred_at > latest ? h.occurred_at : latest, initialHistory[0].occurred_at
    )
  }, [initialHistory])

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 사이드바 ─────────────────────────────────────────── */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: sidebarOpen ? 240 : 0 }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0 gap-2">
          <h1 className="flex-1 text-xs font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">SUMMARY</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors"
            title="사이드바 닫기"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <HistorySidebar
          clients={initialClients}
          history={initialHistory}
          dateFrom={dateFrom}
          dateTo={dateTo}
          brandId={brandId}
          selectedTags={selectedTags}
          priorityKey={priorityKey}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onPresetClick={applyPreset}
          onBrandChange={setBrandId}
          onToggleTag={toggleTag}
          onPriorityChange={setPriorityKey}
          onReset={resetFilters}
        />
      </div>

      {/* ── 메인 ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* 액션 바 */}
        <div className="h-12 flex items-center border-b bg-card shrink-0 px-4 gap-2">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-ink-400 hover:text-muted-foreground hover:bg-muted transition-colors"
              title="사이드바 열기"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}

          {/* 뷰 탭 */}
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            {VIEW_TABS.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setView(tab.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                    ${view === tab.key
                      ? 'bg-card text-ink-700 shadow-sm'
                      : 'text-muted-foreground hover:text-ink-700'}`}
                >
                  <Icon size={12} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* 검색 */}
          <div ref={searchRef} className="relative flex items-center ml-2">
            {searchOpen || searchQuery ? (
              <div className="relative flex items-center">
                <Search size={12} className="absolute left-2 text-ink-300 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }}
                  placeholder="검색"
                  className="text-[11px] pl-6 pr-6 py-1 border rounded w-40 outline-none focus:ring-1 focus:ring-lilac-300 text-muted-foreground placeholder:text-ink-300"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
                    className="absolute right-1 text-ink-300 hover:text-muted-foreground"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                title="검색"
                className="p-1.5 rounded text-ink-400 hover:text-muted-foreground hover:bg-muted transition-colors"
              >
                <Search size={13} />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {lastCollected && (
              <span className="text-[11px] text-ink-400 font-mono">
                마지막 수집 {relativeFromNow(lastCollected)}
              </span>
            )}
            <button
              onClick={() => startTransition(() => router.refresh())}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-xs font-medium text-white bg-foreground hover:bg-black px-3 py-1.5 rounded transition-colors disabled:opacity-60"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto bg-card">
          <div className="sticky top-0 z-10 bg-card px-6 pt-5">
            <BrandSelector
              clients={initialClients}
              brandId={brandId}
              history={initialHistory}
              onBrandChange={setBrandId}
            />
          </div>

          <div className="px-6 pb-5">
            {view !== 'summary' && (
              <div className="mb-3 text-xs text-ink-400">
                전체 {initialHistory.length}건 중 <b className="text-foreground font-semibold">{filtered.length}건</b> 표시
              </div>
            )}
            {view === 'table'    && <TableView    items={filtered} clients={initialClients} />}
            {view === 'timeline' && <TimelineView items={filtered} clients={initialClients} />}
            {view === 'summary'  && <SummaryView  items={filtered} clients={initialClients} />}
            <div className="h-10" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BrandSelector (상단 모든 브랜드 칩) ───────────────────────
interface BrandSelectorProps {
  clients: Client[]
  history: HistoryItem[]
  brandId: string | 'all'
  onBrandChange: (id: string | 'all') => void
}

function BrandSelector({ clients, history, brandId, onBrandChange }: BrandSelectorProps) {
  const counts = new Map<string, number>()
  for (const h of history) counts.set(h.client_id, (counts.get(h.client_id) ?? 0) + 1)
  const sorted = [...clients].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4 pb-4 border-b border-border">
      <button
        onClick={() => onBrandChange('all')}
        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-[3px] rounded-full border transition-colors whitespace-nowrap
          ${brandId === 'all'
            ? 'bg-foreground text-white border-foreground'
            : 'bg-card text-muted-foreground border-border hover:border-ink-400 hover:text-ink-700'}`}
      >
        전체
        <span className={`text-[10px] ${brandId === 'all' ? 'text-white/70' : 'text-ink-400'}`}>
          {history.length}
        </span>
      </button>
      {sorted.map(c => {
        const count = counts.get(c.id) ?? 0
        const active = brandId === c.id
        return (
          <button
            key={c.id}
            onClick={() => onBrandChange(active ? 'all' : c.id)}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-[3px] rounded-full border transition-colors whitespace-nowrap ${
              active ? 'text-white border-transparent' : 'bg-card text-muted-foreground border-border hover:border-ink-400 hover:text-ink-700'
            }`}
            style={active ? { backgroundColor: c.color, borderColor: c.color } : undefined}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'white' : c.color }} />
            {c.name}
            <span className={`text-[10px] ${active ? 'text-white/70' : 'text-ink-400'}`}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}
