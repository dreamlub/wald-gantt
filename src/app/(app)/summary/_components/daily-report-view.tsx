'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, AlertCircle,
  CalendarDays, Clock, CheckSquare, Target, Newspaper,
  ArrowRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'

import type { Client, InsightContent, ActionItem, Priority, Tag } from '../_lib/types'
import { PRIORITY_META } from '../_lib/mock-data'
import { PriorityBars } from './badges'

interface Props {
  clients: Client[]
  selectedDate: string
  filterBrands: Set<string>
  filterTags: Set<Tag>
  filterPriorities: Set<Priority>
}

interface DailyReport {
  content: InsightContent
  analyzed_at: string
  item_count: number
  brand_count: number
}

function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-lilac-600 bg-lilac-100 px-[3px] rounded-2xs">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

const PRI_CLS: Record<Priority, string> = {
  high:   'bg-status-late/10 text-status-late',
  medium: 'bg-status-warn/10 text-status-warn',
  low:    'bg-ink-100 text-ink-500',
}
const PRI_LABEL: Record<Priority, string> = { high: '높음', medium: '보통', low: '낮음' }

function BrandBadge({ brandName, clients }: { brandName: string; clients: Client[] }) {
  const client = clients.find(c => c.name === brandName)
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs px-2 py-0.5 rounded-full bg-ink-100 text-ink-700 font-medium whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: client?.color ?? 'var(--color-ink-300)' }} />
      {client?.name ?? brandName}
    </span>
  )
}

function SectionHead({ icon: Icon, title, count }: { icon: typeof Newspaper; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-ink-150">
      <Icon size={13} className="text-ink-400" />
      <h3 className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">{title}</h3>
      <span className="text-3xs text-ink-400">{count}건</span>
    </div>
  )
}

function HeadlineCard({ content, report }: { content: InsightContent; report: DailyReport & { dateLabel: string } }) {
  return (
    <section className="border-t border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-ink-150">
        <Newspaper size={13} className="text-ink-400" />
        <h3 className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">HEADLINE</h3>
        <span className="text-3xs text-ink-400">{report.dateLabel} · {report.item_count}건 · {report.brand_count}개 브랜드</span>
      </div>
      <div className="px-4 py-5">
        <p className="text-sm leading-[1.8] text-foreground">
          {renderBold(content.headline)}
        </p>
      </div>
    </section>
  )
}

const SEV_TO_PRIORITY: Record<string, Priority> = { urgent: 'high', watch: 'medium', info: 'low' }

