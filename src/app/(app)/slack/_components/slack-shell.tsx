'use client'

import { useMemo, useState, useTransition, useEffect, useRef, useCallback, useReducer } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

import type { Client, HistoryItem, Tag, Priority, HistoryEditDraft } from '../_lib/types'
import { TAG_META, PRIORITY_META, TAG_KEYS, PRIORITY_KEYS } from '../_lib/constants'
import { TagFilterBadge, PriorityFilterBadge } from './badges'
import { SummarySidebar } from './slack-sidebar'
import { type PriorityKey, getCurrentWeekStart } from './_sidebar-utils'
import { SummaryToolbar } from './slack-toolbar'
import { DailyListView } from './daily-list-view'
import { StatsView } from './stats-view'
import { RawDataView } from './raw-data-view'
import { WeeklyBrandView } from './weekly-brand-view'
import { DailyReportView } from './daily-report-view'
import { IssueTreeView } from './issue-tree-view'
import { ScheduleCalendarView } from './schedule-calendar-view'
import { HistoryDetailDrawer } from './detail-drawer'
import { FilterChip } from './filter-chip'
import {
  PAGE_INIT, pageReducer,
  parsePriority, parseTags, parseView, todayStr,
  type ViewKey,
} from './slack-shell-state'
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

function getTabDefaultDates(v: ViewKey): { from: string; to: string } {
  const now = new Date()
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = fmt(now)
  if (v === 'dailylist' || v === 'weeklylist') {
    return { from: fmt(new Date(now.getTime() - 6 * 86400000)), to: today }
  }
  if (v === 'dailyreport') {
    return { from: today, to: today }
  }
  if (v === 'timeline') {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today }
  }
  return { from: '', to: '' }
}

