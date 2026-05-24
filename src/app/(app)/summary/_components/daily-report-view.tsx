'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Newspaper, AlertCircle,
  CalendarDays, Clock, CheckSquare, Target, Newspaper,
  ArrowRight, Plus, X, Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'

import type { Client, InsightContent, ActionItem, Priority, Tag } from '../_lib/types'
import { PRIORITY_META, TAG_META } from '../_lib/mock-data'
import { PriorityBars } from './badges'
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from '@/components/ui/drawer'

interface Props {
  clients: Client[]
  selectedDate: string
  filterBrands: Set<string>
  filterTags: Set<Tag>
  filterPriorities: Set<Priority>
  onCreateTask?: (title: string, memo: string) => void
}

interface RelatedItem {
  id: string
  title: string
  body: string | null
  tags: Tag[]
  priority: Priority | null
  author: string | null
  thread_count: number
  raw_message_id: string | null
  raw_text: string | null
}

interface SimilarItem {
  id: string
  title: string
  body: string | null
  tags: Tag[]
  occurred_at: string
}

function kstDateLabel(utcStr: string): string {
  const d = new Date(new Date(utcStr).getTime() + 9 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

function slackTextClean(text: string) {
  return text
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')   // <url|label> → label
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1') // <#channel|name> → #name
    .replace(/<@[A-Z0-9]+>/g, '@사용자')       // <@USERID> → @사용자
    .replace(/<[^>]+>/g, '')                   // 나머지 태그 제거
    .trim()
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
      : <span key={i}>{part.replace(/\*/g, '')}</span>
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
        <h3 className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">HEADLINE</h3>
        <span className="text-3xs text-ink-400">{report.dateLabel} · {report.item_count}건 · {report.brand_count}개 브랜드</span>
      </div>
      <div className="px-4 py-5">
        <HeadlineSentences text={content.headline} />
      </div>
    </section>
  )
}

const SEV_TO_PRIORITY: Record<string, Priority> = { urgent: 'high', watch: 'medium', info: 'low' }

function EmptyState() {
  return <p className="text-xs text-ink-300 py-3">—</p>
}

function renderBodyBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : <span key={i}>{part.replace(/\*/g, '')}</span>
  )
}

