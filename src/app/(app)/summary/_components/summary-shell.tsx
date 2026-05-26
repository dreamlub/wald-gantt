'use client'

import { useMemo, useState, useTransition, useEffect, useRef, useCallback, useReducer } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PanelLeftClose } from 'lucide-react'

import type { Client, HistoryItem, Tag, Priority, HistoryEditDraft } from '../_lib/types'
import { TAG_META, PRIORITY_META } from '../_lib/constants'
import { SummarySidebar } from './summary-sidebar'
import { type PriorityKey, getCurrentWeekStart } from './_sidebar-utils'
import { SummaryToolbar } from './summary-toolbar'
import { DailyListView } from './daily-list-view'
import { StatsView } from './stats-view'
import { RawDataView } from './raw-data-view'
import { WeeklyBrandView } from './weekly-brand-view'
import { DailyReportView } from './daily-report-view'
import { TimelineView } from './timeline-view'
import { ScheduleCalendarView } from './schedule-calendar-view'
import { HistoryDetailDrawer } from './detail-drawer'
import { FilterChip } from './filter-chip'
import {
  PAGE_INIT, pageReducer,
  parsePriority, parseTags, parseView, todayStr,
  type ViewKey,
} from './summary-shell-state'
import { filterHistoryItems } from '@/lib/history-query-utils'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { useCreateDialogs } from './use-create-dialogs'
import type { HistoryPage } from '@/lib/history-service'
import { brandColor } from '@/lib/history-service'

interface Props {
  initialClients: Client[]
  initialHistory: HistoryItem[]
}

