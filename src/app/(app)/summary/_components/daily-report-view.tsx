'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, AlertCircle, Eye, Info,
  CalendarDays, Clock, CheckSquare, Target, Newspaper,
  ArrowRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'

import type { Client, InsightContent, ActionItem, Priority } from '../_lib/types'

interface Props {
  clients: Client[]
  selectedDate: string
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
      ? <strong key={i} className="font-semibold text-lilac-600 bg-lilac-100 px-[3px] rounded-[2px]">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

const SEV_META = {
  urgent: { label: '긴급', Icon: AlertCircle, cls: 'bg-status-late/10 text-status-late', border: 'border-l-status-late', actionCls: 'bg-status-late/8 text-status-late border-status-late/20' },
  watch:  { label: '주시', Icon: Eye,          cls: 'bg-status-warn/10 text-status-warn', border: 'border-l-status-warn', actionCls: 'bg-status-warn/8 text-status-warn border-status-warn/20' },
  info:   { label: '진행', Icon: Info,          cls: 'bg-status-future/10 text-status-future', border: 'border-l-status-future', actionCls: 'bg-status-future/8 text-status-future border-status-future/20' },
} as const

const PRI_CLS: Record<Priority, string> = {
  high:   'bg-status-late/10 text-status-late',
  medium: 'bg-status-warn/10 text-status-warn',
  low:    'bg-ink-100 text-ink-500',
}
const PRI_LABEL: Record<Priority, string> = { high: '높음', medium: '보통', low: '낮음' }

function BrandBadge({ brandName, clients }: { brandName: string; clients: Client[] }) {
  const client = clients.find(c => c.name === brandName)
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-ink-100 text-ink-700 font-medium whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: client?.color ?? 'var(--color-ink-300)' }} />
      {client?.name ?? brandName}
    </span>
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

function HeadlineCard({ content, report }: { content: InsightContent; report: DailyReport & { dateLabel: string } }) {
  const d = new Date(report.analyzed_at)
  const genLabel = `생성 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
      <div className="text-[10px] text-ink-400 mb-2.5">{report.dateLabel} · {report.item_count}건 · {report.brand_count}개 브랜드 · {genLabel}</div>
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
              <BrandBadge brandName={a.brand} clients={clients} />
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
          <BrandBadge brandName={d.brand} clients={clients} />
        </div>
      ))}
    </div>
  )
}

export function DailyReportView({ clients, selectedDate }: Props) {
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
        <div className="w-10 h-10 rounded-full bg-lilac-100 flex items-center justify-center mb-4">
          <Sparkles size={18} className="text-lilac-500" />
        </div>
        <p className="text-xs font-medium text-foreground mb-1">{dateLabel}</p>
        <p className="text-[11px] text-ink-400">데일리 리포트가 아직 생성되지 않았습니다</p>
        <p className="text-[11px] text-ink-300 mt-1">MCP로 데일리 리포트를 생성해주세요</p>
      </div>
    )
  }

  const content = report.content
  const reportWithLabel = { ...report, dateLabel }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-5 max-w-[960px] mx-auto">
        {/* 헤드라인 */}
        <HeadlineCard content={content} report={reportWithLabel} />

        {/* 지금 챙겨야 할 것 */}
        {content.action_items.length > 0 && (
          <section className="mb-7">
            <SectionHead icon={AlertCircle} title="지금 챙겨야 할 것" count={content.action_items.length} />
            <ActionGrid items={content.action_items} clients={clients} />
          </section>
        )}

        {/* 2-col: 일정 + 대기 */}
        {(content.upcoming.length > 0 || content.pending.length > 0) && (
          <div className="grid grid-cols-2 gap-4 mb-7">
            {content.upcoming.length > 0 && (
              <section>
                <SectionHead icon={CalendarDays} title="다가오는 일정" count={content.upcoming.length} />
                <UpcomingList items={content.upcoming} clients={clients} />
              </section>
            )}
            {content.pending.length > 0 && (
              <section>
                <SectionHead icon={Clock} title="응답 대기" count={content.pending.reduce((s, p) => s + p.count, 0)} />
                <PendingList items={content.pending} clients={clients} />
              </section>
            )}
          </div>
        )}

        {/* 결정 사항 */}
        {content.decisions.length > 0 && (
          <section className="mb-7">
            <SectionHead icon={Target} title="결정 사항" count={content.decisions.length} />
            <DecisionGrid items={content.decisions} clients={clients} />
          </section>
        )}
      </div>
    </div>
  )
}
