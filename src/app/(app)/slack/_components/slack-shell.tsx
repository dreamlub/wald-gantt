'use client'

import { useMemo, useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

import type { HistoryItem, Tag, Priority } from '../_lib/types'
import { TAG_KEYS, PRIORITY_KEYS } from '../_lib/constants'
import { TagFilterBadge, PriorityFilterBadge } from './badges'
import { SlackSidebar } from './slack-sidebar'
import { type PriorityKey, getCurrentWeekStart } from './_sidebar-utils'
import { SlackToolbar } from './slack-toolbar'
import { DailyListView } from './daily-list-view'
import { RawDataView } from './raw-data-view'
import { WeeklyBrandView } from './weekly-brand-view'
import { DailyReportView } from './daily-report-view'
import { ScheduleCalendarView } from './schedule-calendar-view'
import { IssueTrackerBrandPanel } from './issue-tracker-brand-panel'
import type { BrandTimelineStat } from '@/app/api/brands/timeline/route'
import { FilterChip } from './filter-chip'
import {
  PAGE_INIT, pageReducer, pageStateFromPage,
  parsePriority, parseTags, parseView, todayStr,
  type ViewKey,
} from './slack-shell-state'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { useCreateDialogs } from './use-create-dialogs'
import type { HistoryPage } from '@/lib/history-service'
import { BrandIcon } from '@/components/brand-icon'
import { useBrandProfiles } from '@/hooks/use-brand-profiles'

interface Props {
  initialHistory: HistoryItem[]
  initialPage?: HistoryPage
  initialDateFrom?: string
  initialDateTo?: string
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
  if (v === 'issue-tracker') {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today }
  }
  return { from: '', to: '' }
}