function BodyBullets({ text, className }: { text: string; className?: string }) {
  const sentences = text
    .split('\n')
    .map(l => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .flatMap(line => line.split(/(?<=[.!?])\s+/).filter(Boolean))

  return (
    <ul className={`flex flex-col gap-1 ${className ?? ''}`}>
      {sentences.map((s, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="mt-[5px] w-1 h-1 rounded-full bg-ink-300 shrink-0" />
          <span>{renderBodyBold(s)}</span>
        </li>
      ))}
    </ul>
  )
}

function RelatedItemCard({ item: r }: { item: RelatedItem }) {
  const [rawOpen, setRawOpen] = useState(false)
  const hasRaw = !!r.raw_text

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* AI 요약 */}
      <div className="bg-muted/40 p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-xs font-semibold text-foreground leading-snug flex-1">{r.title}</p>
          <div className="flex items-center gap-2 shrink-0">
            {r.thread_count > 0 && (
              <span className="text-3xs text-ink-400">{r.thread_count}개 답글</span>
            )}
            {r.author && <span className="text-3xs text-ink-400">{r.author}</span>}
          </div>
        </div>
        {r.body && (
          <BodyBullets text={r.body} className="text-2xs text-ink-500 leading-relaxed mb-2" />
        )}
        {r.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {r.tags.map(tag => {
              const meta = TAG_META[tag]
              if (!meta) return null
              return (
                <span key={tag} className="text-3xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* 원본 Slack 메시지 */}
      {hasRaw && (
        <div className="border-t border-border">
          <button
            onClick={() => setRawOpen(v => !v)}
            className="w-full flex items-center justify-between px-3.5 py-2 text-3xs text-ink-400 hover:bg-muted/30 transition-colors"
          >
            <span className="font-semibold uppercase tracking-wider">원본 메시지</span>
            <span className={`transition-transform ${rawOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {rawOpen && (
            <div className="px-3.5 pb-3.5 text-2xs text-ink-500 leading-relaxed whitespace-pre-wrap break-words bg-background border-t border-border/50">
              {slackTextClean(r.raw_text!)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActionDetailDrawer({
  open, item, date, clients, onClose, onCreateTask,
}: {
  open: boolean
  item: ActionItem | null
  date: string
  clients: Client[]
  onClose: () => void
  onCreateTask?: (title: string, memo: string) => void
}) {
  const [related,  setRelated]  = useState<RelatedItem[]>([])
  const [similar,  setSimilar]  = useState<SimilarItem[]>([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!item || !open) return
    let cancelled = false
    setLoading(true)

    ;(async () => {
      const sb = createClient()

      // occurred_at은 KST 자정(UTC -9h)으로 저장되므로 +09:00 기준으로 비교
      const [y, mo, d] = date.split('-').map(Number)
      const nextDate = new Date(y, mo - 1, d + 1)
      const nextDay = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`

      const { data: histData } = await sb
        .from('client_history')
        .select('id, title, body, tags, priority, author, thread_count, raw_message_id')
        .eq('brand_name', item.brand)
        .gte('occurred_at', `${date}T00:00:00+09:00`)
        .lt('occurred_at', `${nextDay}T00:00:00+09:00`)
        .is('deleted_at', null)

      if (cancelled) return

      type HistRow = { id: string; title: string; body: string | null; tags: Tag[]; priority: Priority | null; author: string | null; thread_count: number; raw_message_id: string | null }
      const rows: HistRow[] = (histData as HistRow[]) ?? []

      // raw 메시지 텍스트 + 실제 작성자(user_name) 일괄 조회
      const rawIds = rows.map(r => r.raw_message_id).filter(Boolean) as string[]
      const rawInfoMap = new Map<string, { text: string | null; userName: string | null }>()

      if (rawIds.length > 0) {
        const { data: rawData } = await sb
          .from('slack_raw_messages')
          .select('id, raw_json')
          .in('id', rawIds)
        for (const r of rawData ?? []) {
          const rj = r.raw_json as { text?: string; user_name?: string; user?: string }
          rawInfoMap.set(r.id as string, {
            text: rj?.text ?? null,
            userName: rj?.user_name ?? rj?.user ?? null,
          })
        }
      }

      const finalRows = rows.map(r => {
        const raw = r.raw_message_id ? rawInfoMap.get(r.raw_message_id) : null
        return {
          ...r,
          author: raw?.userName || r.author || null,
          raw_text: raw?.text ?? null,
        }
      })

      // action item title 키워드로 과거 유사 내역 조회
      const STOP = new Set(['관련', '이슈', '문제', '요청', '확인', '처리', '완료', '진행', '내용', '건', '및', '으로', '위해', '대한', '에서', '통해'])
      const keywords = item.title
        .split(/[\s·\-\(\)\[\]\/,—]+/)
        .map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, ''))
        .filter(w => w.length >= 2 && !STOP.has(w))
        .slice(0, 4)

      let similarRows: SimilarItem[] = []
      if (keywords.length > 0) {
        const orFilter = keywords.map(kw => `title.ilike.%${kw}%`).join(',')
        const { data: simData } = await sb
          .from('client_history')
          .select('id, title, body, tags, occurred_at')
          .eq('brand_name', item.brand)
          .lt('occurred_at', `${date}T00:00:00+09:00`)
          .or(orFilter)
          .is('deleted_at', null)
          .order('occurred_at', { ascending: false })
          .limit(5)
        similarRows = (simData as SimilarItem[]) ?? []
      }

      if (!cancelled) {
        setRelated(finalRows)
        setSimilar(similarRows)
        setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [item, date, open])

  const pri = item ? (SEV_TO_PRIORITY[item.severity] ?? 'medium') : 'medium'

  return (
    <Drawer open={open} onClose={onClose} width={520}>
      <DrawerHeader>
        <div className="flex items-start justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <BrandBadge brandName={item?.brand ?? ''} clients={clients} />
            <PriorityBars priority={pri} />
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors shrink-0">
            <X size={15} />
          </button>
        </div>
        <p className="px-5 pb-4 text-sm font-semibold text-foreground leading-snug">{item?.title}</p>
      </DrawerHeader>

      <DrawerBody className="[&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {/* 상황 요약 */}
        <div className="px-5 py-4 border-b border-border">
          {item?.summary && <BodyBullets text={item.summary} className="text-xs text-ink-700 leading-relaxed" />}
        </div>

        {/* 필요한 액션 */}
        <div className="px-5 py-4 border-b border-border">
          <div
            className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded border border-dashed"
            style={{
              borderColor: `color-mix(in srgb, ${PRIORITY_META[pri]?.color} 40%, transparent)`,
              color: PRIORITY_META[pri]?.color,
              background: `color-mix(in srgb, ${PRIORITY_META[pri]?.color} 6%, transparent)`,
            }}
          >
            <ArrowRight size={13} className="shrink-0" />
            <span>{item?.action}</span>
          </div>
        </div>

        {/* 관련 내역 */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">관련 내역</span>
            {!loading && <span className="text-3xs text-ink-300">{related.length}건</span>}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={14} className="animate-spin text-ink-400" />
            </div>
          ) : related.length === 0 ? (
            <p className="text-xs text-ink-300 py-3">—</p>
          ) : (
            <div className="space-y-2">
              {related.map(r => (
                <RelatedItemCard key={r.id} item={r} />
              ))}
            </div>
          )}
        </div>

        {/* 과거 유사 내역 */}
        {!loading && similar.length > 0 && (
          <div className="px-5 py-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">과거 유사 내역</span>
              <span className="text-3xs text-ink-300">{similar.length}건</span>
            </div>
            <div className="space-y-1.5">
              {similar.map(s => (
                <div key={s.id} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="text-3xs text-ink-400 shrink-0 mt-[2px] tabular-nums">
                      {kstDateLabel(s.occurred_at)}
                    </span>
                    <p className="text-xs text-foreground leading-snug flex-1">{s.title}</p>
                  </div>
                  {s.body && (
                    <BodyBullets text={s.body} className="text-2xs text-ink-400 leading-relaxed ml-[3.5rem]" />
                  )}
                  {s.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 ml-[3.5rem]">
                      {s.tags.map(tag => {
                        const meta = TAG_META[tag]
                        if (!meta) return null
                        return (
                          <span key={tag} className="text-3xs px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: meta.bg, color: meta.color }}>
                            {meta.label}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DrawerBody>

      {onCreateTask && (
        <DrawerFooter>
          <button
            onClick={() => {
              onCreateTask(item?.title ?? '', `${item?.summary ?? ''}\n\n→ ${item?.action ?? ''}`)
              onClose()
            }}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Plus size={13} />
            태스크 생성
          </button>
        </DrawerFooter>
      )}
    </Drawer>
  )
}

function ActionGrid({ items, clients, onOpenDetail, onCreateTask }: {
  items: ActionItem[]
  clients: Client[]
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
            className="relative group bg-card border border-l-[3px] border-border rounded-lg p-3.5 flex flex-col cursor-pointer hover:bg-muted/30 transition-colors"
            style={{ borderLeftColor: PRIORITY_META[pri]?.color }}
          >
            {/* 호버 버튼 */}
            <button
              onClick={e => { e.stopPropagation(); onCreateTask(a.title, `${a.summary}\n\n→ ${a.action}`) }}
              className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-3xs px-2 py-1 rounded border border-border bg-card hover:bg-muted text-ink-500 hover:text-foreground shadow-sm"
            >
              <Plus size={10} />
              태스크
            </button>

            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <PriorityBars priority={pri} />
              <BrandBadge brandName={a.brand} clients={clients} />
              <span className="text-3xs text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">{a.related_count}건 관련</span>
            </div>
            <p className="text-sm font-semibold text-foreground mb-1.5 leading-snug">{a.title}</p>
            <BodyBullets text={a.summary} className="text-xs text-ink-700 leading-relaxed mb-2.5 flex-1" />
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
  if (items.length === 0) return <EmptyState />
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
  if (items.length === 0) return <EmptyState />
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
  if (items.length === 0) return <EmptyState />
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(d => (
        <div key={d.id} className="bg-card border border-l-[3px] border-l-status-warn border-border rounded-lg p-3 transition-colors">
          <div className="flex items-start gap-1.5 mb-1.5">
            <CheckSquare size={13} className="text-mint-500 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-foreground leading-snug">{d.title}</p>
          </div>
          <BodyBullets text={d.desc} className="text-2xs text-ink-500 leading-relaxed mb-2" />
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

export function DailyReportView({ clients, selectedDate, filterBrands, filterTags, filterPriorities, onCreateTask }: Props) {
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

  useEffect(() => { fetchReport() }, [fetchReport])

  const dateLabel = useMemo(() => {
    try {
      return format(new Date(selectedDate + 'T00:00:00'), 'yyyy년 M월 d일 (eee)', { locale: ko })
    } catch { return selectedDate }
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
    <>
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="space-y-0">
          {/* 헤드라인 */}
          <HeadlineCard content={content} report={reportWithLabel} />

          {/* 지금 챙겨야 할 것 */}
          <section className="border-t border-border">
            <SectionHead icon={AlertCircle} title="지금 챙겨야 할 것" count={content.action_items.length} />
            <div className="p-4">
              <ActionGrid
                items={content.action_items}
                clients={clients}
                onOpenDetail={setDrawerItem}
                onCreateTask={onCreateTask ?? (() => {})}
              />
            </div>
          </section>

          {/* 일정 + 응답 대기 — 항상 50:50 */}
          <div className="grid grid-cols-2 border-t border-border">
            <section className="border-r border-border">
              <SectionHead icon={CalendarDays} title="다가오는 일정" count={content.upcoming.length} />
              <div className="p-4">
                <UpcomingList items={content.upcoming} clients={clients} />
              </div>
            </section>
            <section>
              <SectionHead icon={Clock} title="응답 대기" count={content.pending.reduce((s, p) => s + p.count, 0)} />
              <div className="p-4">
                <PendingList items={content.pending} clients={clients} />
              </div>
            </section>
          </div>

          {/* 결정 사항 */}
          <section className="border-t border-border">
            <SectionHead icon={Target} title="결정 사항" count={content.decisions.length} />
            <div className="p-4">
              <DecisionGrid items={content.decisions} clients={clients} />
            </div>
          </section>
        </div>
      </div>

      <ActionDetailDrawer
        open={!!drawerItem}
        item={drawerItem}
        date={selectedDate}
        clients={clients}
        onClose={() => setDrawerItem(null)}
        onCreateTask={onCreateTask}
      />
    </>
  )
}
