'use client'

import { useMemo, useState, useTransition, useEffect, useRef, useCallback, useReducer } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { PanelLeftClose } from 'lucide-react'

import type { Client, HistoryItem, Tag } from '../_lib/types'

import type { Priority } from '../_lib/types'
import type { GanttCategory } from '@/types'
import { TAG_META, PRIORITY_META } from '../_lib/mock-data'
import { HistorySidebar, type PriorityKey, getCurrentWeekStart } from './history-sidebar'
import { HistoryToolbar } from './history-toolbar'
import { BrandDailyListView } from './brand-daily-list-view'
import { SummaryView } from './summary-view'
import { TimelineView } from './timeline-view'
import { DailyReportView } from './daily-report-view'
import { ThreadTimelineView } from './thread-timeline-view'
import { ScheduleCalendarView } from './schedule-calendar-view'
import { HistoryDetailDrawer } from './detail-drawer'
import { FilterChip } from './filter-chip'
import {
  PAGE_INIT, pageReducer,
  parsePriority, parseTags, parseView, todayStr,
  type ViewKey,
} from './history-shell-state'
import { filterHistoryItems } from '@/lib/history-query-utils'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import {
  getOrCreateWorkspace, getBoards, getCategories,
  addTask, addProject, searchProjects,
} from '@/lib/gantt-service'

import type { HistoryPage } from '@/lib/history-service'
import { brandColor } from '@/lib/history-service'
import { createClient } from '@/lib/supabase/client'

interface Props {
  initialClients: Client[]
  initialHistory: HistoryItem[]
}

