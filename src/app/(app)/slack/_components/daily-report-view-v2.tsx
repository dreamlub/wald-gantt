'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarDays, Clock, CheckSquare, ChevronRight, Link2, Check } from 'lucide-react'
import type { InsightContent, ActionItem, Priority, Tag } from '../_lib/types'
import { BrandBadge, PriorityBars } from './badges'
import { PriorityCallout } from './priority-callout'
import { BodyBullets, SEV_TO_PRIORITY } from './daily-report-helpers'
import { brandColor } from '@/lib/history-service'

interface DailyReportData {
  content: InsightContent
  item_count: number
  brand_count: number
}

interface Props {
  report: DailyReportData
  selectedDate: string
  filterBrands: Set<string>
  filterTags: Set<Tag>
  filterPriorities: Set<Priority>
  hideShare?: boolean
}

function dayOfYear(d: Date): number {
  return Math.ceil((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1
}

function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>
      : <span key={i}>{part.replace(/\*/g, '')}</span>
  )
}

const SEV_BADGE: Record<string, { label: string; cls: string }> = {
  urgent: { label: '이슈',    cls: 'bg-status-late/25 text-status-late font-semibold' },
  watch:  { label: '주시',    cls: 'bg-status-warn/25 text-status-warn font-semibold' },
  info:   { label: '진행',    cls: 'bg-ink-200 text-ink-600 font-semibold' },
}


