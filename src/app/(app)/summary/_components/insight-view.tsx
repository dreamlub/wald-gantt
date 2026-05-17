'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, RefreshCw, AlertCircle, Eye, Info,
  CalendarDays, Clock, CheckSquare, Target, Newspaper,
  ArrowRight,
} from 'lucide-react'
import type { Client, Insight, InsightContent, ActionItem, Priority } from '../_lib/types'
import { getInsight, generateInsight } from '@/lib/insight-service'
import { getCurrentWeekStart } from './history-sidebar'

interface Props {
  weekStart: string
  clients: Client[]
  brandId: string | 'all'
  onBrandChange: (id: string | 'all') => void
}

// ── 헬퍼 ──────────────────────────────────────────────────────
function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-lilac-600 bg-lilac-100 px-[3px] rounded-[2px]">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

const SEV_META = {
  urgent: { label: '긴급', Icon: AlertCircle, cls: 'bg-status-late/10 text-status-late',      border: 'border-l-status-late',   actionCls: 'bg-status-late/8 text-status-late border-status-late/20' },
  watch:  { label: '주시', Icon: Eye,          cls: 'bg-status-warn/10 text-status-warn',      border: 'border-l-status-warn',   actionCls: 'bg-status-warn/8 text-status-warn border-status-warn/20' },
  info:   { label: '진행', Icon: Info,          cls: 'bg-status-future/10 text-status-future', border: 'border-l-status-future', actionCls: 'bg-status-future/8 text-status-future border-status-future/20' },
} as const

const PRI_CLS: Record<Priority, string> = {
  high:   'bg-status-late/10 text-status-late',
  medium: 'bg-status-warn/10 text-status-warn',
  low:    'bg-ink-100 text-ink-500',
}
const PRI_LABEL: Record<Priority, string> = { high: '높음', medium: '보통', low: '낮음' }

// brand 필드는 client_id를 저장 (API 응답 정규화 후 저장)
function BrandBadge({ clientId, clients }: { clientId: string; clients: Client[] }) {
  const client = clients.find(c => c.id === clientId)
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-ink-100 text-ink-700 font-medium whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: client?.color ?? 'var(--color-ink-300)' }} />
      {client?.name ?? clientId}
    </span>
  )
}

function filterByBrand<T extends { brand: string }>(items: T[], brandId: string | 'all'): T[] {
  if (brandId === 'all') return items
  return items.filter(item => item.brand === brandId)
}

function ProgressBar({ progress, slowPhase, statusMessage, className }: {
  progress: number
  slowPhase: boolean
  statusMessage: string | null
  className?: string
}) {
  return (
    <div className={className}>
      <div className="relative h-[3px] rounded-full bg-ink-100 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 h-full bg-lilac-500"
          style={{
            width: `${progress}%`,
            transition: progress === 0 ? 'none'
              : slowPhase ? 'width 18s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'width 0.5s ease-out',
          }}
        />
      </div>
      {statusMessage && (
        <p className="text-[11px] text-ink-400 mt-1.5">{statusMessage}</p>
      )}
    </div>
  )
}

function SectionHead({ icon: Icon, title, count }: { icon: typeof Newspaper; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
      <Icon size={14} className="text-ink-500" />
      <h3 className="text-xs font-semibold tracking-tight">{title}</h3>
      <span className="text-[10px] text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">{count}건</span>
    </div>
  )
}