export function SlackShell({ initialHistory, initialPage, initialDateFrom, initialDateTo }: Props) {
  const brandProfiles = useBrandProfiles()
  const router        = useRouter()
  const pathname      = usePathname()
  const searchParams  = useSearchParams()

  // URL → 초기 state. 날짜가 URL에 둘 다 없으면 현재 탭 기본값으로 lazy 초기화.
  const initialView = parseView(searchParams.get('view'))
  const [view,         setView]         = useState<ViewKey>(initialView)
  const [dateFrom,     setDateFrom]     = useState<string>(() => {
    const f = searchParams.get('from') ?? '', t = searchParams.get('to') ?? ''
    return (!f && !t) ? (initialDateFrom ?? getTabDefaultDates(initialView).from) : f
  })
  const [dateTo,       setDateTo]       = useState<string>(() => {
    const f = searchParams.get('from') ?? '', t = searchParams.get('to') ?? ''
    return (!f && !t) ? (initialDateTo ?? getTabDefaultDates(initialView).to) : t
  })
  const weekStart = searchParams.get('week') ?? getCurrentWeekStart()
  const [brandId,      setBrandId]      = useState<string | 'all'>(searchParams.get('brand') ?? 'all')
  const [selectedTags, setSelectedTags] = useState<Set<Tag>>(() => parseTags(searchParams.get('tags')))
  const [priorityKey,  setPriorityKey]  = useState<PriorityKey>(() => parsePriority(searchParams.get('priority')))
  const [authorKey,    setAuthorKey]    = useState<string | 'all'>(searchParams.get('author') ?? 'all')
  const [searchQuery,  setSearchQuery]  = useState(searchParams.get('q') ?? '')
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [timelineStats,     setTimelineStats]     = useState<BrandTimelineStat[]>([])
  const handleTimelineStatsLoaded = useCallback((stats: BrandTimelineStat[]) => setTimelineStats(stats), [])
  const timelineAutoSelectedRef = useRef(false)
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
  const [pg, pgDispatch] = useReducer(pageReducer, initialPage ? pageStateFromPage(initialPage) : PAGE_INIT)
  const skipInitialFetchRef = useRef(!!initialPage)
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
    if (view === 'dailylist') {
      if (skipInitialFetchRef.current) { skipInitialFetchRef.current = false; return }
      fetchPage()
    }
  }, [view, dateFrom, dateTo, fetchPage])

  const handleLoadMore = useCallback(() => {
    if (pg.hasMore && !pg.loading && pg.cursor) fetchPage(pg.cursor)
  }, [pg.hasMore, pg.loading, pg.cursor, fetchPage])

  const dialogs = useCreateDialogs()

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

  // timeline 첫 진입 시 brandId='all'이면 가장 활발한(이슈 보유) 브랜드를 자동 선택 → 빈 화면 방지.
  // ref 가드로 1회만 — 이후 사용자가 'all'로 되돌리면 안내 상태를 그대로 존중.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (view !== 'issue-tracker' || brandId !== 'all' || timelineAutoSelectedRef.current) return
    if (timelineStats.length === 0) return
    const best = [...timelineStats]
      .filter(s => s.issue_count > 0)
      .sort((a, b) => b.issue_count - a.issue_count)[0]
    if (best) {
      timelineAutoSelectedRef.current = true
      setBrandId(best.brand_name)
    }
  }, [view, brandId, timelineStats])
  /* eslint-enable react-hooks/set-state-in-effect */

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

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 사이드바 ─────────────────────────────────────────── */}
      <div
        className="hidden sm:flex shrink-0 border-r bg-muted flex-col overflow-hidden"
        style={{ width: 'var(--sidebar-w)' }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
          <h1 className="text-sm font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">슬랙메시지 분석</h1>
        </div>

        <SlackSidebar
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
          onTimelineStatsLoaded={handleTimelineStatsLoaded}
        />
      </div>

      {/* ── 메인 ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        <SlackToolbar
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
          ) : view === 'issue-tracker' ? (
            <IssueTrackerBrandPanel
              brandId={brandId}
              stats={timelineStats.find(s => s.brand_name === brandId) ?? null}
            />
          ) : view === 'rawdata' ? (
            <RawDataView />
          ) : view === 'dailyreport' ? (
            <DailyReportView
              selectedDate={dateFrom || todayStr()}
              filterBrands={dailyBrands}
              filterTags={dailyTags}
              filterPriorities={dailyPriorities}
            />
          ) : (
            <>
              {/* 필터 바 — 스크롤 밖 고정 */}
              <div className="shrink-0 px-4 bg-card border-b border-ink-150">
                <div className="h-10 flex items-center gap-2 text-sm text-ink-400">
                  {/* 좌측: 건수 + 활성 필터 칩 */}
                  <span className="shrink-0">
                    {view === 'dailylist'
                      ? <>전체 <b className="text-foreground font-semibold">{dailyTotalCount}</b>건{dailyTotalCount !== pg.total && <> 중 <b className="text-foreground font-semibold">{pg.total}</b>건</>}</>
                      : <>전체 <b className="text-foreground font-semibold">{weeklyCount.total}</b>건 중 <b className="text-foreground font-semibold">{weeklyCount.filtered}</b>건</>
                    }
                  </span>
                  {brandId !== 'all' && (
                    <FilterChip onClear={() => setBrandId('all')}>
                      <BrandIcon name={brandId} logoUrl={brandProfiles.get(brandId)?.logo_url} lucideIcon={brandProfiles.get(brandId)?.lucide_icon} size={12} />
                      브랜드: {brandId}
                    </FilterChip>
                  )}
                  {authorKey !== 'all' && (
                    <FilterChip onClear={() => setAuthorKey('all')}>
                      작성자: {authorKey}
                    </FilterChip>
                  )}

                  {/* 우측: dailylist·weeklylist 공용 태그/중요도 토글 */}
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
                </div>
              </div>

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
            </>
          )}
        </div>
      </div>

      {/* 태스크 생성 다이얼로그 */}
      <TaskFormDialog
        open={dialogs.createTaskOpen}
        onClose={dialogs.closeTask}
        initialTitle={dialogs.createSource?.title ?? ''}
        initialMemo={dialogs.createSource?.body ?? ''}
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

