'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { Plus, Search, X, AlertCircle, CheckSquare, FileText, MessageSquare, Lightbulb } from 'lucide-react'

type EntryType = 'issue' | 'decision' | 'task' | 'doc' | 'slack'

interface HistoryEntry {
  id: string
  type: EntryType
  brandId: string
  tag?: string
  title: string
  description: string
  date: string  // YYYY-MM-DD
  authors: string[]
  status?: { label: string; color: 'red' | 'amber' | 'green' | 'blue' | 'purple' }
}

interface Brand {
  id: string
  name: string
  englishName?: string
  color: string
}

// ── 타입 메타 ────────────────────────────────────────────────────
const TYPE_META: Record<EntryType, { label: string; dot: string; chipBg: string; chipText: string; icon: typeof AlertCircle }> = {
  issue:    { label: '이슈',     dot: '#ef4444', chipBg: 'bg-red-50',     chipText: 'text-red-500',     icon: AlertCircle },
  decision: { label: '결정사항', dot: '#f59e0b', chipBg: 'bg-amber-50',   chipText: 'text-amber-600',   icon: Lightbulb },
  task:     { label: '태스크',   dot: '#10b981', chipBg: 'bg-emerald-50', chipText: 'text-emerald-600', icon: CheckSquare },
  doc:      { label: '문서',     dot: '#3b82f6', chipBg: 'bg-blue-50',    chipText: 'text-blue-500',    icon: FileText },
  slack:    { label: '슬랙',     dot: '#a855f7', chipBg: 'bg-purple-50',  chipText: 'text-purple-600',  icon: MessageSquare },
}

const STATUS_STYLES: Record<NonNullable<HistoryEntry['status']>['color'], string> = {
  red:    'bg-red-50 text-red-500 border-red-100',
  amber:  'bg-amber-50 text-amber-600 border-amber-100',
  green:  'bg-emerald-50 text-emerald-600 border-emerald-100',
  blue:   'bg-blue-50 text-blue-500 border-blue-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
}

// ── 목 데이터 (DB 연결 시 교체) ─────────────────────────────────
const BRANDS: Brand[] = [
  { id: 'mammoth',  name: '매머드커피',  englishName: 'Mammoth Coffee', color: '#fb923c' },
  { id: 'paik',     name: '빽다방',                                     color: '#22c55e' },
  { id: 'tenpct',   name: '텐퍼센트',                                   color: '#a855f7' },
  { id: 'derater',  name: '더래터',                                     color: '#f43f5e' },
  { id: 'monster',  name: '몬스터커피',                                 color: '#ec4899' },
  { id: 'snbi',     name: 'SNBI',                                       color: '#06b6d4' },
]

const ENTRIES: HistoryEntry[] = [
  {
    id: 'e1', type: 'issue', brandId: 'mammoth', tag: '#mammoth-dx',
    title: 'POS 스탬프 적립 오류 — 멤버십 연동 시 중복 적립 발생',
    description: '동대문구청점 POS QC 중 발견. 멤버십 카드 + 앱 동시 스캔 시 스탬프 2회 적립되는 버그. 개발팀 핫픽스 요청.',
    date: '2026-05-14', authors: ['최정규', '박성진'],
    status: { label: '미해결', color: 'red' },
  },
  {
    id: 'e2', type: 'decision', brandId: 'mammoth', tag: 'Outline',
    title: 'AppFit/매머드 주문 앱 리뉴얼 — 디자인 시스템 Deep Navy 방향 확정',
    description: '클라이언트 3차 미팅에서 최종 확정. UI 컴포넌트 라이브러리 기준 Figma 공유 완료. 개발 착수 6/1 예정.',
    date: '2026-05-10', authors: ['최정규'],
    status: { label: '확정', color: 'amber' },
  },
  {
    id: 'e3', type: 'task', brandId: 'mammoth', tag: 'Tool',
    title: '스탬프 정책 변경안 최종 문서화 완료',
    description: '기존 10개 → 신규 12개 적립 정책. POS 반영 일정 5/20 배포 확정.',
    date: '2026-05-08', authors: ['신두화'],
  },
  {
    id: 'e4', type: 'slack', brandId: 'mammoth', tag: '#mammoth-dx',
    title: '선불카드 2.2% 수수료 협의 — 매머드 측 재검토 요청',
    description: 'HPS 선불카드 수수료율 관련 매머드 본사 재무팀 이의 제기. 5월 초 재미팅 필요.',
    date: '2026-04-28', authors: ['황종목'],
  },
  {
    id: 'e5', type: 'issue', brandId: 'mammoth', tag: '#mammoth-dx',
    title: 'POS 선결제 기능 — 타임아웃 오류 재발',
    description: '3월 핫픽스 이후 동일 증상 재발. 결제 서버 응답 지연 시 UI 멈춤 현상. 개발팀 원인 재분석 중.',
    date: '2026-04-21', authors: ['최정규'],
    status: { label: '재발', color: 'red' },
  },
]