export function HistoryShell({ initialClients, initialHistory }: Props) {
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
  const [reportDates,  setReportDates]  = useState<Set<string>>(new Set())
  const reportInitRef = useRef(false)
  // brandId가 'all'일 때 전체 브랜드 목록을 유지 (브랜드 필터 적용 시에도 사이드바에 전체 목록 표시)
  const [allBrandCounts, setAllBrandCounts] = useState<Record<string, number>>({})
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
    sp.set('limit', '200')
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

  // brandId='all' 상태에서 조회된 브랜드 카운트를 캐싱 → 브랜드 선택 후에도 사이드바 목록 유지
  useEffect(() => {
    if (brandId === 'all' && pg.brandCounts && Object.keys(pg.brandCounts).length > 0) {
      setAllBrandCounts(pg.brandCounts)
    }
  }, [pg.brandCounts, brandId])

  // ── Daily Report: 리포트 날짜 목록 조회 + 초기 날짜 자동 설정 ─
  useEffect(() => {
    if (view !== 'dailyreport') return
    if (reportInitRef.current) return
    reportInitRef.current = true
    ;(async () => {
      const sb = createClient()
      const { data } = await sb
        .from('daily_reports')
        .select('report_date')
        .order('report_date', { ascending: false })
      if (!data?.length) return
      setReportDates(new Set(data.map(r => r.report_date as string)))
      // dateFrom이 없거나 오늘 날짜면 → 최신 리포트 날짜로 자동 이동
      setDateFrom(prev => (!prev || prev === todayStr()) ? (data[0].report_date as string) : prev)
      setDateTo(prev => (!prev || prev === todayStr()) ? (data[0].report_date as string) : prev)
    })()
  }, [view])

  // ── 생성 다이얼로그 ────────────────────────────────────────────
  const [createTaskOpen,    setCreateTaskOpen]    = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createSource,      setCreateSource]      = useState<HistoryItem | null>(null)
  const [createTaskPreset,  setCreateTaskPreset]  = useState<{ title: string; memo: string } | null>(null)
  const [workspaceId,       setWorkspaceId]       = useState<string | null>(null)
  const [allCategories,     setAllCategories]     = useState<GanttCategory[]>([])

  async function loadWorkspace() {
    if (workspaceId) return workspaceId
    const ws = await getOrCreateWorkspace()
    setWorkspaceId(ws.id)
    return ws.id
  }

  async function handleOpenCreateTask(item: HistoryItem) {
    setCreateSource(item)
    await loadWorkspace()
    setCreateTaskOpen(true)
  }

  async function handleCreateTaskFromAction(title: string, memo: string) {
    setCreateTaskPreset({ title, memo })
    await loadWorkspace()
    setCreateTaskOpen(true)
  }

  async function handleSaveItem(id: string, updates: { client_id?: string; author?: string | null; priority?: string | null; tags?: string[] }) {
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

  async function handleOpenCreateProject(item: HistoryItem) {
    setCreateSource(item)
    const wsId = await loadWorkspace()
    const boards = await getBoards(wsId)
    const cats = (await Promise.all(boards.map(b => getCategories(b.id)))).flat()
    setAllCategories(cats)
    setCreateProjectOpen(true)
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

  // Daily Report 이전/다음 리포트 날짜 (리포트가 있는 날끼리만 이동)
  const sortedReportDates = useMemo(() => [...reportDates].sort(), [reportDates])
  const reportDateIdx     = sortedReportDates.indexOf(dateFrom)
  const prevReportDate    = reportDateIdx > 0 ? sortedReportDates[reportDateIdx - 1] : null
  const nextReportDate    = reportDateIdx < sortedReportDates.length - 1 ? sortedReportDates[reportDateIdx + 1] : null
  const handleReportDateChange = useCallback((d: string) => { setDateFrom(d); setDateTo(d) }, [])

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
          reportDates={reportDates}
          brandCounts={allBrandCounts}
        />
      </div>

      {/* ── 메인 ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        <HistoryToolbar
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
            <ThreadTimelineView
              dateFrom={dateFrom || undefined}
              dateTo={dateTo || undefined}
              brandFilter={brandId === 'all' ? undefined : brandId}
            />
          ) : view === 'dailyreport' ? (
            <DailyReportView
              selectedDate={dateFrom || todayStr()}
              filterBrands={dailyBrands}
              filterTags={dailyTags}
              filterPriorities={dailyPriorities}
              onCreateTask={handleCreateTaskFromAction}
              prevDate={prevReportDate}
              nextDate={nextReportDate}
              onDateChange={handleReportDateChange}
            />
          ) : (
            <>
              {/* 필터 칩 바 — 스크롤 밖 고정 */}
              {view !== 'summary' && view !== 'dailylist' && (
                <div className="shrink-0 px-6 pt-3 bg-card border-b border-ink-150">
                  <div className="h-9 flex items-center gap-2 flex-nowrap overflow-x-auto text-xs text-ink-400 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
                    <span className="shrink-0">
                      {view === 'weeklylist'
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
                <BrandDailyListView
                  items={pg.items}
                  hasFilters={hasFilters}
                  total={pg.total}
                  hasMore={pg.hasMore}
                  loadingMore={pg.loading}
                  onLoadMore={handleLoadMore}
                  onCreateTask={handleOpenCreateTask}
                  onClearFilters={resetFilters}
                />
              )}
              {view === 'weeklylist' && (
                <TimelineView
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onSelectBrand={id => setBrandId(brandId === id ? 'all' : id)}
                  onCountChange={handleWeeklyCountChange}
                />
              )}
              {view === 'summary' && (
                <div data-scrolltop className="flex-1 overflow-y-auto">
                  <div className="px-6 pb-5">
                    <SummaryView items={filtered} />
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
        onCreateTask={handleOpenCreateTask}
        onCreateProject={handleOpenCreateProject}
        onSaveItem={handleSaveItem}
      />

      {/* 태스크 생성 다이얼로그 */}
      <TaskFormDialog
        open={createTaskOpen}
        onClose={() => { setCreateTaskOpen(false); setCreateSource(null); setCreateTaskPreset(null) }}
        initialTitle={createSource?.title ?? createTaskPreset?.title ?? ''}
        initialMemo={createSource?.body ?? createTaskPreset?.memo ?? ''}
        onSearchProjects={q => workspaceId ? searchProjects(workspaceId, q) : Promise.resolve([])}
        onSave={async (fields, projectIds) => {
          if (!workspaceId) return
          await addTask(workspaceId, { ...fields, type: 'mine' }, projectIds)
          setCreateTaskOpen(false)
          setCreateSource(null)
          setCreateTaskPreset(null)
        }}
      />

      {/* 프로젝트 생성 다이얼로그 */}
      <ProjectFormDialog
        open={createProjectOpen}
        onClose={() => { setCreateProjectOpen(false); setCreateSource(null) }}
        categories={allCategories}
        initialName={createSource?.title ?? ''}
        initialMemo={createSource?.body ?? ''}
        onSave={async (fields) => {
          if (!workspaceId) return
          const cat = allCategories.find(c => c.id === fields.categoryId)
          if (!cat) return
          await addProject(cat.board_id, workspaceId, fields.categoryId, fields.parentId, {
            name: fields.name,
            status: fields.status,
            start_date: fields.start_date,
            end_date: fields.end_date,
            team: fields.team,
            pm: fields.pm,
            priority: fields.priority,
          })
          setCreateProjectOpen(false)
          setCreateSource(null)
        }}
      />
    </div>
  )
}