// ── 인사이트 섹션들 ────────────────────────────────────────────
function HeadlineCard({ content, generatedAt, sourceCount, weekStart }: {
  content: InsightContent
  generatedAt: string
  sourceCount: number
  weekStart: string
}) {
  const d = new Date(generatedAt)
  const genLabel = `생성 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const ws = new Date(weekStart)
  const we = new Date(ws); we.setDate(ws.getDate() + 6)
  const rangeLabel = `${ws.getMonth() + 1}/${ws.getDate()} ~ ${we.getMonth() + 1}/${we.getDate()}`
  return (
    <div className="relative bg-card border border-border rounded-lg px-5 py-4 mb-6">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-lilac-400 rounded-l-lg" />
      <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-[0.06em] text-orange-500 font-semibold">
        <Newspaper size={12} />
        <span>Headline</span>
        <span className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-[10px] font-medium bg-lilac-100 text-lilac-600 px-2 py-0.5 rounded-full">
          <Sparkles size={10} />
          AI 분석
        </span>
      </div>
      <div className="text-[10px] text-ink-400 mb-2.5">{rangeLabel} · {sourceCount}건 · {genLabel}</div>
      <p className="text-xs leading-relaxed text-foreground">
        {renderBold(content.headline)}
      </p>
    </div>
  )
}

function ActionGrid({ items, clients }: { items: ActionItem[]; clients: Client[] }) {
  if (items.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(a => {
        const sev = SEV_META[a.severity]
        const SevIcon = sev.Icon
        return (
          <div key={a.id} className={`bg-card border border-l-[3px] ${sev.border} border-border rounded-lg p-3.5 flex flex-col`}>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[3px] uppercase tracking-[0.04em] ${sev.cls}`}>
                <SevIcon size={11} />
                {sev.label}
              </span>
              <BrandBadge clientId={a.brand} clients={clients} />
              <span className="text-[10px] text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">{a.related_count}건 관련</span>
            </div>
            <p className="text-xs font-semibold text-foreground mb-1.5 leading-snug">{a.title}</p>
            <p className="text-[11px] text-ink-700 leading-relaxed mb-2.5 flex-1">{a.summary}</p>
            <div className={`flex items-center gap-2 text-[11px] font-medium px-3 py-2 rounded border border-dashed ${sev.actionCls}`}>
              <ArrowRight size={12} className="shrink-0" />
              <span>{a.action}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function UpcomingList({ items, clients }: { items: InsightContent['upcoming']; clients: Client[] }) {
  if (items.length === 0) return null
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {items.map((s, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-border last:border-b-0 hover:bg-ink-50">
          <span className="text-[11px] text-ink-700 min-w-[80px] flex items-center gap-1">
            <CalendarDays size={11} className="text-ink-400" />
            {s.date}
          </span>
          <span className="flex-1 text-xs text-foreground">{s.title}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] uppercase tracking-[0.04em] ${PRI_CLS[s.priority]}`}>
            {PRI_LABEL[s.priority]}
          </span>
          <BrandBadge clientId={s.brand} clients={clients} />
        </div>
      ))}
    </div>
  )
}

function PendingList({ items, clients }: { items: InsightContent['pending']; clients: Client[] }) {
  if (items.length === 0) return null
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {items.map((p, i) => {
        const c = clients.find(x => x.id === p.brand)
        return (
          <div key={i} className="flex items-start gap-3 px-3.5 py-2.5 border-b border-border last:border-b-0 hover:bg-ink-50">
            <span className="min-w-[90px] text-xs font-semibold flex items-center gap-1.5 text-foreground pt-0.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c?.color ?? 'var(--color-ink-300)' }} />
              {c?.name ?? p.brand}
            </span>
            <span className="flex-1 text-[11px] text-ink-500 leading-relaxed">{p.items}</span>
            <span className="text-[10px] text-status-warn bg-status-warn/10 px-1.5 py-0.5 rounded-full font-semibold shrink-0">{p.count}건</span>
          </div>
        )
      })}
    </div>
  )
}

function DecisionGrid({ items, clients }: { items: InsightContent['decisions']; clients: Client[] }) {
  if (items.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(d => (
        <div key={d.id} className="bg-card border border-l-[3px] border-l-status-warn border-border rounded-lg p-3 transition-colors">
          <div className="flex items-start gap-1.5 mb-1.5">
            <CheckSquare size={13} className="text-mint-500 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-foreground leading-snug">{d.title}</p>
          </div>
          <p className="text-[11px] text-ink-500 leading-relaxed mb-2">{d.desc}</p>
          <BrandBadge clientId={d.brand} clients={clients} />
        </div>
      ))}
    </div>
  )
}

// ── 빈 상태 ────────────────────────────────────────────────────
function EmptyState({ onGenerate, loading, showProgress, progress, statusMessage, slowPhase, isCurrentWeek }: {
  onGenerate: () => void
  loading: boolean
  showProgress: boolean
  progress: number
  statusMessage: string | null
  slowPhase: boolean
  isCurrentWeek: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-10 h-10 rounded-full bg-lilac-100 flex items-center justify-center mb-4">
        <Sparkles size={18} className="text-lilac-500" />
      </div>
      <p className="text-xs font-medium text-foreground mb-1">{isCurrentWeek ? '이번 주' : '해당 주'} 인사이트가 없어요</p>
      <p className="text-[11px] text-ink-400 mb-5">슬랙 수집 데이터를 바탕으로 AI가 분석합니다</p>
      <button
        onClick={onGenerate}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded bg-foreground text-background text-xs font-medium hover:bg-ink-800 disabled:opacity-60 transition-colors"
      >
        <Sparkles size={13} className={loading ? 'animate-spin' : ''} />
        {loading ? '분석 중...' : '분석하기'}
      </button>
      {showProgress && (
        <ProgressBar progress={progress} slowPhase={slowPhase} statusMessage={statusMessage} className="w-52 mt-5" />
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function InsightView({ weekStart, clients, brandId, onBrandChange }: Props) {
  const [insight, setInsight] = useState<Insight | null>(null)
  const [fetching, setFetching] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [showProgress, setShowProgress] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [slowPhase, setSlowPhase] = useState(false)

  const fetchInsight = useCallback(async () => {
    setFetching(true)
    setError(null)
    try {
      setInsight(await getInsight(weekStart))
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setFetching(false)
    }
  }, [weekStart])

  useEffect(() => { fetchInsight() }, [fetchInsight])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    if (!insight) return m
    const allBrands = [
      ...insight.content.action_items.map(a => a.brand),
      ...insight.content.upcoming.map(u => u.brand),
      ...insight.content.pending.map(p => p.brand),
      ...insight.content.decisions.map(d => d.brand),
    ]
    for (const b of allBrands) {
      const c = clients.find(x => x.id === b)
      if (c) m.set(c.id, (m.get(c.id) ?? 0) + 1)
    }
    return m
  }, [insight, clients])

  const sortedClients = useMemo(
    () => [...clients].filter(c => counts.has(c.id)).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)),
    [clients, counts]
  )

  const filteredActions   = useMemo(() => insight ? filterByBrand(insight.content.action_items, brandId) : [], [insight, brandId])
  const filteredUpcoming  = useMemo(() => insight ? filterByBrand(insight.content.upcoming,      brandId) : [], [insight, brandId])
  const filteredPending   = useMemo(() => insight ? filterByBrand(insight.content.pending,        brandId) : [], [insight, brandId])
  const filteredDecisions = useMemo(() => insight ? filterByBrand(insight.content.decisions,      brandId) : [], [insight, brandId])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    setStatusMessage(null)
    setSlowPhase(false)
    setShowProgress(true)
    setProgress(0)
    try {
      const updated = await generateInsight(weekStart, (msg) => {
        setStatusMessage(msg)
        if (msg.includes('슬랙')) {
          setProgress(15)
        } else if (msg.includes('AI 분석')) {
          setProgress(38)
          setSlowPhase(true)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setProgress(85))
          })
        } else if (msg.includes('저장')) {
          setSlowPhase(false)
          setProgress(92)
        }
      })
      setInsight(updated)
      setStatusMessage(null)
      setSlowPhase(false)
      setProgress(100)
      setTimeout(() => setShowProgress(false), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 실패')
      setShowProgress(false)
      setProgress(0)
    } finally {
      setGenerating(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw size={16} className="animate-spin text-ink-400" />
      </div>
    )
  }

  return (
    <div>
      {/* 브랜드 칩 행 */}
      {insight && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 pb-4 border-b border-border">
          <button
            onClick={() => onBrandChange('all')}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-[3px] rounded-full border transition-colors whitespace-nowrap
              ${brandId === 'all' ? 'bg-foreground text-white border-foreground' : 'bg-card text-muted-foreground border-border hover:border-ink-400 hover:text-ink-700'}`}
          >
            전체
            <span className={`text-[10px] ${brandId === 'all' ? 'text-white/70' : 'text-ink-400'}`}>
              {insight.source_count}
            </span>
          </button>
          {sortedClients.map(c => {
            const active = brandId === c.id
            return (
              <button
                key={c.id}
                onClick={() => onBrandChange(active ? 'all' : c.id)}
                className={`flex items-center gap-1.5 text-[11px] px-2.5 py-[3px] rounded-full border transition-colors whitespace-nowrap
                  ${active ? 'text-white border-transparent' : 'bg-card text-muted-foreground border-border hover:border-ink-400 hover:text-ink-700'}`}
                style={active ? { backgroundColor: c.color, borderColor: c.color } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'white' : c.color }} />
                {c.name}
                <span className={`text-[10px] ${active ? 'text-white/70' : 'text-ink-400'}`}>{counts.get(c.id) ?? 0}</span>
              </button>
            )
          })}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded bg-foreground text-background hover:bg-ink-800 disabled:opacity-60 transition-colors"
          >
            <Sparkles size={12} className={generating ? 'animate-spin' : ''} />
            {generating ? '분석 중...' : '업데이트'}
          </button>
        </div>
      )}

      {insight && showProgress && (
        <ProgressBar progress={progress} slowPhase={slowPhase} statusMessage={statusMessage} className="mb-4" />
      )}

      {error && (
        <div className="mb-4 flex items-center gap-3 text-xs text-status-late bg-status-late/10 border border-status-late/15 px-3 py-2 rounded">
          <span className="flex-1">오류: {error}</span>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="shrink-0 text-[11px] font-medium underline underline-offset-2 hover:opacity-70 transition-opacity disabled:opacity-40"
          >
            다시 시도
          </button>
        </div>
      )}

      {!insight ? (
        <EmptyState
          onGenerate={handleGenerate}
          loading={generating}
          showProgress={showProgress}
          progress={progress}
          statusMessage={statusMessage}
          slowPhase={slowPhase}
          isCurrentWeek={weekStart === getCurrentWeekStart()}
        />
      ) : (
        <>
          {/* 헤드라인 */}
          <HeadlineCard content={insight.content} generatedAt={insight.analyzed_at} sourceCount={insight.source_count} weekStart={weekStart} />

          {/* 지금 챙겨야 할 것 */}
          {filteredActions.length > 0 && (
            <section className="mb-7">
              <SectionHead icon={AlertCircle} title="지금 챙겨야 할 것" count={filteredActions.length} />
              <ActionGrid items={filteredActions} clients={clients} />
            </section>
          )}

          {/* 2-col: 일정 + 대기 */}
          {(filteredUpcoming.length > 0 || filteredPending.length > 0) && (
            <div className="grid grid-cols-2 gap-4 mb-7">
              {filteredUpcoming.length > 0 && (
                <section>
                  <SectionHead icon={CalendarDays} title="다가오는 일정" count={filteredUpcoming.length} />
                  <UpcomingList items={filteredUpcoming} clients={clients} />
                </section>
              )}
              {filteredPending.length > 0 && (
                <section>
                  <SectionHead icon={Clock} title="응답 대기" count={filteredPending.reduce((s, p) => s + p.count, 0)} />
                  <PendingList items={filteredPending} clients={clients} />
                </section>
              )}
            </div>
          )}

          {/* 결정 사항 */}
          {filteredDecisions.length > 0 && (
            <section className="mb-7">
              <SectionHead icon={Target} title="이번 주 확정된 결정" count={filteredDecisions.length} />
              <DecisionGrid items={filteredDecisions} clients={clients} />
            </section>
          )}
        </>
      )}
    </div>
  )
}