export function SummaryShell({ initialClients, initialHistory }: Props) {
  const router        = useRouter()
  const pathname      = usePathname()
  const searchParams  = useSearchParams()
  const [, startTransition] = useTransition()

  // URL → 초기 state. 날짜가 URL에 둘 다 없으면 현재 탭 기본값으로 lazy 초기화.
  const initialView = parseView(searchParams.get('view'))
  const [view,         setView]         = useState<ViewKey>(initialView)
  const [dateFrom,     setDateFrom]     = useState<string>(() => {
    const f = searchParams.get('from') ?? '', t = searchParams.get('to') ?? ''
    return (!f && !t) ? getTabDefaultDates(initialView).from : f
  })
  const [dateTo,       setDateTo]       = useState<string>(() => {
    const f = searchParams.get('from') ?? '', t = searchParams.get('to') ?? ''
    return (!f && !t) ? getTabDefaultDates(initialView).to : t
  })
  const weekStart = searchParams.get('week') ?? getCurrentWeekStart()
  const [brandId,      setBrandId]      = useState<string | 'all'>(searchParams.get('brand') ?? 'all')
  const [selectedTags, setSelectedTags] = useState<Set<Tag>>(() => parseTags(searchParams.get('tags')))
  const [priorityKey,  setPriorityKey]  = useState<PriorityKey>(() => parsePriority(searchParams.get('priority')))
  const [authorKey,    setAuthorKey]    = useState<string | 'all'>(searchParams.get('author') ?? 'all')
  const [searchQuery,  setSearchQuery]  = useState(searchParams.get('q') ?? '')
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [activeItem,   setActiveItem]   = useState<HistoryItem | null>(null)
  const [weeklyCount,       setWeeklyCount]       = useState<{ total: number; filtered: number }>({ total: 0, filtered: 0 })
  const handleWeeklyCountChange = useCallback((total: number, filtered: number) => setWeeklyCount({ total, filtered }), [])
  const [weeklyBrandCounts, setWeeklyBrandCounts] = useState<Record<string, number>>({})
  const handleWeeklyBrandsLoaded = useCallback((counts: Record<string, number>) => setWeeklyBrandCounts(counts), [])
  const [weeklyBrands, setWeeklyBrands] = useState<Set<string>>(new Set())
  const toggleWeeklyBrand = useCallback((b: string) => setWeeklyBrands(prev => {
    const next = new Set(prev)
    if (next.has(b)) next.delete(b); else next.add(b)
    return next
  }), [])
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

  const [calendarBrands,     setCalendarBrands]     = useState<Set<string>>(new Set())
  const [calendarBrandList,  setCalendarBrandList]  = useState<string[]>([])
  const [calendarBrandCounts,setCalendarBrandCounts]= useState<Map<string, number>>(new Map())
  const [calendarTotalCount, setCalendarTotalCount] = useState(0)
  const toggleCalendarBrand = useCallback((b: string) => setCalendarBrands(prev => {
    const next = new Set(prev); if (next.has(b)) next.delete(b); else next.add(b); return next
  }), [])
  const handleCalendarBrandsLoaded = useCallback((brands: string[], counts: Map<string, number>, total: number) => {
    setCalendarBrandList(brands); setCalendarBrandCounts(counts); setCalendarTotalCount(total)
  }, [])

  // 날짜가 바뀌면 DailyReport 필터 초기화 (이전 날짜 선택 기준 필터가 잔류하는 버그 방지)
  // render 중 dateFrom 변화 감지 후 동기 초기화 (effect 대비 추가 페인트 없음)
  const [prevDateFrom, setPrevDateFrom] = useState(dateFrom)
  if (prevDateFrom !== dateFrom) {
    setPrevDateFrom(dateFrom)
    setDailyBrands(new Set())
    setDailyTags(new Set())
    setDailyPriorities(new Set())
  }

  const searchRef       = useRef<HTMLDivElement>(null)
  const searchInputRef  = useRef<HTMLInputElement>(null)

  // ── 테이블 뷰 서버 페이지네이션 ────────────────────────────
  const [pg, pgDispatch] = useReducer(pageReducer, PAGE_INIT)
  const fetchIdRef = useRef(0)
  // brandCounts 는 브랜드 필터 제외 집계 → 날짜 범위 내 전체 건수로 활용
  const dailyTotalCount = useMemo(() => {
    const bc = pg.brandCounts
    if (bc && Object.keys(bc).length > 0) return Object.values(bc).reduce((s, c) => s + c, 0)
    return pg.total
  }, [pg.brandCounts, pg.total])

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

  // 탭 전환 핸들러 — 탭별 기본 날짜로 리셋
  const handleViewChange = useCallback((newView: ViewKey) => {
    const { from, to } = getTabDefaultDates(newView)
    setDateFrom(from)
    setDateTo(to)
    setView(newView)
  }, [])

  useEffect(() => {
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
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden"
        style={{ width: 'var(--sidebar-w)' }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
          <h1 className="text-sm font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">슬랙메시지 분석</h1>
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
          brandCounts={pg.brandCounts}
          weeklyBrandCounts={weeklyBrandCounts}
          weeklyBrands={weeklyBrands}
          onToggleWeeklyBrand={toggleWeeklyBrand}
          dailyBrands={dailyBrands}
          dailyTags={dailyTags}
          dailyPriorities={dailyPriorities}
          onToggleDailyBrand={toggleDailyBrand}
          onToggleDailyTag={toggleDailyTag}
          onToggleDailyPriority={toggleDailyPriority}
          calendarBrands={calendarBrands}
          calendarBrandList={calendarBrandList}
          calendarBrandCounts={calendarBrandCounts}
          calendarTotalCount={calendarTotalCount}
          onToggleCalendarBrand={toggleCalendarBrand}
          onClearCalendarBrands={() => setCalendarBrands(new Set())}
        />
      </div>

      {/* ── 메인 ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        <SummaryToolbar
          view={view}
          onViewChange={handleViewChange}
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
            <ScheduleCalendarView
              activeBrands={calendarBrands}
              onToggleBrand={toggleCalendarBrand}
              onBrandsLoaded={handleCalendarBrandsLoaded}
            />
          ) : view === 'timeline' ? (
            <IssueTreeView
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
              {/* 필터 바 — 스크롤 밖 고정 */}
              {view !== 'summary' && (
                <div className="shrink-0 px-4 bg-card border-b border-ink-150">
                  <div className="h-10 flex items-center gap-2 text-sm text-ink-400">
                    {/* 좌측: 건수 + 활성 필터 칩 */}
                    <span className="shrink-0">
                      {view === 'dailylist'
                        ? <>전체 <b className="text-foreground font-semibold">{dailyTotalCount}</b>건{dailyTotalCount !== pg.total && <> 중 <b className="text-foreground font-semibold">{pg.total}</b>건</>}</>
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
                    {authorKey !== 'all' && (
                      <FilterChip onClear={() => setAuthorKey('all')}>
                        작성자: {authorKey}
                      </FilterChip>
                    )}
                    {view !== 'dailylist' && view !== 'weeklylist' && priorityKey !== 'all' && (
                      <FilterChip onClear={() => setPriorityKey('all')}>
                        중요도: {PRIORITY_META[priorityKey as Priority].label}
                      </FilterChip>
                    )}
                    {view !== 'dailylist' && view !== 'weeklylist' && [...selectedTags].map(t => (
                      <FilterChip key={t} onClear={() => toggleTag(t)}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: TAG_META[t].dot }} />
                        {TAG_META[t].label}
                      </FilterChip>
                    ))}

                    {/* 우측: dailylist·weeklylist 공용 태그/중요도 토글 */}
                    {(view === 'dailylist' || view === 'weeklylist') && (
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        {TAG_KEYS.map(t => (
                          <TagFilterBadge
                            key={t}
                            tag={t}
                            active={selectedTags.has(t)}
                            onClick={() => toggleTag(t)}
                            dimmed={selectedTags.size > 0 && !selectedTags.has(t)}
                          />
                        ))}
                        <span className="w-px h-3.5 bg-ink-200 mx-0.5 shrink-0" />
                        {PRIORITY_KEYS.map(p => (
                          <PriorityFilterBadge
                            key={p}
                            priority={p}
                            active={priorityKey === p}
                            onClick={() => setPriorityKey(priorityKey === p ? 'all' : p)}
                            dimmed={priorityKey !== 'all' && priorityKey !== p}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {view === 'dailylist' && (
                <DailyListView
                  items={pg.items}
                  hasFilters={hasFilters}
                  hasMore={pg.hasMore}
                  loadingMore={pg.loading}
                  onLoadMore={handleLoadMore}
                  onCreateTask={dialogs.handleOpenCreateTask}
                  onClearFilters={resetFilters}
                />
              )}
              {view === 'weeklylist' && (
                <WeeklyBrandView
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  brandFilter={weeklyBrands}
                  onSelectBrand={toggleWeeklyBrand}
                  onCountChange={handleWeeklyCountChange}
                  onBrandsLoaded={handleWeeklyBrandsLoaded}
                  selectedTags={selectedTags}
                  priorityKey={priorityKey}
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

