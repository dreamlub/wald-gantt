import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { GanttTask, ReviewCandidate } from '@/types'
import type { HistoryItem, Tag } from '../slack/_lib/types'
import { BrandIcon } from '@/components/brand-icon'
import { STATUS_COLOR, STATUS_LABEL } from '../tasks/_constants'
import { TAG_META } from '../slack/_lib/constants'
import { taskHref, summaryHref, fmtDay, daysUntil, statusTone, priorityLabel, todayLocal } from './helpers'

export function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      {icon}
      {label}
    </Link>
  )
}

const TONE_CLASS = {
  lilac: 'bg-lilac-100 text-lilac-600',
  late: 'bg-red-50 text-status-late',
  coral: 'bg-coral-100 text-coral-500',
  mint: 'bg-mint-100 text-mint-500',
  teal: 'bg-teal-100 text-teal-700',
} as const

export type MetricTone = keyof typeof TONE_CLASS

export function MetricCard({ label, value, detail, icon, tone, href }: {
  label: string
  value: number | string
  detail: string
  icon: React.ReactNode
  tone: MetricTone
  href?: string
}) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-400 uppercase tracking-wider">{label}</span>
        <span className={`inline-flex size-7 items-center justify-center rounded-md ${TONE_CLASS[tone]}`}>{icon}</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-2xl font-semibold tracking-normal text-foreground">{value}</span>
        <span className="pb-1 text-sm text-muted-foreground">{detail}</span>
      </div>
    </>
  )
  if (href) {
    return (
      <Link href={href} className="rounded-lg border border-border bg-card px-4 py-3 hover:border-lilac-300 hover:bg-muted/40 transition-colors">
        {content}
      </Link>
    )
  }
  return <div className="rounded-lg border border-border bg-card px-4 py-3">{content}</div>
}

export function Panel({ title, href, icon, badge, children }: {
  title: string
  href: string
  icon: React.ReactNode
  badge?: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="h-10 flex items-center gap-2 px-4 border-b bg-muted">
        <span className="text-ink-400">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {badge != null && badge > 0 && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-foreground text-background text-xs font-medium">{badge}</span>
        )}
        <Link href={href} className="ml-auto inline-flex items-center gap-1 text-sm text-ink-400 hover:text-foreground">
          열기
          <ArrowRight size={11} />
        </Link>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <div className="text-sm text-ink-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}

export function TaskRow({ task, today, compact = false }: { task: GanttTask; today?: string; compact?: boolean }) {
  const due = today ? daysUntil(task.due_date, today) : null
  const href = taskHref(task, today ?? todayLocal())
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[task.status] }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-foreground truncate`}>{task.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-400">
          <span className="rounded px-1.5 py-0.5" style={statusTone(task.status)}>{STATUS_LABEL[task.status]}</span>
          {task.assignee && <span className="truncate">{task.assignee}</span>}
        </div>
      </div>
      {task.due_date && (
        <span className={`text-sm shrink-0 ${due !== null && due < 0 ? 'text-status-late font-semibold' : 'text-muted-foreground'}`}>
          {fmtDay(task.due_date)}
        </span>
      )}
    </Link>
  )
}

export function HistoryRow({ item }: { item: HistoryItem }) {
  const p = priorityLabel(item.priority)
  return (
    <Link href={summaryHref({ priority: item.priority ?? undefined, query: item.title })} className="block rounded-md border border-border px-3 py-2.5 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {item.brand_name && <BrandIcon name={item.brand_name} size={8} />}
        <span className="text-sm font-semibold text-foreground truncate">{item.title}</span>
        {p && <span className="ml-auto shrink-0 text-sm font-medium" style={{ color: p.color }}>{p.label}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-400">
        <span className="truncate">{item.brand_name ?? item.channel}</span>
        <span>{fmtDay(item.occurred_at)}</span>
      </div>
    </Link>
  )
}

export function DecisionRow({ item }: { item: HistoryItem }) {
  const tags = (item.tags ?? []).filter((tag): tag is Tag => tag in TAG_META).slice(0, 2)
  return (
    <Link href={summaryHref({ tag: 'decision', query: item.title })} className="block rounded-md border border-border px-3 py-2.5 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <div className="text-sm font-semibold text-foreground truncate">{item.title}</div>
      <div className="mt-2 flex items-center gap-1.5 min-w-0">
        {item.brand_name && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <BrandIcon name={item.brand_name} size={10} />
            <span className="truncate">{item.brand_name}</span>
          </span>
        )}
        <span className="ml-auto flex gap-1 shrink-0">
          {tags.map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded" style={{ background: TAG_META[tag].bg, color: TAG_META[tag].color }}>
              {TAG_META[tag].label}
            </span>
          ))}
        </span>
      </div>
    </Link>
  )
}

const REVIEW_PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  high:   { label: '높음', className: 'bg-red-100 text-red-600' },
  medium: { label: '보통', className: 'bg-yellow-100 text-yellow-600' },
  low:    { label: '낮음', className: 'bg-gray-100 text-gray-500' },
}

export function ReviewRow({ candidate }: { candidate: ReviewCandidate }) {
  const badge = candidate.priority ? REVIEW_PRIORITY_BADGE[candidate.priority] : null
  return (
    <Link href="/review" className="block rounded-md border border-border px-3 py-2.5 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {badge && <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${badge.className}`}>{badge.label}</span>}
        <span className="text-sm font-semibold text-foreground truncate">{candidate.title}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-400">
        {candidate.brand && (
          <span className="inline-flex items-center gap-1 min-w-0">
            <BrandIcon name={candidate.brand} size={8} />
            <span className="truncate">{candidate.brand}</span>
          </span>
        )}
        <span className="ml-auto shrink-0">{candidate.source_date}</span>
      </div>
    </Link>
  )
}

export function NoteRow({ note }: { note: { id: string; title: string; content: string } }) {
  const text = note.title.trim() || note.content.slice(0, 80).trim() || '(빈 메모)'
  return (
    <Link href="/notes" className="block rounded-md border border-border px-3 py-2.5 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <span className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{text}</span>
    </Link>
  )
}

export function IssueRow({ issue, today }: { issue: { id: string; title: string; brand_name: string | null; last_seen: string | null }; today: string }) {
  const quietDays = issue.last_seen ? daysUntil(issue.last_seen.slice(0, 10), today) : null
  const quiet = quietDays !== null ? Math.abs(quietDays) : null
  return (
    <Link href="/slack" className="block rounded-md border border-border px-3 py-2.5 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {issue.brand_name && <BrandIcon name={issue.brand_name} size={8} />}
        <span className="text-sm font-semibold text-foreground truncate">{issue.title}</span>
        {quiet != null && (
          <span className={`ml-auto shrink-0 text-sm font-medium ${quiet >= 30 ? 'text-status-late' : 'text-ink-400'}`}>
            {quiet}일 조용
          </span>
        )}
      </div>
    </Link>
  )
}

export function EmptyLine({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-sm text-ink-400">
      {label}
    </div>
  )
}
