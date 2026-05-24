'use client'

import { useMemo, useState, useTransition, useEffect, useRef, useCallback, useReducer } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Search, X, PanelLeftClose, PanelLeftOpen,
  Sparkles, LayoutList, Database, GitBranch,
} from 'lucide-react'

import type { Client, HistoryItem, Tag } from '../_lib/types'

import type { Priority } from '../_lib/types'
import type { GanttCategory } from '@/types'
import { TAG_META, PRIORITY_META } from '../_lib/mock-data'
import { HistorySidebar, type PriorityKey, getCurrentWeekStart } from './history-sidebar'
import { TableView } from './table-view'
import { InsightView } from './insight-view'
import { SummaryView } from './summary-view'
import { RawDataView } from './raw-data-view'
import { TimelineView } from './timeline-view'
import { DailyReportView } from './daily-report-view'
import { HistoryDetailDrawer } from './detail-drawer'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import {
  getOrCreateWorkspace, getBoards, getCategories,
  addTask, addProject, searchProjects,
} from '@/lib/gantt-service'

import type { HistoryPage } from '@/lib/history-service'

interface PageState {
  items: HistoryItem[]
  cursor: string | null
  total: number
  loading: boolean
  hasMore: boolean
}

type PageAction =
  | { type: 'reset' }
  | { type: 'loading' }
  | { type: 'loaded'; page: HistoryPage; append: boolean }

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'reset': return { items: [], cursor: null, total: 0, loading: true, hasMore: false }
    case 'loading': return { ...state, loading: true }
    case 'loaded': return {
      items: action.append ? [...state.items, ...action.page.items] : action.page.items,
      cursor: action.page.nextCursor,
      total: action.page.total,
      loading: false,
      hasMore: !!action.page.nextCursor,
    }
  }
}

const PAGE_INIT: PageState = { items: [], cursor: null, total: 0, loading: false, hasMore: false }

type ViewKey = 'table' | 'timeline' | 'insight' | 'summary' | 'rawdata'

const VALID_VIEWS:     readonly ViewKey[]    = ['table', 'timeline', 'insight', 'summary', 'rawdata']
// 'table' = 타임라인 (구 이름 유지로 URL/state 호환), 'summary' deprecated
const VALID_PRIORITIES: readonly PriorityKey[] = ['all', 'high', 'medium', 'low']
const VALID_TAGS:       readonly Tag[]       = ['issue', 'decision', 'mention', 'schedule']

function parseView(v: string | null): ViewKey        { return VALID_VIEWS.includes(v as ViewKey)             ? (v as ViewKey)        : 'insight'  }
function parsePriority(v: string | null): PriorityKey{ return VALID_PRIORITIES.includes(v as PriorityKey)    ? (v as PriorityKey)    : 'all'      }
function parseTags(v: string | null): Set<Tag> {
  if (!v) return new Set()
  return new Set(v.split(',').filter((t): t is Tag => VALID_TAGS.includes(t as Tag)))
}

interface Props {
  initialClients: Client[]
  initialHistory: HistoryItem[]
}

const VIEW_TABS: { key: ViewKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'insight',  label: '데일리 리포트', icon: Sparkles },
  { key: 'table',    label: '테이블',       icon: LayoutList },
  { key: 'timeline', label: '타임라인',     icon: GitBranch },
  { key: 'rawdata',  label: 'Raw Data',     icon: Database },
]