// ── 유틸 ─────────────────────────────────────────────────────────
function formatDate(d: string): string {
  const [, m, day] = d.split('-').map(Number)
  return `${m}월 ${day}일`
}
function monthKey(d: string): string {
  const [y, m] = d.split('-')
  return `${y}년 ${parseInt(m)}월`
}
function authorInitial(name: string): string {
  return name.slice(0, 1)
}
function authorColor(name: string): string {
  const colors = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#3b82f6', '#a855f7', '#14b8a6', '#f97316']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return colors[h % colors.length]
}

// ── 페이지 ───────────────────────────────────────────────────────
export default function TimelinePage() {
  const [selectedBrandId, setSelectedBrandId] = useState<string>('mammoth')
  const [filter, setFilter] = useState<'all' | EntryType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!searchRef.current?.contains(e.target as Node) && !searchQuery) setSearchOpen(false)
    }
    if (searchOpen) document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [searchOpen, searchQuery])

  const brandCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of ENTRIES) map.set(e.brandId, (map.get(e.brandId) ?? 0) + 1)
    return map
  }, [])

  const selectedBrand = BRANDS.find(b => b.id === selectedBrandId)

  const brandEntries = useMemo(() => {
    let list = ENTRIES.filter(e => e.brandId === selectedBrandId)
    if (filter !== 'all') list = list.filter(e => e.type === filter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.tag ?? '').toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => a.date < b.date ? 1 : -1)
  }, [selectedBrandId, filter, searchQuery])

  const stats = useMemo(() => {
    const all = ENTRIES.filter(e => e.brandId === selectedBrandId)
    return {
      openIssues: all.filter(e => e.type === 'issue' && e.status?.color === 'red').length,
      decisions:  all.filter(e => e.type === 'decision').length,
      tasks:      all.filter(e => e.type === 'task').length,
      docs:       all.filter(e => e.type === 'doc').length,
    }
  }, [selectedBrandId])

  // 월별 그룹
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, HistoryEntry[]>()
    for (const e of brandEntries) {
      const key = monthKey(e.date)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(e)
    }
    return Array.from(groups.entries())
  }, [brandEntries])

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 좌측 사이드바: 브랜드 리스트 ─────────────────────── */}
      <div className="shrink-0 w-60 border-r bg-stone-50 flex flex-col overflow-hidden">
        <div className="h-12 flex items-center px-4 border-b bg-white shrink-0">
          <h1 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">브랜드</h1>
        </div>
        <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">
          {BRANDS.map(brand => {
            const count = brandCounts.get(brand.id) ?? 0
            const active = selectedBrandId === brand.id
            return (
              <button
                key={brand.id}
                onClick={() => setSelectedBrandId(brand.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors
                  ${active
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: brand.color }} />
                <span className="flex-1 text-left truncate">{brand.name}</span>
                <span className="text-[10px] text-gray-400">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 메인 영역 ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* 액션 바 — Task 페이지와 동일 패턴 */}
        <div className="flex items-center border-b bg-white shrink-0 px-4 py-2 gap-2">
          {selectedBrand && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedBrand.color }} />
              <span className="text-base font-semibold text-gray-800">{selectedBrand.name}</span>
              {selectedBrand.englishName && (
                <span className="text-xs text-gray-400">{selectedBrand.englishName}</span>
              )}
            </div>
          )}
          <div className="flex-1" />

          {/* 타입 필터 — Task assignee 필터칩 스타일 */}
          <div className="flex items-center gap-1">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>전체</FilterChip>
            {(Object.keys(TYPE_META) as EntryType[]).map(t => (
              <FilterChip
                key={t}
                active={filter === t}
                color={TYPE_META[t].dot}
                onClick={() => setFilter(t)}
              >
                {TYPE_META[t].label}
              </FilterChip>
            ))}
          </div>

          {/* 검색 — toggle 펼침 (Task/Gantt 패턴) */}
          <div ref={searchRef} className="relative flex items-center">
            {searchOpen || searchQuery ? (
              <div className="relative flex items-center">
                <Search size={12} className="absolute left-2 text-gray-300 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }}
                  placeholder="이슈, 결정사항 검색"
                  className="text-[11px] pl-6 pr-6 py-1 border rounded w-44 outline-none focus:ring-1 focus:ring-indigo-300 text-gray-600 placeholder:text-gray-300"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
                    className="absolute right-1 text-gray-300 hover:text-gray-500"
                    title="지우기"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                title="검색"
                className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Search size={13} />
              </button>
            )}
          </div>

          <button className="flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded transition-colors">
            <Plus size={13} /> 기록 추가
          </button>
        </div>

        {/* 본문 — 스크롤 */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 max-w-5xl">
            {selectedBrand && (
              <>
                {/* 통계 카드 */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  <StatCard value={stats.openIssues} label="미해결 이슈" color="text-red-500" />
                  <StatCard value={stats.decisions}  label="결정사항"    color="text-amber-500" />
                  <StatCard value={stats.tasks}      label="태스크"      color="text-emerald-500" />
                  <StatCard value={stats.docs}       label="문서"        color="text-blue-500" />
                </div>

                {/* 타임라인 */}
                {groupedEntries.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 text-sm">
                    {searchQuery ? '검색 결과가 없어요' : '히스토리가 없어요'}
                  </div>
                ) : (
                  <div className="relative">
                    {/* 좌측 세로 라인 */}
                    <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-200" />

                    {groupedEntries.map(([month, entries]) => (
                      <div key={month} className="mb-6">
                        <div className="flex items-center gap-2 mb-3 ml-6">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{month}</span>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>
                        <div className="space-y-3">
                          {entries.map(entry => (
                            <EntryCard key={entry.id} entry={entry} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 보조 컴포넌트 ────────────────────────────────────────────────

function FilterChip({ children, active, onClick, color }: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap
        ${active
          ? 'text-white border-transparent'
          : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
      style={active && color ? { backgroundColor: color, borderColor: color } : active ? { backgroundColor: '#1f2937', borderColor: '#1f2937' } : {}}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? 'white' : color }} />}
      {children}
    </button>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function EntryCard({ entry }: { entry: HistoryEntry }) {
  const meta = TYPE_META[entry.type]
  const Icon = meta.icon
  return (
    <div className="relative pl-8">
      {/* 타임라인 점 */}
      <span
        className="absolute left-0.5 top-4 w-2 h-2 rounded-full ring-4 ring-white"
        style={{ backgroundColor: meta.dot }}
      />
      <div className="bg-white border border-gray-100 rounded-lg p-4 hover:border-gray-200 transition-colors">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-2">
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${meta.chipBg} ${meta.chipText}`}>
                <Icon size={10} />
                {meta.label}
              </span>
              {entry.tag && (
                <span className="text-[10px] text-gray-400">{entry.tag}</span>
              )}
            </div>
            <div className="text-sm font-semibold text-gray-800 mb-1">{entry.title}</div>
            <div className="text-xs text-gray-500 leading-relaxed">{entry.description}</div>
            <div className="flex items-center gap-2 mt-3">
              {entry.authors.map(name => (
                <div key={name} className="flex items-center gap-1">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                    style={{ backgroundColor: authorColor(name) }}
                  >
                    {authorInitial(name)}
                  </div>
                  <span className="text-[11px] text-gray-500">{name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <span className="text-[11px] text-gray-400 whitespace-nowrap tabular-nums">{formatDate(entry.date)}</span>
            {entry.status && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_STYLES[entry.status.color]}`}>
                {entry.status.label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
