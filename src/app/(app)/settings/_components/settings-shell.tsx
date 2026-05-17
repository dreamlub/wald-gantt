'use client'

import { useState, useEffect } from 'react'
import {
  User, Link2, Monitor, Database, Layers,
  LogOut, CheckCircle2, AlertCircle, Sun, Moon, Laptop,
  Download, ChevronRight, Plus, BookOpen, Trash2, GripVertical,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import type { Client } from '../../summary/_lib/types'
import { useVaultHandle } from '@/hooks/use-vault-handle'
import { getPathPattern, setPathPattern } from '@/lib/daily-note'
import { BrandDrawer } from './brand-drawer'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Section = 'account' | 'integrations' | 'display' | 'brands' | 'weekly' | 'data'

type WeeklySource = {
  id: string
  workspace_id: string
  label: string
  collection_id: string
  sort_order: number
}

const NAV: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: 'account',      label: '계정',        icon: User },
  { key: 'integrations', label: '연동',        icon: Link2 },
  { key: 'display',      label: '화면',        icon: Monitor },
  { key: 'brands',       label: '브랜드',      icon: Layers },
  { key: 'weekly',       label: 'Weekly 연동', icon: BookOpen },
  { key: 'data',         label: '데이터',      icon: Database },
]

const THEME_OPTIONS = [
  { value: 'light',  label: '라이트', icon: Sun },
  { value: 'dark',   label: '다크',   icon: Moon },
  { value: 'system', label: '시스템', icon: Laptop },
] as const

const DEFAULT_VIEW_KEYS: { key: string; label: string; options: string[] }[] = [
  { key: 'wald.tasks.view',  label: '태스크',   options: ['list', 'kanban', 'gantt'] },
  { key: 'wald.gantt.view',  label: '간트',     options: ['gantt'] },
  { key: 'wald.summary.view', label: '서머리',  options: ['table', 'timeline', 'insight'] },
]

const VIEW_LABELS: Record<string, string> = {
  list: '리스트', kanban: '칸반', gantt: '간트',
  table: '테이블', timeline: '타임라인', insight: '인사이트',
}

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <h3 className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-foreground">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

interface Props {
  userEmail: string
  clients: Client[]
  calendarConnected: boolean
  initialWeeklySources: WeeklySource[]
  workspaceId: string
}