export function SummaryShell({ initialClients, initialHistory }: Props) {
  const router        = useRouter()
  const pathname      = usePathname()
  const searchParams  = useSearchParams()
  const [, startTransition] = useTransition()

  // URL → 초기 state
  const [view,         setView]         = useState<ViewKey>(() => parseView(searchParams.get('view')))
  const [dateFrom,     setDateFrom]     = useState<string>(searchParams.get('from') ?? '')
  const [dateTo,       setDateTo]       = useState<string>(searchParams.get('to') ?? '')
  const weekStart = searchParams.get('week') ?? getCurrentWeekStart()
  const [brandId,      setBrandId]      = useState<string | 'all'>(searchParams.get('brand') ?? 'all')
  const [selectedTags, setSelectedTags] = useState<Set<Tag>>(() => parseTags(searchParams.get('tags')))
  const [priorityKey,  setPriorityKey]  = useState<PriorityKey>(() => parsePriority(searchParams.get('priority')))
  const [authorKey,    setAuthorKey]    = useState<string | 'all'>(searchParams.get('author') ?? 'all')
  const [sidebarOpen,  setSidebarOpen]  = useState(true)
  const [searchQuery,  setSearchQuery]  = useState(searchParams.get('q') ?? '')
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [activeItem,   setActiveItem]   = useState<HistoryItem | null>(null)
  const [weeklyCount,     setWeeklyCount]     = useState<{ total: number; filtered: number }>({ total: 0, filtered: 0 })
  const handleWeeklyCountChange = useCallback((total: number, filtered: number) => setWeeklyCount({ total, filtered }), [])
  const [dailyBrands,     setDailyBrands]     = useState<Set<string>>(new Set())
  const [dailyTags,       setDailyTags]       = useState<Set<Tag>>(new Set())
  const [dailyPriorities, setDailyPriorities] = useState<Set<Priority>>(new Set())
  const toggleDailyBrand = (b: string) => setDailyBrands(prev => {
    const next = new Set(prev)
    if (next.has(b)) next.delete(b)
    else next.add(b)
    return next
  })
  const toggleDailyTag = (t: Tag) => setDailyTags(prev => {
    const next = new Set(prev)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    return next
  })
  const toggleDailyPriority = (p: Priority) => setDailyPriorities(prev => {
    const next = new Set(prev)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    return next
  })

  // 날짜가 바뀌면 DailyReport 필터 초기화 (이전 날짜 선택 기준 필터가 잔류하는 버그 방지)
  useEffect(() => {
    setDailyBrands(new Set())
    setDailyTags(new Set())
    setDailyPriorities(new Set())
  }, [dateFrom])

  const searchRef       = useRef<HTMLDivElement>(null)
  const searchInputRef  = useRef<HTMLInputElement>(null)

  // ── 테이블 뷰 서버 페이지네이션 ────────────────────────────
  const [pg, pgDispatch] = useReducer(pageReducer, PAGE_INIT)
  const fetchIdRef = useRef(0)

  const fetchPage = useCallback(async (cursor?: string) => {
    const id = ++fetchIdRef.current
    pgDispatch(cursor ? { type: 'loading' } : { type: 'reset' })
    const sp = new URLSearchParams()
    if (dateFrom) sp.set('from', dateFrom)
    if (dateTo) sp.set('to', dateTo)
    if (brandId !== 'all') sp.set('brand', brandId)
    if (priorityKey !== 'all') sp.set('priority', priorityKey)
    if (selectedTags.size > 0) sp.set('tags', [...selectedTags].join(','))
    if (authorKey !== 'all') sp.set('author', authorKey)
    if (searchQuery.trim()) sp.set('q', searchQuery)
    if (cursor) sp.set('cursor', cursor)
    sp.set('limit', '50')
    const res = await fetch(`/api/history?${sp}`)
    if (!res.ok || id !== fetchIdRef.current) return
    const page = await res.json() as HistoryPage
    pgDispatch({ type: 'loaded', page, append: !!cursor })
  }, [dateFrom, dateTo, brandId, priorityKey, selectedTags, authorKey, searchQuery])

  const tableInitRef = useRef(false)

  useEffect(() => {
    if (view === 'dailylist' && !tableInitRef.current && !dateFrom && !dateTo) {
      tableInitRef.current = true
      const now = new Date()
      const d = new Date(now.getTime() - 6 * 86400000)
      const fmt = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
      setDateFrom(fmt(d))
      setDateTo(fmt(now))
      return
    }
    if (view === 'dailylist') fetchPage()
  }, [view, dateFrom, dateTo, fetchPage])

  const handleLoadMore = useCallback(() => {
    if (pg.hasMore && !pg.loading && pg.cursor) fetchPage(pg.cursor)
  }, [pg.hasMore, pg.loading, pg.cursor, fetchPage])

  const dialogs = useCreateDialogs()

  async function handleSaveItem(id: string, updates: Partial<HistoryEditDraft>) {
    const res = await fetch(`/api/history/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let msg = `저장 실패 (${res.status})`
      try { msg = JSON.parse(text).error ?? msg } catch { /* non-JSON */ }
      throw new Error(msg)
    }
    setActiveItem(prev => prev?.id === id ? { ...prev, ...updates } as HistoryItem : prev)
    startTransition(() => router.refresh())
  }

  // state → URL 동기화
  useEffect(() => {
    const p = new URLSearchParams()
    if (view !== 'dailylist') p.set('view', view)
    if (dateFrom)             p.set('from', dateFrom)
    if (dateTo)               p.set('to', dateTo)
    if (weekStart !== getCurrentWeekStart()) p.set('week', weekStart)
    if (brandId !== 'all')    p.set('brand', brandId)
    if (selectedTags.size > 0) p.set('tags', [...selectedTags].join(','))
    if (priorityKey !== 'all') p.set('priority', priorityKey)
    if (authorKey !== 'all')   p.set('author', authorKey)
    if (searchQuery.trim())   p.set('q', searchQuery)
    const qs = p.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [view, dateFrom, dateTo, weekStart, brandId, selectedTags, priorityKey, authorKey, searchQuery, pathname, router])

  useEffect(() => { if (searchOpen) searchInputRef.current?.focus() }, [searchOpen])
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!searchRef.current?.contains(e.target as Node) && !searchQuery) setSearchOpen(false)
    }
    if (searchOpen) document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [searchOpen, searchQuery])

  const resetFilters = useCallback(() => {
    setDateFrom(''); setDateTo(''); setBrandId('all'); setSelectedTags(new Set())
    setPriorityKey('all'); setAuthorKey('all'); setSearchQuery('')
  }, [])

  const hasFilters = brandId !== 'all' || selectedTags.size > 0 || priorityKey !== 'all'
                  || authorKey !== 'all' || !!dateFrom || !!dateTo || !!searchQuery.trim()

  function toggleTag(t: Tag) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }

  const filtered = useMemo(() => filterHistoryItems(initialHistory, {
    dateFrom, dateTo, selectedTags, brandId, priorityKey, authorKey, searchQuery,
  }), [initialHistory, dateFrom, dateTo, selectedTags, brandId, priorityKey, authorKey, searchQuery])

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 사이드바 ─────────────────────────────────────────── */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: sidebarOpen ? 'var(--sidebar-w)' : 0 }}
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

        <SummarySidebar
          view={view}
          history={initialHistory}
          dateFrom={dateFrom}
          dateTo={dateTo}
          selectedTags={selectedTags}
          priorityKey={priorityKey}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onToggleTag={toggleTag}
          onPriorityChange={setPriorityKey}
          brandId={brandId}
          onBrandChange={setBrandId}
          dailyBrands={dailyBrands}
          dailyTags={dailyTags}
          dailyPriorities={dailyPriorities}
          onToggleDailyBrand={toggleDailyBrand}
          onToggleDailyTag={toggleDailyTag}
          onToggleDailyPriority={toggleDailyPriority}
        />
      </div>

      {/* ── 메인 ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        <SummaryToolbar
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          view={view}
          onViewChange={setView}
          searchRef={searchRef}
          searchInputRef={searchInputRef}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* 본문 */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {view === 'calendar' ? (
            <ScheduleCalendarView />
          ) : view === 'timeline' ? (
            <TimelineView
              dateFrom={dateFrom || undefined}
              dateTo={dateTo || undefined}
              brandFilter={brandId === 'all' ? undefined : brandId}
            />
          ) : view === 'rawdata' ? (
            <RawDataView />
          ) : view === 'dailyreport' ? (
            <DailyReportView
              selectedDate={dateFrom || todayStr()}
              filterBrands={dailyBrands}
              filterTags={dailyTags}
              filterPriorities={dailyPriorities}
              onCreateTask={dialogs.handleCreateTaskFromAction}
            />
          ) : (
            <>
              {/* 필터 칩 바 — 스크롤 밖 고정 */}
              {view !== 'summary' && (
                <div className="shrink-0 px-6 pt-3 bg-card border-b border-ink-150">
                  <div className="h-9 flex items-center gap-2 flex-nowrap overflow-x-auto text-xs text-ink-400 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
                    <span className="shrink-0">
                      {view === 'dailylist'
                        ? <>{pg.loading ? '로딩 중...' : <><b className="text-foreground font-semibold">{pg.total}건</b></>}</>
                        : view === 'weeklylist'
                          ? <>전체 <b className="text-foreground font-semibold">{weeklyCount.total}</b>건 중 <b className="text-foreground font-semibold">{weeklyCount.filtered}</b>건</>
                          : <>전체 {initialHistory.length}건 중 <b className="text-foreground font-semibold">{filtered.length}건</b> 표시</>
                      }
                    </span>
                    {brandId !== 'all' && (
                      <FilterChip onClear={() => setBrandId('all')}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: brandColor(brandId) }} />
                        브랜드: {brandId}
                      </FilterChip>
                    )}
                    {priorityKey !== 'all' && (
                      <FilterChip onClear={() => setPriorityKey('all')}>
                        중요도: {PRIORITY_META[priorityKey as Priority].label}
                      </FilterChip>
                    )}
                    {authorKey !== 'all' && (
                      <FilterChip onClear={() => setAuthorKey('all')}>
                        작성자: {authorKey}
                      </FilterChip>
                    )}
                    {[...selectedTags].map(t => (
                      <FilterChip key={t} onClear={() => toggleTag(t)}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: TAG_META[t].dot }} />
                        {TAG_META[t].label}
                      </FilterChip>
                    ))}
                  </div>
                </div>
              )}

              {view === 'dailylist' && (
                <DailyListView
                  items={pg.items}
                  hasFilters={hasFilters}
                  total={pg.total}
                  hasMore={pg.hasMore}
                  loadingMore={pg.loading}
                  brandCounts={pg.brandCounts}
                  activeBrand={brandId === 'all' ? null : brandId}
                  onLoadMore={handleLoadMore}
                  onSelectBrand={id => setBrandId(brandId === id ? 'all' : id)}
                  onCreateTask={dialogs.handleOpenCreateTask}
                  onClearFilters={resetFilters}
                />
              )}
              {view === 'weeklylist' && (
                <WeeklyBrandView
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onSelectBrand={id => setBrandId(brandId === id ? 'all' : id)}
                  onCountChange={handleWeeklyCountChange}
                />
              )}
              {view === 'summary' && (
                <div data-scrolltop className="flex-1 overflow-y-auto">
                  <div className="px-6 pb-5">
                    <StatsView items={filtered} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 상세 drawer */}
      <HistoryDetailDrawer
        open={!!activeItem}
        item={activeItem}
        clients={initialClients}
        onClose={() => setActiveItem(null)}
        onCreateTask={dialogs.handleOpenCreateTask}
        onCreateProject={dialogs.handleOpenCreateProject}
        onSaveItem={handleSaveItem}
      />

      {/* 태스크 생성 다이얼로그 */}
      <TaskFormDialog
        open={dialogs.createTaskOpen}
        onClose={dialogs.closeTask}
        initialTitle={dialogs.createSource?.title ?? dialogs.createTaskPreset?.title ?? ''}
        initialMemo={dialogs.createSource?.body ?? dialogs.createTaskPreset?.memo ?? ''}
        onSearchProjects={dialogs.onSearchProjects}
        onSave={dialogs.saveTask}
      />

      {/* 프로젝트 생성 다이얼로그 */}
      <ProjectFormDialog
        open={dialogs.createProjectOpen}
        onClose={dialogs.closeProject}
        categories={dialogs.allCategories}
        initialName={dialogs.createSource?.title ?? ''}
        initialMemo={dialogs.createSource?.body ?? ''}
        onSave={dialogs.saveProject}
      />
    </div>
  )
}