function ActionGrid({ items, clients }: { items: ActionItem[]; clients: Client[] }) {
  if (items.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(a => {
        const pri = SEV_TO_PRIORITY[a.severity] ?? 'medium'
        return (
          <div key={a.id} className="bg-card border border-l-[3px] border-border rounded-lg p-3.5 flex flex-col"
            style={{ borderLeftColor: PRIORITY_META[pri]?.color }}>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <PriorityBars priority={pri} />
              <BrandBadge brandName={a.brand} clients={clients} />
              <span className="text-3xs text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">{a.related_count}건 관련</span>
            </div>
            <p className="text-sm font-semibold text-foreground mb-1.5 leading-snug">{a.title}</p>
            <p className="text-xs text-ink-700 leading-relaxed mb-2.5 flex-1">{a.summary}</p>
            <div className="flex items-center gap-2 text-2xs font-medium px-3 py-2 rounded border border-dashed"
              style={{ borderColor: `color-mix(in srgb, ${PRIORITY_META[pri]?.color} 30%, transparent)`, color: PRIORITY_META[pri]?.color, background: `color-mix(in srgb, ${PRIORITY_META[pri]?.color} 6%, transparent)` }}>
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
          <span className="text-2xs text-ink-700 min-w-[80px] flex items-center gap-1">
            <CalendarDays size={11} className="text-ink-400" />
            {s.date}
          </span>
          <span className="flex-1 text-xs text-foreground">{s.title}</span>
          <span className={`text-3xs font-semibold px-1.5 py-0.5 rounded-xs uppercase tracking-[0.04em] ${PRI_CLS[s.priority]}`}>
            {PRI_LABEL[s.priority]}
          </span>
          <BrandBadge brandName={s.brand} clients={clients} />
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
        const c = clients.find(x => x.name === p.brand)
        return (
          <div key={i} className="flex items-start gap-3 px-3.5 py-2.5 border-b border-border last:border-b-0 hover:bg-ink-50">
            <span className="min-w-[90px] text-xs font-semibold flex items-center gap-1.5 text-foreground pt-0.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c?.color ?? 'var(--color-ink-300)' }} />
              {c?.name ?? p.brand}
            </span>
            <span className="flex-1 text-2xs text-ink-500 leading-relaxed">{p.items}</span>
            <span className="text-3xs text-status-warn bg-status-warn/10 px-1.5 py-0.5 rounded-full font-semibold shrink-0">{p.count}건</span>
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
          <p className="text-2xs text-ink-500 leading-relaxed mb-2">{d.desc}</p>
          <BrandBadge brandName={d.brand} clients={clients} />
        </div>
      ))}
    </div>
  )
}

function filterByBrand<T extends { brand: string }>(items: T[], brands: Set<string>): T[] {
  if (brands.size === 0) return items
  return items.filter(item => brands.has(item.brand))
}

export function DailyReportView({ clients, selectedDate, filterBrands, filterTags, filterPriorities }: Props) {
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('daily_reports')
      .select('content, analyzed_at, item_count, brand_count')
      .eq('report_date', selectedDate)
      .maybeSingle()
    setReport(data as DailyReport | null)
    setLoading(false)
  }, [selectedDate])

  useEffect(() => { fetchReport() }, [fetchReport])

  const dateLabel = useMemo(() => {
    try {
      return format(new Date(selectedDate + 'T00:00:00'), 'yyyy년 M월 d일 (eee)', { locale: ko })
    } catch { return selectedDate }
  }, [selectedDate])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Sparkles size={16} className="animate-spin text-ink-400" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-4">
          <Sparkles size={18} className="text-ink-400" />
        </div>
        <p className="text-sm font-semibold text-foreground mb-1">{dateLabel}</p>
        <p className="text-xs text-ink-400">해당 날짜의 리포트가 아직 생성되지 않았습니다</p>
      </div>
    )
  }

  const raw = report.content
  const filteredActions = filterByBrand(raw.action_items, filterBrands)
    .filter(a => filterPriorities.size === 0 || filterPriorities.has(SEV_TO_PRIORITY[a.severity] ?? 'medium'))
  const content: InsightContent = {
    headline: raw.headline,
    action_items: filteredActions,
    upcoming: filterByBrand(raw.upcoming, filterBrands),
    pending: filterByBrand(raw.pending, filterBrands),
    decisions: filterByBrand(raw.decisions, filterBrands),
  }
  const reportWithLabel = { ...report, dateLabel }

  return (
    <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="space-y-0">
        {/* 헤드라인 */}
        <HeadlineCard content={content} report={reportWithLabel} />

        {/* 지금 챙겨야 할 것 */}
        {content.action_items.length > 0 && (
          <section className="border-t border-border">
            <SectionHead icon={AlertCircle} title="지금 챙겨야 할 것" count={content.action_items.length} />
            <div className="p-4">
              <ActionGrid items={content.action_items} clients={clients} />
            </div>
          </section>
        )}

        {/* 일정 + 응답 대기 — 항상 50:50 */}
        {(content.upcoming.length > 0 || content.pending.length > 0) && (
          <div className="grid grid-cols-2 border-t border-border">
            <section className="border-r border-border">
              {content.upcoming.length > 0 && (
                <>
                  <SectionHead icon={CalendarDays} title="다가오는 일정" count={content.upcoming.length} />
                  <div className="p-4">
                    <UpcomingList items={content.upcoming} clients={clients} />
                  </div>
                </>
              )}
            </section>
            <section>
              {content.pending.length > 0 && (
                <>
                  <SectionHead icon={Clock} title="응답 대기" count={content.pending.reduce((s, p) => s + p.count, 0)} />
                  <div className="p-4">
                    <PendingList items={content.pending} clients={clients} />
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* 결정 사항 */}
        {content.decisions.length > 0 && (
          <section className="border-t border-border">
            <SectionHead icon={Target} title="결정 사항" count={content.decisions.length} />
            <div className="p-4">
              <DecisionGrid items={content.decisions} clients={clients} />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
