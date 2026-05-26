'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Newspaper, AlertCircle,
  CalendarDays, Clock, CheckSquare, Target,
  Plus,
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

import type { InsightContent, ActionItem, Priority, Tag } from '../_lib/types'
import { PRIORITY_META, TAG_META } from '../_lib/constants'
import { PriorityBars, BrandBadge } from './badges'
import { brandColor } from '@/lib/history-service'
import { createClient } from '@/lib/supabase/client'
import { ActionDetailDrawer, BodyBullets, SEV_TO_PRIORITY } from './action-detail-drawer'
import { PriorityCallout } from './priority-callout'

interface Props {
  selectedDate: string
  filterBrands: Set<string>
  filterTags: Set<Tag>
  filterPriorities: Set<Priority>
  onCreateTask?: (title: string, memo: string) => void
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
      ? <strong key={i} className="font-semibold text-lilac-600 bg-lilac-100 px-0.5 rounded-2xs">{part.slice(2, -2)}</strong>
      : <span key={i}>{part.replace(/\*/g, '')}</span>
  )
}

const PRI_CLS: Record<Priority, string> = {
  high:   'bg-status-late/10 text-status-late',
  medium: 'bg-status-warn/10 text-status-warn',
  low:    'bg-ink-100 text-ink-500',
}
const PRI_LABEL: Record<Priority, string> = { high: '높음', medium: '보통', low: '낮음' }

function EmptyState() {
  return <p className="text-xs text-ink-300 py-3">—</p>
}

function SectionHead({ icon: Icon, title, count }: { icon: typeof Newspaper; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-ink-150">
      <Icon size={13} className="text-ink-400" />
      <h3 className="text-2xs font-semibold text-ink-400 uppercase tracking-wider">{title}</h3>
      <span className="text-2xs text-ink-400">{count}건</span>
    </div>
  )
}

function HeadlineSentences({ text }: { text: string }) {
  const sentences = text
    .split('\n')
    .map(l => l.trim().replace(/^[-•*\d.]\s*/, ''))
    .filter(Boolean)
    .flatMap(line => line.split(/(?<=[.!?])\s+/).filter(Boolean))

  return (
    <ol className="flex flex-col gap-2">
      {sentences.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="shrink-0 w-5 h-5 rounded-full bg-ink-100 text-ink-500 text-3xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
          <span className="text-sm leading-[1.8] text-foreground flex-1">{renderBold(s)}</span>
        </li>
      ))}
    </ol>
  )
}

function HeadlineCard({ content, report }: { content: InsightContent; report: DailyReport & { dateLabel: string } }) {
  return (
    <section className="border-t border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-ink-150">
        <Newspaper size={13} className="text-ink-400" />
        <h3 className="text-2xs font-semibold text-ink-400 uppercase tracking-wider">HEADLINE</h3>
        <span className="text-2xs text-ink-400">{report.dateLabel} · {report.item_count}건 · {report.brand_count}개 브랜드</span>
      </div>
      <div className="px-4 py-5">
        <HeadlineSentences text={content.headline} />
      </div>
    </section>
  )
}

function ActionGrid({ items, onOpenDetail, onCreateTask }: {
  items: ActionItem[]
  onOpenDetail: (item: ActionItem) => void
  onCreateTask: (title: string, memo: string) => void
}) {
  if (items.length === 0) return <EmptyState />
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(a => {
        const pri = SEV_TO_PRIORITY[a.severity] ?? 'medium'
        return (
          <div
            key={a.id}
            onClick={() => onOpenDetail(a)}
            className="relative group bg-card border border-l-px3 border-border rounded-lg p-3.5 flex flex-col cursor-pointer hover:bg-muted/30 transition-colors"
            style={{ borderLeftColor: PRIORITY_META[pri]?.color }}
          >
            <button
              onClick={e => { e.stopPropagation(); onCreateTask(a.title, `${a.summary}\n\n→ ${a.action}`) }}
              className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-2xs px-2 py-1 rounded border border-border bg-card hover:bg-muted text-ink-500 hover:text-foreground shadow-sm"
            >
              <Plus size={10} />
              태스크
            </button>
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <PriorityBars priority={pri} />
              <BrandBadge brandName={a.brand} />
              <span className="text-3xs text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">{a.related_count}건 관련</span>
            </div>
            <p className="text-base font-semibold text-foreground mb-1.5 leading-snug">{a.title}</p>
            <BodyBullets text={a.summary} className="text-sm text-ink-700 leading-relaxed mb-2.5 flex-1" />
            <PriorityCallout color={PRIORITY_META[pri]?.color ?? ''} text={a.action} className="text-xs py-2" />
          </div>
        )
      })}
    </div>
  )
}

function UpcomingList({ items }: { items: InsightContent['upcoming'] }) {
  if (items.length === 0) return <EmptyState />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {items.map((s, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-border last:border-b-0 hover:bg-ink-50">
          <span className="text-xs text-ink-700 min-w-20 flex items-center gap-1">
            <CalendarDays size={11} className="text-ink-400" />
            {s.date}
          </span>
          <span className="flex-1 text-sm text-foreground">{s.title}</span>
          <span className={`text-3xs font-semibold px-1.5 py-0.5 rounded-xs uppercase tracking-[0.04em] ${PRI_CLS[s.priority]}`}>
            {PRI_LABEL[s.priority]}
          </span>
          <BrandBadge brandName={s.brand} />
        </div>
      ))}
    </div>
  )
}