function presetDates(preset: 'today' | 'week' | 'month' | 'all'): { from: string; to: string } {
  const now = new Date()
  function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const today = fmt(now)
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') {
    const week = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    return { from: fmt(week), to: today }
  }
  if (preset === 'month') {
    const month = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    return { from: fmt(month), to: today }
  }
  return { from: '', to: '' }
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
  const [weekStart,    setWeekStart]    = useState<string>(searchParams.get('week') ?? getCurrentWeekStart())
  const [brandId,      setBrandId]      = useState<string | 'all'>(searchParams.get('brand') ?? 'all')
  const [selectedTags, setSelectedTags] = useState<Set<Tag>>(() => parseTags(searchParams.get('tags')))
  const [priorityKey,  setPriorityKey]  = useState<PriorityKey>(() => parsePriority(searchParams.get('priority')))
  const [authorKey,    setAuthorKey]    = useState<string | 'all'>(searchParams.get('author') ?? 'all')
  const [sidebarOpen,  setSidebarOpen]  = useState(true)
  const [searchQuery,  setSearchQuery]  = useState(searchParams.get('q') ?? '')
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [activeItem,   setActiveItem]   = useState<HistoryItem | null>(null)
  const [dailyBrands,     setDailyBrands]     = useState<Set<string>>(new Set())
  const [dailyTags,       setDailyTags]       = useState<Set<Tag>>(new Set())
  const [dailyPriorities, setDailyPriorities] = useState<Set<Priority>>(new Set())
  const toggleDailyBrand = (b: string) => setDailyBrands(prev => { const next = new Set(prev); next.has(b) ? next.delete(b) : next.add(b); return next })
  const toggleDailyTag = (t: Tag) => setDailyTags(prev => { const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next })
  const toggleDailyPriority = (p: Priority) => setDailyPriorities(prev => { const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next })

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
    if (authorKey !== 'all') sp.set('author', authorKey)
    if (searchQuery.trim()) sp.set('q', searchQuery)
    if (cursor) sp.set('cursor', cursor)
    sp.set('limit', '50')
    const res = await fetch(`/api/history?${sp}`)
    if (!res.ok || id !== fetchIdRef.current) return
    const page = await res.json() as HistoryPage
    pgDispatch({ type: 'loaded', page, append: !!cursor })
  }, [dateFrom, dateTo, brandId, priorityKey, authorKey, searchQuery])

  useEffect(() => {
    if (view === 'table') fetchPage()
  }, [view, fetchPage])

  const handleLoadMore = useCallback(() => {
    if (pg.hasMore && !pg.loading && pg.cursor) fetchPage(pg.cursor)
  }, [pg.hasMore, pg.loading, pg.cursor, fetchPage])

  function todayStr() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // ── 생성 다이얼로그 ────────────────────────────────────────────
  const [createTaskOpen,    setCreateTaskOpen]    = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createSource,      setCreateSource]      = useState<HistoryItem | null>(null)
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
    if (view !== 'table')     p.set('view', view)
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
    const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : Number.MAX_SAFE_INTEGER
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
    if (brandId !== 'all')     list = list.filter(h => h.brand_name === brandId)
    if (priorityKey !== 'all') list = list.filter(h => h.priority === priorityKey)
    if (authorKey !== 'all')   list = list.filter(h => h.author === authorKey)
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
  }, [initialHistory, dateFrom, dateTo, selectedTags, brandId, priorityKey, authorKey, searchQuery])

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
          weekStart={weekStart}
          selectedTags={selectedTags}
          priorityKey={priorityKey}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onPresetClick={applyPreset}
          onWeekChange={setWeekStart}
          onToggleTag={toggleTag}
          onPriorityChange={setPriorityKey}
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

        </div>

        {/* 본문 */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {view === 'rawdata' ? (
            <RawDataView />
          ) : view === 'insight' ? (
            <DailyReportView
              clients={initialClients}
              selectedDate={dateFrom || todayStr()}
              filterBrands={dailyBrands}
              filterTags={dailyTags}
              filterPriorities={dailyPriorities}
            />
          ) : (
            <>
              {/* 필터 칩 바 — 스크롤 밖 고정 */}
              {view !== 'summary' && (
                <div className="shrink-0 px-6 pt-3 bg-card border-b border-ink-150">
                  <div className="h-9 flex items-center gap-2 flex-nowrap overflow-x-auto text-xs text-ink-400 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
                    <span className="shrink-0">
                      {view === 'table'
                        ? <>{pg.total > 0 ? <><b className="text-foreground font-semibold">{pg.total}건</b></> : '로딩 중...'}</>
                        : <>전체 {initialHistory.length}건 중 <b className="text-foreground font-semibold">{filtered.length}건</b> 표시</>
                      }
                    </span>
                    {brandId !== 'all' && (() => {
                      const c = initialClients.find(x => x.name === brandId)
                      return (
                        <FilterChip onClear={() => setBrandId('all')}>
                          {c && <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />}
                          브랜드: {brandId}
                        </FilterChip>
                      )
                    })()}
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

              {view === 'table' && (
                <TableView
                  items={pg.items}
                  clients={initialClients}
                  selectedTags={selectedTags}
                  searchQuery={searchQuery}
                  hasFilters={hasFilters}
                  total={pg.total}
                  hasMore={pg.hasMore}
                  loadingMore={pg.loading}
                  onLoadMore={handleLoadMore}
                  onToggleTag={toggleTag}
                  onSelectBrand={id => setBrandId(brandId === id ? 'all' : id)}
                  onSelectAuthor={a => setAuthorKey(authorKey === a ? 'all' : a)}
                  onOpenItem={setActiveItem}
                  onClearFilters={resetFilters}
                  onCreateTask={handleOpenCreateTask}
                  onCreateProject={handleOpenCreateProject}
                />
              )}
              {view === 'timeline' && (
                <TimelineView
                  clients={initialClients}
                  onSelectBrand={id => setBrandId(brandId === id ? 'all' : id)}
                />
              )}
              {view === 'summary' && (
                <div data-scrolltop className="flex-1 overflow-y-auto">
                  <div className="px-6 pb-5">
                    <SummaryView items={filtered} clients={initialClients} />
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
        onClose={() => { setCreateTaskOpen(false); setCreateSource(null) }}
        initialTitle={createSource?.title ?? ''}
        initialMemo={createSource?.body ?? ''}
        onSearchProjects={q => workspaceId ? searchProjects(workspaceId, q) : Promise.resolve([])}
        onSave={async (fields, projectIds) => {
          if (!workspaceId) return
          await addTask(workspaceId, { ...fields, type: 'mine' }, projectIds)
          setCreateTaskOpen(false)
          setCreateSource(null)
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

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-[3px] rounded-full bg-foreground text-background whitespace-nowrap shrink-0">
      {children}
      <button
        onClick={onClear}
        className="ml-0.5 -mr-0.5 opacity-60 hover:opacity-100 transition-opacity"
        title="필터 해제"
      >
        <X size={10} />
      </button>
    </span>
  )
}