// ── StatPill ─────────────────────────────────────────────────────────
function StatPill({ value, label, cls }: { value: number; label: string; cls: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`text-xl font-black tabular-nums leading-none ${cls}`}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-2xs text-ink-400 leading-none">{label}</span>
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────
function V2Header({
  content, date, selectedDate, hideShare,
}: {
  content: InsightContent
  date: Date
  selectedDate: string
  hideShare?: boolean
}) {
  const vol = format(date, 'MM')
  const no  = String(dayOfYear(date)).padStart(3, '0')
  const dayLabel = format(date, 'MM·dd', { locale: ko })
  const dowLabel = format(date, 'EEE', { locale: ko }).toUpperCase()
  const urgentCount = content.action_items.filter(i => i.severity === 'urgent').length
  const pendingTotal = content.pending.reduce((s, p) => s + p.count, 0)

  const [sharing, setSharing] = useState(false)
  const [copied, setCopied]   = useState(false)

  async function handleShare() {
    setSharing(true)
    try {
      const res  = await fetch('/api/summary/daily-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? '공유 링크 생성 실패')
      await navigator.clipboard.writeText(data.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('[share]', e)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="shrink-0 border-b border-border px-6 py-3 bg-card flex items-center justify-between gap-6">
      <div>
        <p className="text-2xs text-ink-400 uppercase tracking-widest mb-1">
          DAILY REPORT · VOL.{vol} / NO.{no}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight text-foreground tabular-nums leading-none">
            {dayLabel}
          </span>
          <span className="text-base font-semibold text-ink-300">{dowLabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <StatPill value={content.action_items.length} label="총 항목"  cls="text-foreground" />
        <StatPill value={urgentCount}                 label="긴급"     cls="text-status-late" />
        <StatPill value={content.decisions.length}    label="결정"     cls="text-mint-500" />
        <StatPill value={content.upcoming.length}     label="일정"     cls="text-status-future" />
        <StatPill value={pendingTotal}                label="대기"     cls="text-status-warn" />
        {!hideShare && (
          <button
            onClick={handleShare}
            disabled={sharing}
            title="공유 링크 복사"
            className="flex items-center gap-1.5 text-2xs font-medium px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {copied
              ? <><Check size={11} className="text-mint-500" /><span className="text-mint-500">복사됨</span></>
              : <><Link2 size={11} /><span>공유</span></>
            }
          </button>
        )}
      </div>
    </div>
  )
}

// ── Headline cards ────────────────────────────────────────────────────
function HeadlineCard({ text, brand, index }: { text: string; brand?: string; index: number }) {
  const num = String(index + 1).padStart(2, '0')
  return (
    <article
      className="flex-1 rounded-xl border flex flex-col min-w-0 bg-zinc-700"
      style={{ borderColor: 'transparent' }}
    >
      <div className="p-5 flex-1">
        <div className="mb-3">
          <span className="text-3xl font-black leading-none text-white">{num}</span>
        </div>
        <p className="text-sm font-semibold text-white leading-relaxed">
          {renderBold(text)}
        </p>
      </div>
      {brand && (
        <div className="px-5 pb-4">
          <BrandBadge brandName={brand} />
        </div>
      )}
    </article>
  )
}

// headline 텍스트를 문장 단위로 쪼개고, action_items 브랜드명과 매칭
function V2Lead({ headline, actionItems }: { headline: string; actionItems: ActionItem[] }) {
  const sentences = useMemo(() => {
    return headline
      .split('\n')
      .map(l => l.trim().replace(/^[-•*\d.]\s*/, ''))
      .filter(Boolean)
      .flatMap(line => line.split(/(?<=[.!?])\s+/).filter(Boolean))
  }, [headline])

  const brands = useMemo(() =>
    [...new Set(actionItems.map(a => a.brand))],
  [actionItems])

  if (sentences.length === 0) return null

  const gridCls =
    sentences.length === 1 ? 'grid-cols-1 max-w-sm' :
    sentences.length === 2 ? 'grid-cols-2' :
    'grid-cols-3'

  return (
    <div className="shrink-0 border-b border-border px-6 py-5 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xs font-black text-white bg-foreground uppercase tracking-widest px-2 py-1 rounded-2xs">
          LEAD
        </span>
        <span className="text-sm font-semibold text-foreground">오늘의 핵심</span>
        <span className="text-sm text-ink-400">· {sentences.length}건</span>
      </div>
      <div className={`grid ${gridCls} gap-3`}>
        {sentences.map((text, i) => {
          const brand = brands.find(b => text.includes(b))
          return <HeadlineCard key={i} text={text} brand={brand} index={i} />
        })}
      </div>
    </div>
  )
}

// ── Brand Deck ────────────────────────────────────────────────────────
interface UnifiedItem {
  key: string
  date: string
  title: string
  badge: { label: string; cls: string }
  severity: 'urgent' | 'watch' | 'info' | 'other'
  summary?: string
  action?: string
}

// 접힌 행
function CollapsedRow({ item, isLast, onExpand }: {
  item: UnifiedItem; isLast: boolean; accent: string; onExpand: () => void
}) {
  return (
    <div
      onClick={onExpand}
      className={`flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/60 transition-colors ${isLast ? '' : 'border-b border-ink-300'}`}
    >
      {item.date && (
        <span className="text-2xs text-ink-400 tabular-nums shrink-0 mt-0.5">{item.date}</span>
      )}
      <span className="flex-1 text-sm text-foreground leading-snug">{item.title}</span>
      <span className={`shrink-0 text-2xs font-medium px-1.5 py-0.5 rounded ${item.badge.cls}`}>
        {item.badge.label}
      </span>
      <ChevronRight size={12} className="shrink-0 text-ink-300 mt-0.5" />
    </div>
  )
}

// 펼친 행
function ExpandedRow({ item, isLast, accent, onCollapse }: {
  item: UnifiedItem; isLast: boolean; accent: string; onCollapse: () => void
}) {
  const priority = item.severity === 'urgent' ? 'high' : item.severity === 'watch' ? 'medium' : 'low'
  return (
    <div
      onClick={onCollapse}
      className={`bg-muted/25 cursor-pointer hover:bg-muted/40 transition-colors ${isLast ? '' : 'border-b border-ink-300'}`}
    >
      <div className="px-3 py-3.5">
        <div className="flex items-start gap-2 mb-2.5">
          {item.date && (
            <span className="text-2xs text-ink-400 tabular-nums shrink-0 mt-0.5">{item.date}</span>
          )}
          <span className="flex-1 text-sm font-semibold text-foreground leading-snug">{item.title}</span>
          <span className="shrink-0 mt-0.5"><PriorityBars priority={priority} /></span>
          <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${item.badge.cls}`}>
            {item.badge.label}
          </span>
        </div>
        {item.summary && (
          <BodyBullets text={item.summary} className="text-sm text-ink-600 leading-relaxed mb-2.5" />
        )}
        {item.action && (
          <PriorityCallout color={accent} text={item.action} className="text-sm py-2 mt-1" textColor="var(--color-foreground)" />
        )}
      </div>
    </div>
  )
}

function BrandCard({ brand, items }: { brand: string; items: UnifiedItem[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(() =>
    (items.find(i => i.severity === 'urgent') ?? items.find(i => i.severity === 'watch') ?? items[0])?.key ?? null
  )
  const color       = brandColor(brand)
  const accent      = color ?? 'var(--color-ink-300)'

  return (
    <div className="border border-ink-400 rounded-xl overflow-hidden bg-card shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-300 bg-ink-100">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
        <span className="text-sm font-semibold text-foreground flex-1">{brand}</span>
        <span className="text-sm text-ink-400">{items.length}</span>
      </div>
      <div>
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return item.key === expandedKey ? (
            <ExpandedRow key={item.key} item={item} isLast={isLast} accent={accent}
              onCollapse={() => setExpandedKey(null)} />
          ) : (
            <CollapsedRow key={item.key} item={item} isLast={isLast} accent={accent}
              onExpand={() => setExpandedKey(item.key)} />
          )
        })}
      </div>
    </div>
  )
}

function V2BrandDeck({ content, reportDate }: { content: InsightContent; reportDate: string }) {
  const dateShort = reportDate.slice(5).replace('-', '/').replace(/^0+/, '').replace('/0', '/')

  const brandMap = useMemo(() => {
    const map = new Map<string, UnifiedItem[]>()
    const push = (brand: string, item: UnifiedItem) => {
      if (!map.has(brand)) map.set(brand, [])
      map.get(brand)!.push(item)
    }
    content.action_items.forEach(a => push(a.brand, {
      key: a.id, date: dateShort, title: a.title,
      badge: SEV_BADGE[a.severity] ?? SEV_BADGE.info,
      severity: a.severity,
      summary: a.summary, action: a.action,
    }))
    return map
  }, [content, dateShort])

  const brands = useMemo(() => [...brandMap.keys()].sort(), [brandMap])
  const total  = useMemo(() => [...brandMap.values()].reduce((s, v) => s + v.length, 0), [brandMap])

  return (
    <div className="px-6 py-5 border-b border-border bg-background">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xs font-black text-white bg-foreground uppercase tracking-widest px-2 py-1 rounded-2xs">
          BRAND DECK
        </span>
        <span className="text-sm text-ink-500">{brands.length}개 브랜드 · {total}건</span>
        <span className="text-2xs text-ink-300 ml-1">접힌 카드 제목을 누르면 펼쳐집니다</span>
      </div>
      <div className="grid grid-cols-3 gap-4 items-start">
        {brands.map(brand => (
          <BrandCard key={brand} brand={brand} items={brandMap.get(brand)!} />
        ))}
      </div>
    </div>
  )
}

// ── Bottom: Upcoming / Pending / Decisions ────────────────────────────
function V2Bottom({ content }: { content: InsightContent }) {
  const pendingTotal = content.pending.reduce((s, p) => s + p.count, 0)
  return (
    <div className="grid grid-cols-3 min-h-48">
      {/* 다가오는 일정 */}
      <div className="border-r border-border px-6 py-5 bg-background">
        <div className="flex items-center gap-1.5 mb-4">
          <CalendarDays size={11} className="text-ink-400" />
          <span className="text-2xs font-black text-ink-500 uppercase tracking-widest">다가오는 일정</span>
          <span className="text-2xs text-ink-400 font-semibold ml-1">WEEK AHEAD</span>
          <span className="text-2xs font-bold text-ink-400 bg-ink-100 px-1.5 py-0.5 rounded-full ml-auto">
            {content.upcoming.length}
          </span>
        </div>
        <div className="space-y-4">
          {content.upcoming.map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm font-bold text-lilac-600 min-w-[3.5ch] tabular-nums">{u.date}</span>
              <span className="flex-1 text-sm text-foreground truncate">{u.title}</span>
              <BrandBadge brandName={u.brand} />
            </div>
          ))}
        </div>
      </div>

      {/* 응답 대기 */}
      <div className="border-r border-border px-6 py-5 bg-background">
        <div className="flex items-center gap-1.5 mb-4">
          <Clock size={11} className="text-ink-400" />
          <span className="text-2xs font-black text-ink-500 uppercase tracking-widest">응답 대기</span>
          <span className="text-2xs text-ink-400 font-semibold ml-1">AWAITING</span>
          <span className="text-2xs font-bold text-ink-400 bg-ink-100 px-1.5 py-0.5 rounded-full ml-auto">
            {pendingTotal}
          </span>
        </div>
        <div className="space-y-3">
          {content.pending.map((p, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-xl font-black text-status-late tabular-nums leading-none shrink-0">
                {p.count}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground leading-none mb-0.5">{p.brand}</p>
                <p className="text-sm text-ink-400 leading-snug">{p.items}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 결정 사항 */}
      <div className="px-6 py-5 bg-background">
        <div className="flex items-center gap-1.5 mb-4">
          <CheckSquare size={11} className="text-ink-400" />
          <span className="text-2xs font-black text-ink-500 uppercase tracking-widest">결정 사항</span>
          <span className="text-2xs text-ink-400 font-semibold ml-1">ON THE BOOKS</span>
          <span className="text-2xs font-bold text-ink-400 bg-ink-100 px-1.5 py-0.5 rounded-full ml-auto">
            {content.decisions.length}
          </span>
        </div>
        <div className="space-y-3">
          {content.decisions.length === 0 && (
            <p className="text-sm text-ink-300">—</p>
          )}
          {content.decisions.map(d => (
            <div key={d.id} className="border border-border rounded-lg p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xs font-black text-mint-600 border border-mint-500/40 bg-mint-50 px-1.5 py-0.5 rounded-xs uppercase tracking-wide">
                  ✓ CLOSED
                </span>
                <span className="text-2xs text-ink-400">{d.brand}</span>
              </div>
              <p className="text-sm font-semibold text-foreground leading-snug mb-1.5">{d.title}</p>
              <p className="text-sm text-ink-400 leading-relaxed">{d.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 필터 유틸 ─────────────────────────────────────────────────────────
function filterByBrands<T extends { brand: string }>(items: T[], brands: Set<string>): T[] {
  return brands.size === 0 ? items : items.filter(i => brands.has(i.brand))
}
function tagAllowed(tags: Set<Tag>, tag: Tag): boolean {
  return tags.size === 0 || tags.has(tag)
}

// ── Main export ───────────────────────────────────────────────────────
export function DailyReportViewV2({
  report, selectedDate, filterBrands, filterTags, filterPriorities, hideShare,
}: Props) {
  const date = useMemo(() => new Date(selectedDate + 'T00:00:00'), [selectedDate])
  const raw  = report.content

  const filteredActions = useMemo(() => {
    if (!tagAllowed(filterTags, 'issue')) return []
    return filterByBrands(raw.action_items, filterBrands)
      .filter(a => filterPriorities.size === 0 || filterPriorities.has(SEV_TO_PRIORITY[a.severity] ?? 'medium'))
  }, [raw.action_items, filterBrands, filterTags, filterPriorities])

  const content: InsightContent = useMemo(() => ({
    headline: raw.headline,
    action_items: filteredActions,
    upcoming:  tagAllowed(filterTags, 'schedule')  ? filterByBrands(raw.upcoming,  filterBrands) : [],
    pending:   tagAllowed(filterTags, 'mention')   ? filterByBrands(raw.pending,   filterBrands) : [],
    decisions: tagAllowed(filterTags, 'decision')  ? filterByBrands(raw.decisions, filterBrands) : [],
  }), [filteredActions, raw, filterBrands, filterTags])

  return (
    <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <V2Header content={content} date={date} selectedDate={selectedDate} hideShare={hideShare} />
      <V2Lead headline={content.headline} actionItems={content.action_items} />
      <V2BrandDeck content={content} reportDate={selectedDate} />
      <V2Bottom content={content} />
    </div>
  )
}
