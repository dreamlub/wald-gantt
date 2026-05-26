import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { GanttProject, GanttStatus } from '@/types'
import { toShortDate } from '@/lib/date-utils'

const STATUS_DOT: Record<GanttStatus, string> = {
  'to-do':       'var(--task-status-todo)',
  'in-progress': 'var(--task-status-in-progress)',
  'pending':     'var(--task-status-pending)',
  'backlog':     'var(--task-status-backlog)',
  'done':        'var(--task-status-done)',
}

const STATUS_LABEL: Record<GanttStatus, string> = {
  'to-do': 'To-Do', 'in-progress': 'In Progress',
  'pending': 'Pending', 'backlog': 'Backlog', 'done': 'Done',
}

const DAY_MS = 86_400_000

function daysFrom(dateStr: string, today: string): number {
  return Math.round(
    (new Date(dateStr + 'T00:00:00+09:00').getTime() - new Date(today + 'T00:00:00+09:00').getTime()) / DAY_MS
  )
}

interface Props {
  projects: GanttProject[]
  today: string
}

export function ProjectsSection({ projects, today }: Props) {
  const overdue = projects
    .filter(p => p.status !== 'done' && p.end_date && p.end_date < today)
    .sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''))

  const inProgress = projects
    .filter(p => p.status === 'in-progress' && (!p.end_date || p.end_date >= today))
    .sort((a, b) => {
      if (!a.end_date && !b.end_date) return 0
      if (!a.end_date) return 1
      if (!b.end_date) return -1
      return a.end_date.localeCompare(b.end_date)
    })

  const upcoming = projects
    .filter(p => ['to-do', 'backlog', 'pending'].includes(p.status))
    .sort((a, b) => {
      if (!a.start_date && !b.start_date) return 0
      if (!a.start_date) return 1
      if (!b.start_date) return -1
      return a.start_date.localeCompare(b.start_date)
    })

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="h-10 flex items-center gap-3 px-4 border-b bg-muted">
        <h2 className="text-xs font-semibold text-foreground">프로젝트 현황</h2>
        <div className="flex items-center gap-2 text-2xs">
          {overdue.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-status-late font-semibold">
              지연 {overdue.length}
            </span>
          )}
          <span className="text-ink-400">진행 {inProgress.length}</span>
          <span className="text-ink-400">예정 {upcoming.length}</span>
        </div>
        <Link href="/projects" className="ml-auto inline-flex items-center gap-1 text-2xs text-ink-400 hover:text-foreground">
          열기 <ArrowRight size={11} />
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 divide-y xl:divide-y-0 xl:divide-x divide-border">
        <Column label="지연 중" tone="late" projects={overdue} today={today} />
        <Column label="진행 중" tone="active" projects={inProgress} today={today} />
        <Column label="다가오는" tone="upcoming" projects={upcoming} today={today} />
      </div>
    </section>
  )
}

function Column({ label, tone, projects, today }: {
  label: string
  tone: 'late' | 'active' | 'upcoming'
  projects: GanttProject[]
  today: string
}) {
  const labelColor = {
    late: 'text-status-late',
    active: 'text-[var(--task-status-in-progress)]',
    upcoming: 'text-muted-foreground',
  }[tone]

  const visible = projects.slice(0, 6)
  const rest = projects.length - visible.length

  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <span className={`text-2xs font-semibold uppercase tracking-wider ${labelColor}`}>{label}</span>
        <span className="text-2xs text-ink-300">{projects.length}</span>
      </div>
      <div className="space-y-2">
        {visible.length > 0 ? visible.map(p => (
          <ProjectRow key={p.id} project={p} today={today} />
        )) : (
          <p className="text-2xs text-ink-300 py-2">없음</p>
        )}
        {rest > 0 && (
          <Link href="/projects" className="block text-2xs text-ink-400 hover:text-foreground pt-1">
            + {rest}개 더 보기
          </Link>
        )}
      </div>
    </div>
  )
}

function ProjectRow({ project: p, today }: { project: GanttProject; today: string }) {
  const days = p.end_date ? daysFrom(p.end_date, today) : null
  const dot = STATUS_DOT[p.status]

  return (
    <Link
      href="/projects"
      className="flex items-start gap-2 rounded-md border border-border px-3 py-2 hover:border-lilac-300 hover:bg-muted/50 transition-colors"
    >
      <span className="mt-1 size-1.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-foreground truncate">{p.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-400 flex-wrap">
          <span style={{ color: dot }}>{STATUS_LABEL[p.status]}</span>
          {(p.team || p.pm) && <span className="truncate">{p.team ?? p.pm}</span>}
          {(p.start_date || p.end_date) && (
            <span className="shrink-0">
              {p.start_date ? toShortDate(p.start_date) : '?'} → {p.end_date ? toShortDate(p.end_date) : '미정'}
            </span>
          )}
        </div>
      </div>
      {days !== null && (
        <span className={`shrink-0 text-2xs font-semibold mt-0.5 ${
          days < 0 ? 'text-status-late' : days <= 7 ? 'text-status-warn' : 'text-ink-400'
        }`}>
          {days < 0 ? `${Math.abs(days)}일 지연` : days === 0 ? '오늘' : `D-${days}`}
        </span>
      )}
    </Link>
  )
}