export function SettingsShell({ userEmail, clients, calendarConnected, initialWeeklySources, workspaceId }: Props) {
  const searchParams = useSearchParams()
  const initialSection = (searchParams.get('section') as Section | null) ?? 'account'
  const [section, setSection] = useState<Section>(initialSection)
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  const { handle: vaultHandle, status: vaultStatus, connect: vaultConnect, requestPermission: vaultRequestPermission, disconnect: vaultDisconnect } = useVaultHandle()
  const [vaultPattern, setVaultPattern] = useState('')
  useEffect(() => { setVaultPattern(getPathPattern()) }, [])
  const saveVaultPattern = (v: string) => { const p = v.trim() || 'Daily Notes/YYYY-MM-DD'; setVaultPattern(p); setPathPattern(p) }

  const [brands, setBrands] = useState<Client[]>(clients)
  const [drawerTarget, setDrawerTarget] = useState<Client | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleSaveBrand = (brand: Client, isNew: boolean) => {
    if (isNew) {
      setBrands(prev => [...prev, brand])
    } else {
      setBrands(prev => prev.map(b => b.id === brand.id ? brand : b))
    }
  }
  const handleDeleteBrand = (id: string) => setBrands(prev => prev.filter(b => b.id !== id))

  const openDrawer = (brand: Client | null) => { setDrawerTarget(brand); setDrawerOpen(true) }

  const [weeklySources, setWeeklySources] = useState<WeeklySource[]>(initialWeeklySources)
  const [weeklyForm, setWeeklyForm] = useState({ label: '', collection_id: '' })
  const [weeklyPending, setWeeklyPending] = useState(false)

  const [defaultViews, setDefaultViews] = useState<Record<string, string>>(() =>
    Object.fromEntries(DEFAULT_VIEW_KEYS.map(({ key, options }) => [key, options[0]]))
  )

  useEffect(() => {
    setDefaultViews(
      Object.fromEntries(DEFAULT_VIEW_KEYS.map(({ key, options }) => [key, localStorage.getItem(key) ?? options[0]]))
    )
  }, [])

  const setDefaultView = (key: string, value: string) => {
    setDefaultViews(prev => ({ ...prev, [key]: value }))
    localStorage.setItem(key, value)
    toast.success('저장되었습니다.')
  }

  const handleLogout = async () => {
    const sb = createClient()
    await sb.auth.signOut()
    router.push('/login')
  }

  const handleCalendarConnect = () => { window.location.href = '/api/calendar/auth' }
  const handleCalendarDisconnect = async () => {
    try {
      await fetch('/api/calendar/disconnect', { method: 'POST' })
      toast.success('Google 캘린더 연동을 해제했습니다.')
      router.refresh()
    } catch {
      toast.error('연동 해제에 실패했습니다.')
    }
  }

  const addWeeklySource = async () => {
    const label = weeklyForm.label.trim()
    const collection_id = weeklyForm.collection_id.trim()
    if (!label || !collection_id || !workspaceId) return
    setWeeklyPending(true)
    const maxOrder = weeklySources.reduce((m, s) => Math.max(m, s.sort_order), -1)
    const optimistic: WeeklySource = { id: crypto.randomUUID(), workspace_id: workspaceId, label, collection_id, sort_order: maxOrder + 10 }
    setWeeklySources(prev => [...prev, optimistic])
    setWeeklyForm({ label: '', collection_id: '' })
    try {
      const sb = createClient()
      const { data, error } = await sb.from('weekly_sources').insert({ workspace_id: workspaceId, label, collection_id, sort_order: maxOrder + 10 }).select().single()
      if (error) throw error
      setWeeklySources(prev => prev.map(s => s.id === optimistic.id ? data as WeeklySource : s))
      toast.success('추가되었습니다.')
    } catch {
      setWeeklySources(prev => prev.filter(s => s.id !== optimistic.id))
      toast.error('추가에 실패했습니다.')
    } finally {
      setWeeklyPending(false)
    }
  }

  const deleteWeeklySource = async (id: string) => {
    const rollback = weeklySources
    setWeeklySources(prev => prev.filter(s => s.id !== id))
    try {
      const sb = createClient()
      const { error } = await sb.from('weekly_sources').delete().eq('id', id)
      if (error) throw error
      toast.success('삭제되었습니다.')
    } catch {
      setWeeklySources(rollback)
      toast.error('삭제에 실패했습니다.')
    }
  }

  const sensors = useSensors(useSensor(PointerSensor))

  const handleWeeklyDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = weeklySources.findIndex(s => s.id === active.id)
    const newIndex = weeklySources.findIndex(s => s.id === over.id)
    const reordered = arrayMove(weeklySources, oldIndex, newIndex).map((s, i) => ({ ...s, sort_order: i * 10 }))
    setWeeklySources(reordered)
    const sb = createClient()
    await Promise.all(reordered.map(s => sb.from('weekly_sources').update({ sort_order: s.sort_order }).eq('id', s.id)))
  }

  const SECTION_TITLE: Record<Section, string> = {
    account:      '계정',
    integrations: '연동',
    display:      '화면 설정',
    brands:       '브랜드 관리',
    weekly:       'Weekly 문서 연동',
    data:         '데이터',
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 사이드바 */}
      <aside className="w-48 shrink-0 border-r bg-muted flex flex-col overflow-hidden">
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
          <h2 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Settings</h2>
        </div>
        <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`sidebar-btn ${section === key ? 'sidebar-btn-active' : ''}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </aside>

      {/* 본문 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="h-12 flex items-center px-6 border-b bg-card shrink-0">
          <span className="text-xs font-semibold text-foreground">{SECTION_TITLE[section]}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3 bg-background">

          {/* ── 계정 ── */}
          {section === 'account' && (
            <>
              <SettingCard title="프로필">
                <Row label="이메일">
                  <span className="text-xs text-muted-foreground">{userEmail}</span>
                </Row>
              </SettingCard>
              <SettingCard title="세션">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-1.5 rounded border border-border text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <LogOut size={13} />
                  로그아웃
                </button>
              </SettingCard>
            </>
          )}

          {/* ── 연동 ── */}
          {section === 'integrations' && (
            <>
              <SettingCard title="Google 캘린더">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {calendarConnected ? (
                      <CheckCircle2 size={13} className="text-mint-500" />
                    ) : (
                      <AlertCircle size={13} className="text-ink-400" />
                    )}
                    <span className="text-xs text-foreground">
                      {calendarConnected ? '연동됨' : '연동 안됨'}
                    </span>
                  </div>
                  {calendarConnected ? (
                    <button
                      onClick={handleCalendarDisconnect}
                      className="text-[11px] text-ink-400 hover:text-status-late transition-colors"
                    >
                      연동 해제
                    </button>
                  ) : (
                    <button
                      onClick={handleCalendarConnect}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-foreground text-background text-[11px] font-medium hover:opacity-80 transition-opacity"
                    >
                      Google 연동
                    </button>
                  )}
                </div>
              </SettingCard>

              <SettingCard title="Obsidian Vault">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {vaultStatus === 'connected' ? (
                      <CheckCircle2 size={13} className="text-mint-500" />
                    ) : (
                      <AlertCircle size={13} className={vaultStatus === 'needs-permission' ? 'text-status-warn' : 'text-ink-400'} />
                    )}
                    <span className="text-xs text-foreground">
                      {vaultStatus === 'loading'          ? '확인 중…' :
                       vaultStatus === 'connected'        ? `연결됨 — ${vaultHandle?.name}` :
                       vaultStatus === 'needs-permission' ? `권한 만료 — ${vaultHandle?.name}` :
                       '연결 안됨'}
                    </span>
                  </div>
                  {vaultStatus === 'connected' && (
                    <button onClick={vaultDisconnect} className="text-[11px] text-ink-400 hover:text-status-late transition-colors">연결 해제</button>
                  )}
                  {vaultStatus === 'needs-permission' && (
                    <button onClick={vaultRequestPermission} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-foreground text-background text-[11px] font-medium hover:opacity-80 transition-opacity">권한 허용</button>
                  )}
                  {vaultStatus === 'disconnected' && (
                    <button onClick={vaultConnect} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-foreground text-background text-[11px] font-medium hover:opacity-80 transition-opacity">Vault 연결</button>
                  )}
                </div>
                {vaultStatus === 'connected' && (
                  <Row label="경로 패턴">
                    <input
                      value={vaultPattern}
                      onChange={e => setVaultPattern(e.target.value)}
                      onBlur={e => saveVaultPattern(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveVaultPattern(vaultPattern) }}
                      placeholder="Daily Notes/YYYY-MM-DD"
                      className="w-48 bg-background border border-border rounded-sm px-2 py-1 text-[11px] outline-none focus:border-lilac-400 transition-colors"
                    />
                  </Row>
                )}
                <p className="text-[10px] text-ink-400">* Chrome / Edge 전용 (File System Access API)</p>
              </SettingCard>

              <SettingCard title="Slack 채널 → 브랜드 매핑">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Slack 채널명과 클라이언트 브랜드를 연결합니다.<br />
                  슬랙 수집 시 자동으로 매핑됩니다.
                </p>
                {clients.length === 0 ? (
                  <p className="text-xs text-ink-400">클라이언트가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {clients.map(c => (
                      <div key={c.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="text-xs font-medium text-foreground w-24 shrink-0 truncate">{c.name}</span>
                        <input
                          type="text"
                          placeholder="#채널명"
                          defaultValue=""
                          className="flex-1 text-[11px] bg-background border border-border rounded px-2 py-1 text-foreground placeholder:text-ink-300 focus:outline-none focus:border-lilac-300 opacity-50 cursor-not-allowed"
                          disabled
                        />
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-ink-400">* 채널 매핑 저장 기능은 준비 중입니다.</p>
              </SettingCard>
            </>
          )}

          {/* ── 화면 ── */}
          {section === 'display' && (
            <>
              <SettingCard title="테마">
                <div className="flex items-center gap-1.5">
                  {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] font-medium transition-colors ${
                        theme === value
                          ? 'border-lilac-400 bg-lilac-50 text-lilac-600'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                </div>
                {theme === 'dark' && (
                  <p className="text-[10px] text-ink-400">
                    * 다크 모드는 일부 커스텀 색상이 아직 완전히 지원되지 않습니다.
                  </p>
                )}
              </SettingCard>

              <SettingCard title="페이지별 기본 뷰">
                <div className="space-y-3">
                  {DEFAULT_VIEW_KEYS.map(({ key, label, options }) => (
                    <Row key={key} label={label}>
                      <div className="flex items-center gap-1">
                        {options.map(opt => (
                          <button
                            key={opt}
                            onClick={() => setDefaultView(key, opt)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                              defaultViews[key] === opt
                                ? 'bg-foreground text-background'
                                : 'border border-border text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {VIEW_LABELS[opt] ?? opt}
                          </button>
                        ))}
                      </div>
                    </Row>
                  ))}
                </div>
              </SettingCard>
            </>
          )}

          {/* ── 브랜드 ── */}
          {section === 'brands' && (
            <>
              <div className="flex items-center justify-end">
                <button
                  onClick={() => openDrawer(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-foreground text-background text-[11px] font-medium hover:opacity-80 transition-opacity"
                >
                  <Plus size={12} /> 브랜드 추가
                </button>
              </div>
              {brands.length === 0 ? (
                <p className="text-xs text-ink-400 py-8 text-center">등록된 브랜드가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {brands.map(b => (
                    <button
                      key={b.id}
                      onClick={() => openDrawer(b)}
                      className="text-left bg-card border border-border rounded-lg p-4 hover:border-lilac-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                        <span className="text-xs font-semibold text-foreground truncate">{b.name}</span>
                      </div>
                      {b.name_en && (
                        <div className="text-[11px] text-muted-foreground mb-1.5 truncate">{b.name_en}</div>
                      )}
                      <div className="text-[10px] text-ink-400">{b.keywords.length}개 키워드</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Weekly 연동 ── */}
          {section === 'weekly' && (
            <>
              <SettingCard title="팀 목록">
                {weeklySources.length === 0 && (
                  <p className="text-xs text-ink-400">등록된 팀이 없습니다.</p>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleWeeklyDragEnd}>
                  <SortableContext items={weeklySources.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {weeklySources.map(src => (
                        <SortableWeeklyRow key={src.id} src={src} onDelete={deleteWeeklySource} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </SettingCard>

              <SettingCard title="팀 추가">
                <div className="flex gap-2 items-center">
                  <input
                    value={weeklyForm.label}
                    onChange={e => setWeeklyForm(p => ({ ...p, label: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addWeeklySource() }}
                    placeholder="팀명 (예: Biz Lead)"
                    className="w-32 bg-background border border-border rounded-sm px-2.5 py-1.5 text-[11px] outline-none focus:border-lilac-400 transition-colors"
                  />
                  <input
                    value={weeklyForm.collection_id}
                    onChange={e => setWeeklyForm(p => ({ ...p, collection_id: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addWeeklySource() }}
                    placeholder="Outline Collection ID"
                    className="flex-1 bg-background border border-border rounded-sm px-2.5 py-1.5 text-[11px] outline-none focus:border-lilac-400 transition-colors"
                  />
                  <button
                    onClick={addWeeklySource}
                    disabled={weeklyPending || !weeklyForm.label.trim() || !weeklyForm.collection_id.trim()}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-sm bg-foreground text-background text-[11px] font-medium hover:opacity-80 disabled:opacity-40 transition-opacity shrink-0"
                  >
                    <Plus size={12} /> 추가
                  </button>
                </div>
                <p className="text-[10px] text-ink-400">Outline 컬렉션 ID는 컬렉션 URL에서 확인할 수 있습니다.</p>
              </SettingCard>
            </>
          )}

          {/* ── 데이터 ── */}
          {section === 'data' && (
            <SettingCard title="내보내기">
              <p className="text-[11px] text-muted-foreground">
                태스크, 히스토리, 주간 데이터를 CSV 또는 JSON으로 내보낼 수 있습니다.
              </p>
              <div className="space-y-2">
                {[
                  { label: '태스크 목록', format: 'CSV' },
                  { label: '클라이언트 히스토리', format: 'JSON' },
                  { label: '주간 요약', format: 'JSON' },
                ].map(({ label, format }) => (
                  <button
                    key={label}
                    disabled
                    className="w-full flex items-center justify-between px-3 py-2 rounded border border-border text-xs text-muted-foreground opacity-50 cursor-not-allowed"
                  >
                    <span className="flex items-center gap-2">
                      <Download size={13} />
                      {label}
                    </span>
                    <span className="flex items-center gap-1 text-[10px]">
                      {format}
                      <ChevronRight size={11} />
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-ink-400">* 내보내기 기능은 준비 중입니다.</p>
            </SettingCard>
          )}

        </div>
      </div>

      <BrandDrawer
        brand={drawerTarget}
        workspaceId={workspaceId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaveBrand}
        onDeleted={handleDeleteBrand}
      />
    </div>
  )
}

function SortableWeeklyRow({ src, onDelete }: { src: WeeklySource; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: src.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-background"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-ink-400 hover:text-foreground transition-colors cursor-grab active:cursor-grabbing shrink-0"
        aria-label="순서 변경"
      >
        <GripVertical size={14} />
      </button>
      <span className="text-xs font-medium text-foreground w-24 shrink-0 truncate">{src.label}</span>
      <span className="text-[11px] text-muted-foreground flex-1 truncate">{src.collection_id}</span>
      <button
        onClick={() => onDelete(src.id)}
        className="text-ink-400 hover:text-status-late transition-colors shrink-0"
        aria-label={`${src.label} 삭제`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

