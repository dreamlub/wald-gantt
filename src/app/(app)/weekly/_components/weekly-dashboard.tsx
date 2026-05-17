'use client'

import { useState, useCallback } from 'react'
import { Sparkles, RefreshCw, CalendarDays, TrendingUp, TrendingDown } from 'lucide-react'
import type { WeeklyReport, WeeklyInsight, WeeklyReportSummary, WeeklyReportItem } from '@/types/index'
import { analyzeWeekly } from '@/lib/weekly-service'
import { ASSIGNEE_COLORS } from '@/app/(app)/tasks/_constants'

// ── 색상 ─────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff
  return Math.abs(h)
}

function colorFor(s: string): string {
  return ASSIGNEE_COLORS[hashStr(s) % ASSIGNEE_COLORS.length]
}

// ── 타입 메타 ─────────────────────────────────────────────────────

const TYPE_META = {
  issue:    { label: '이슈', dotCls: 'bg-status-late',   badgeCls: 'bg-status-late/10 text-status-late' },
  decision: { label: '결정', dotCls: 'bg-status-warn',   badgeCls: 'bg-status-warn/10 text-status-warn' },
  plan:     { label: '계획', dotCls: 'bg-lilac-500',     badgeCls: 'bg-lilac-100 text-lilac-600' },
} as const

// ── bold 렌더 ─────────────────────────────────────────────────────

function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

// ── 날짜 포맷 ─────────────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Delta 표시 ────────────────────────────────────────────────────

function Delta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-[10px] text-ink-400">—</span>
  const up = delta > 0
  return (
    <span className={`text-[10px] font-medium flex items-center gap-0.5 ${up ? 'text-mint-500' : 'text-status-late'}`}>
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? '+' : ''}{delta}
    </span>
  )
}

// ── ProgressBar ──────────────────────────────────────────────────

function ProgressBar({ progress, slowPhase, statusMessage }: {
  progress: number
  slowPhase: boolean
  statusMessage: string | null
}) {
  return (
    <div>
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
      {statusMessage && <p className="text-[11px] text-ink-400 mt-1.5">{statusMessage}</p>}
    </div>
  )
}

// ── AISummaryCard ─────────────────────────────────────────────────

interface AISummaryCardProps {
  insight: WeeklyInsight | null
  reportCount: number
  analyzing: boolean
  progress: number
  slowPhase: boolean
  statusMessage: string | null
  error: string | null
  onAnalyze: () => void
}