function PendingList({ items }: { items: InsightContent['pending'] }) {
  if (items.length === 0) return <EmptyState />
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {items.map((p, i) => (
        <div key={i} className="flex items-start gap-3 px-3.5 py-2.5 border-b border-border last:border-b-0 hover:bg-ink-50">
          <span className="min-w-[90px] text-sm font-semibold flex items-center gap-1.5 text-foreground pt-0.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: brandColor(p.brand) }} />
            {p.brand}
          </span>
          <span className="flex-1 text-sm text-ink-500 leading-relaxed">{p.items}</span>
          <span className="text-3xs text-status-warn bg-status-warn/10 px-1.5 py-0.5 rounded-full font-semibold shrink-0">{p.count}건</span>
        </div>
      ))}
    </div>
  )
}

function DecisionGrid({ items }: { items: InsightContent['decisions'] }) {
  if (items.length === 0) return <EmptyState />
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(d => (
        <div key={d.id} className="bg-card border border-l-px3 border-l-status-warn border-border rounded-lg p-3 transition-colors">
          <div className="flex items-start gap-1.5 mb-1.5">
            <CheckSquare size={13} className="text-mint-500 shrink-0 mt-0.5" />
            <p className="text-base font-semibold text-foreground leading-snug">{d.title}</p>
          </div>
          <BodyBullets text={d.desc} className="text-sm text-ink-500 leading-relaxed mb-2" />
          <BrandBadge brandName={d.brand} />
        </div>
      ))}
    </div>
  )
}

function filterByBrand<T extends { brand: string }>(items: T[], brands: Set<string>): T[] {
  if (brands.size === 0) return items
  return items.filter(item => brands.has(item.brand))
}

function tagAllowed(tags: Set<Tag>, tag: Tag): boolean {
  return tags.size === 0 || tags.has(tag)
}

export function DailyReportView({ selectedDate, filterBrands, filterTags, filterPriorities, onCreateTask }: Props) {
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerItem, setDrawerItem] = useState<ActionItem | null>(null)

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReport()
  }, [fetchReport])

  const dateLabel = useMemo(() => {
    try { return format(new Date(selectedDate + 'T00:00:00'), 'yyyy년 M월 d일 (eee)', { locale: ko }) }
    catch { return selectedDate }
  }, [selectedDate])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Newspaper size={16} className="animate-spin text-ink-400" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-4">
          <Newspaper size={18} className="text-ink-400" />
        </div>
        <p className="text-sm font-semibold text-foreground mb-1">{dateLabel}</p>
        <p className="text-xs text-ink-400">해당 날짜의 리포트가 아직 생성되지 않았습니다</p>
      </div>
    )
  }

  const raw = report.content
  const filteredActions = tagAllowed(filterTags, 'issue')
    ? filterByBrand(raw.action_items, filterBrands)
      .filter(a => filterPriorities.size === 0 || filterPriorities.has(SEV_TO_PRIORITY[a.severity] ?? 'medium'))
    : []
  const content: InsightContent = {
    headline: raw.headline,
    action_items: filteredActions,
    upcoming: tagAllowed(filterTags, 'schedule') ? filterByBrand(raw.upcoming, filterBrands) : [],
    pending: tagAllowed(filterTags, 'mention') ? filterByBrand(raw.pending, filterBrands) : [],
    decisions: tagAllowed(filterTags, 'decision') ? filterByBrand(raw.decisions, filterBrands) : [],
  }
  const reportWithLabel = { ...report, dateLabel }

  return (
    <>
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="space-y-0">
          <HeadlineCard content={content} report={reportWithLabel} />

          <section className="border-t border-border">
            <SectionHead icon={AlertCircle} title="지금 챙겨야 할 것" count={content.action_items.length} />
            <div className="p-4">
              <ActionGrid items={content.action_items} onOpenDetail={setDrawerItem} onCreateTask={onCreateTask ?? (() => {})} />
            </div>
          </section>

          <div className="grid grid-cols-2 border-t border-border">
            <section className="border-r border-border">
              <SectionHead icon={CalendarDays} title="다가오는 일정" count={content.upcoming.length} />
              <div className="p-4"><UpcomingList items={content.upcoming} /></div>
            </section>
            <section>
              <SectionHead icon={Clock} title="응답 대기" count={content.pending.reduce((s, p) => s + p.count, 0)} />
              <div className="p-4"><PendingList items={content.pending} /></div>
            </section>
          </div>

          <section className="border-t border-border">
            <SectionHead icon={Target} title="결정 사항" count={content.decisions.length} />
            <div className="p-4"><DecisionGrid items={content.decisions} /></div>
          </section>
        </div>
      </div>

      <ActionDetailDrawer
        open={!!drawerItem}
        item={drawerItem}
        date={selectedDate}
        onClose={() => setDrawerItem(null)}
        onCreateTask={onCreateTask}
      />
    </>
  )
}