function AISummaryCard({
  insight, reportCount, analyzing, progress, slowPhase, statusMessage, error, onAnalyze,
}: AISummaryCardProps) {
  const content = insight?.content ?? null

  return (
    <div className="bg-card border border-border rounded-lg mb-4">
      <div className="flex items-center gap-2 px-4 h-10 border-b border-border">
        <Sparkles size={12} className="text-lilac-500 shrink-0" />
        <span className="flex-1 text-xs font-semibold text-foreground">AI 주간 요약</span>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded bg-foreground text-background hover:bg-ink-800 disabled:opacity-60 transition-colors"
        >
          {analyzing
            ? <RefreshCw size={10} className="animate-spin" />
            : <Sparkles size={10} />}
          {analyzing ? '분석 중...' : content ? '다시 요약' : '분석하기'}
        </button>
      </div>

      <div className="px-4 py-3 space-y-2">
        {analyzing && (
          <ProgressBar progress={progress} slowPhase={slowPhase} statusMessage={statusMessage} />
        )}

        {error && (
          <p className="text-[11px] text-status-late">{error}</p>
        )}

        {content ? (
          <>
            <p className="text-xs leading-relaxed text-foreground">
              {renderBold(content.headline)}
            </p>
            {content.changes && (
              <p className="text-[11px] text-ink-500 leading-relaxed pl-2 border-l-2 border-ink-200">
                {content.changes}
              </p>
            )}
            <p className="text-[10px] text-ink-400">
              by Claude · 총 {reportCount}개 보고서 분석
              {insight!.analyzed_at ? ` · ${fmtDatetime(insight!.analyzed_at)}` : ''}
            </p>
          </>
        ) : !analyzing && (
          <p className="text-[11px] text-ink-400 py-1">
            {reportCount === 0
              ? '수집된 보고서가 없어 분석할 수 없습니다.'
              : '분석하기 버튼을 눌러 AI 요약을 생성하세요.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ── StatsRow ──────────────────────────────────────────────────────

function StatCard({ label, count, delta }: { label: string; count: number; delta: number }) {
  return (
    <div className="flex-1 bg-card border border-border rounded-lg px-3 py-2.5 min-w-0">
      <p className="text-[10px] text-ink-500 mb-1.5 truncate">{label}</p>
      <div className="flex items-end gap-1.5">
        <span className="text-base font-bold text-foreground leading-none">{count}</span>
        <Delta delta={delta} />
      </div>
    </div>
  )
}

function StatsRow({ stats }: { stats: NonNullable<WeeklyInsight['content']>['stats'] }) {
  return (
    <div className="flex gap-2 mb-4">
      <StatCard label="리포트 작성" count={stats.authors.count}   delta={stats.authors.delta} />
      <StatCard label="이슈"        count={stats.issues.count}    delta={stats.issues.delta} />
      <StatCard label="결정사항"    count={stats.decisions.count} delta={stats.decisions.delta} />
      <StatCard label="다음주 계획" count={stats.plans.count}     delta={stats.plans.delta} />
    </div>
  )
}

// ── 아이템 행 ────────────────────────────────────────────────────

interface ItemRowProps {
  item: WeeklyReportItem
  author?: string | null
  showAuthor?: boolean
  showBrand?: boolean
  showTeam?: string
}

function ItemRow({ item, author, showAuthor = true, showBrand = true, showTeam }: ItemRowProps) {
  const meta = TYPE_META[item.type]
  return (
    <div className="flex items-start gap-2.5 py-2.5 px-3 border-b border-border last:border-0 hover:bg-ink-50 transition-colors">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${meta.dotCls}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-xs font-medium text-foreground leading-snug">{item.title}</p>
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] ${meta.badgeCls}`}>
            {meta.label}
          </span>
        </div>
        {item.detail && (
          <p className="text-[11px] text-ink-500 mt-0.5 leading-relaxed">{item.detail}</p>
        )}
        {(item.date || (showBrand && item.brand) || (showAuthor && author) || showTeam) && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {item.date && (
              <span className="text-[10px] text-ink-400 flex items-center gap-0.5">
                <CalendarDays size={10} />
                {item.date}
              </span>
            )}
            {showTeam && (
              <span className="text-[10px] text-ink-400">{showTeam}</span>
            )}
            {showBrand && item.brand && (
              <span className="text-[10px] text-ink-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colorFor(item.brand) }} />
                {item.brand}
              </span>
            )}
            {showAuthor && author && (
              <span className="text-[10px] text-ink-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colorFor(author) }} />
                {author}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 그룹 헤더 ─────────────────────────────────────────────────────

function GroupHeader({ title, count, subtitle, color }: {
  title: string
  count: number
  subtitle?: string
  color?: string
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border-b border-border">
      {color && (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      )}
      <span className="text-xs font-semibold text-foreground">{title}</span>
      <span className="text-[10px] text-ink-400 bg-background border border-border px-1.5 py-0.5 rounded-full leading-none">
        {count}
      </span>
      {subtitle && (
        <span className="text-[11px] text-ink-400 ml-auto truncate max-w-[140px]">{subtitle}</span>
      )}
    </div>
  )
}

// ── 빈 상태 ──────────────────────────────────────────────────────

function EmptyItems({ message = '분석된 아이템이 없습니다.' }: { message?: string }) {
  return (
    <div className="text-center py-10 text-[11px] text-ink-400">{message}</div>
  )
}

// ── 아이템 추출 유틸 ──────────────────────────────────────────────

type ItemEntry = { item: WeeklyReportItem; team: string; author: string | null }

function extractEntries(reports: WeeklyReport[]): ItemEntry[] {
  const result: ItemEntry[] = []
  for (const r of reports) {
    const summary = r.summary as unknown as WeeklyReportSummary | null
    for (const item of summary?.items ?? []) {
      result.push({ item, team: r.team, author: r.author })
    }
  }
  return result
}

// ── 탭별 뷰 ──────────────────────────────────────────────────────

function AllView({ reports }: { reports: WeeklyReport[] }) {
  const entries = extractEntries(reports)
  if (entries.length === 0) return <EmptyItems />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {entries.map((e, i) => (
        <ItemRow key={i} item={e.item} author={e.author} showTeam={e.team} showAuthor showBrand />
      ))}
    </div>
  )
}

function TeamView({ reports }: { reports: WeeklyReport[] }) {
  const withItems = reports.filter(r => {
    const s = r.summary as unknown as WeeklyReportSummary | null
    return (s?.items?.length ?? 0) > 0
  })
  if (withItems.length === 0) return <EmptyItems />

  return (
    <div className="flex flex-col gap-3">
      {withItems.map(r => {
        const items = (r.summary as unknown as WeeklyReportSummary).items
        const brands = [...new Set(items.filter(it => it.brand).map(it => it.brand!))]
        const subtitle = [r.author, brands[0]].filter(Boolean).join(' · ')
        return (
          <div key={r.id} className="bg-card border border-border rounded-lg overflow-hidden">
            <GroupHeader
              title={r.team}
              count={items.length}
              subtitle={subtitle || undefined}
              color={r.author ? colorFor(r.author) : undefined}
            />
            {items.map((item, i) => (
              <ItemRow key={i} item={item} author={r.author} showAuthor={false} showBrand />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function BrandView({ reports }: { reports: WeeklyReport[] }) {
  const entries = extractEntries(reports)
  const grouped = new Map<string, ItemEntry[]>()
  const noBrand: ItemEntry[] = []

  for (const e of entries) {
    const brand = e.item.brand ?? ''
    if (!brand) { noBrand.push(e); continue }
    if (!grouped.has(brand)) grouped.set(brand, [])
    grouped.get(brand)!.push(e)
  }

  const sorted = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)

  if (sorted.length === 0 && noBrand.length === 0) return <EmptyItems />
  return (
    <div className="flex flex-col gap-3">
      {sorted.map(([brand, es]) => (
        <div key={brand} className="bg-card border border-border rounded-lg overflow-hidden">
          <GroupHeader title={brand} count={es.length} color={colorFor(brand)} />
          {es.map((e, i) => (
            <ItemRow key={i} item={e.item} author={e.author} showAuthor showBrand={false} showTeam={e.team} />
          ))}
        </div>
      ))}
      {noBrand.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <GroupHeader title="브랜드 미지정" count={noBrand.length} />
          {noBrand.map((e, i) => (
            <ItemRow key={i} item={e.item} author={e.author} showAuthor showBrand={false} showTeam={e.team} />
          ))}
        </div>
      )}
    </div>
  )
}

function AssigneeView({ reports }: { reports: WeeklyReport[] }) {
  const entries = extractEntries(reports)
  const grouped = new Map<string, ItemEntry[]>()
  const noAuthor: ItemEntry[] = []

  for (const e of entries) {
    if (!e.author) { noAuthor.push(e); continue }
    if (!grouped.has(e.author)) grouped.set(e.author, [])
    grouped.get(e.author)!.push(e)
  }

  const sorted = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)

  if (sorted.length === 0 && noAuthor.length === 0) return <EmptyItems />
  return (
    <div className="flex flex-col gap-3">
      {sorted.map(([author, es]) => (
        <div key={author} className="bg-card border border-border rounded-lg overflow-hidden">
          <GroupHeader title={author} count={es.length} color={colorFor(author)} />
          {es.map((e, i) => (
            <ItemRow key={i} item={e.item} author={null} showAuthor={false} showBrand showTeam={e.team} />
          ))}
        </div>
      ))}
      {noAuthor.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <GroupHeader title="담당자 미지정" count={noAuthor.length} />
          {noAuthor.map((e, i) => (
            <ItemRow key={i} item={e.item} author={null} showAuthor={false} showBrand showTeam={e.team} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── 탭 정의 ──────────────────────────────────────────────────────

export type DashboardTab = 'all' | 'team' | 'brand' | 'assignee'

export const DASHBOARD_TABS: { key: DashboardTab; label: string }[] = [
  { key: 'all',      label: '종합' },
  { key: 'team',     label: '팀별' },
  { key: 'brand',    label: '브랜드별' },
  { key: 'assignee', label: '담당자별' },
]

// ── WeeklyDashboard ───────────────────────────────────────────────

interface Props {
  weekStart: string
  reports: WeeklyReport[]
  insight: WeeklyInsight | null
  reportsLoading: boolean
  tab: DashboardTab
  onInsightUpdate: (insight: WeeklyInsight) => void
  onRefresh: () => void
}

export function WeeklyDashboard({
  weekStart, reports, insight, reportsLoading, tab,
  onInsightUpdate, onRefresh,
}: Props) {
  const [analyzing, setAnalyzing]       = useState(false)
  const [progress, setProgress]         = useState(0)
  const [slowPhase, setSlowPhase]       = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true)
    setError(null)
    setProgress(0)
    setSlowPhase(false)
    setStatusMessage(null)

    let reportsDone = 0
    const totalReports = Math.max(reports.length, 1)

    try {
      const result = await analyzeWeekly(weekStart, (msg) => {
        setStatusMessage(msg)
        if (msg.includes('조회')) {
          setProgress(10)
        } else if (msg.includes('분석 중')) {
          reportsDone += 1
          setProgress(10 + Math.round((reportsDone / totalReports) * 65))
        } else if (msg.includes('종합')) {
          setProgress(80)
          setSlowPhase(true)
          requestAnimationFrame(() => requestAnimationFrame(() => setProgress(93)))
        } else if (msg.includes('저장')) {
          setSlowPhase(false)
          setProgress(97)
        }
      })
      setProgress(100)
      onInsightUpdate(result)
      onRefresh()
      setTimeout(() => { setProgress(0); setStatusMessage(null) }, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 실패')
      setProgress(0)
    } finally {
      setAnalyzing(false)
    }
  }, [weekStart, reports.length, onInsightUpdate, onRefresh])

  if (reportsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={16} className="animate-spin text-ink-400" />
      </div>
    )
  }

  return (
    <div>
      {/* 페이지 설명 */}
      <p className="text-[11px] text-ink-400 mb-4">
        AI가 분석한 주간 핵심 흐름과 팀/브랜드별 상세 보고를 확인하세요
      </p>

      {/* AI 요약 카드 */}
      <AISummaryCard
        insight={insight}
        reportCount={reports.length}
        analyzing={analyzing}
        progress={progress}
        slowPhase={slowPhase}
        statusMessage={statusMessage}
        error={error}
        onAnalyze={handleAnalyze}
      />

      {/* 스탯 행 */}
      {insight?.content && <StatsRow stats={insight.content.stats} />}

      {/* 보고서 없음 */}
      {reports.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-1">
          <p className="text-xs text-muted-foreground">수집된 보고서가 없습니다</p>
          <p className="text-[11px] text-ink-300">MCP를 통해 보고서를 수집한 후 분석하세요</p>
        </div>
      )}

      {/* 탭별 뷰 */}
      {reports.length > 0 && (
        <>
          {tab === 'all'      && <AllView      reports={reports} />}
          {tab === 'team'     && <TeamView     reports={reports} />}
          {tab === 'brand'    && <BrandView    reports={reports} />}
          {tab === 'assignee' && <AssigneeView reports={reports} />}
        </>
      )}
    </div>
  )
}
