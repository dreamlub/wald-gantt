import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  ListTodo,
  MessageSquare,
  Sparkles,
  Target,
  Timer,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { GanttProject, GanttTask, TaskStatus, WeeklyInsightContent } from '@/types'
import type { Client, HistoryItem, Priority, Tag } from './summary/_lib/types'
import { STATUS_COLOR, STATUS_LABEL } from './tasks/_constants'
import { TAG_META, PRIORITY_META } from './summary/_lib/mock-data'

type WeeklyInsightRow = {
  week_start: string
  content: WeeklyInsightContent | null
  analyzed_at: string | null
}

const DAY_MS = 86_400_000

function todayLocal(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function plainInsightText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function queryValue(value: string): string {
  return encodeURIComponent(value)
}

function tasksQuickHref(quick: string): string {
  return `/tasks?quick=${quick}`
}

function taskHref(task: GanttTask, today: string): string {
  if (task.scheduled_at) {
    const date = task.scheduled_at.slice(0, 10)
    return `/calendar?date=${date}&highlight=${task.id}`
  }
  const q = `&q=${queryValue(task.title)}`
  if (task.due_date && task.due_date < today) return `${tasksQuickHref('overdue')}${q}`
  if (task.due_date === today) return `${tasksQuickHref('due-today')}${q}`
  if (task.due_date && task.due_date > today) return `${tasksQuickHref('due-this-week')}${q}`
  return `/tasks?q=${queryValue(task.title)}`
}

function summaryHref(filters: { priority?: Priority; tag?: Tag; query?: string }): string {
  const params = new URLSearchParams()
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.tag) params.set('tags', filters.tag)
  if (filters.query) params.set('q', filters.query)
  const qs = params.toString()
  return qs ? `/summary?${qs}` : '/summary'
}

function daysUntil(date: string | null | undefined, today: string): number | null {
  if (!date) return null
  return Math.round((new Date(date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / DAY_MS)
}

function statusTone(status: TaskStatus) {
  return {
    color: STATUS_COLOR[status],
    backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[status]} 12%, transparent)`,
  }
}

function priorityLabel(priority: Priority | null) {
  if (!priority) return null
  return PRIORITY_META[priority]
}

async function getWorkspaceId() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { sb, userEmail: '', workspaceId: null as string | null }

  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  return { sb, userEmail: user.email ?? '', workspaceId: member?.workspace_id ?? null }
}

export const metadata = {
  title: 'Command Center - Wald',
}

export default async function CommandCenterPage() {
  const { sb, workspaceId } = await getWorkspaceId()
  const today = todayLocal()
  const weekEnd = addDays(today, 6)

  if (!workspaceId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-xs text-muted-foreground">워크스페이스를 불러오지 못했습니다.</div>
      </div>
    )
  }

  const [tasksRes, projectsRes, historyRes, clientsRes, weeklyRes] = await Promise.all([
    sb
      .from('gantt_tasks')
      .select('id, workspace_id, title, status, type, assignee, start_date, due_date, memo, labels, parent_id, priority, sort_order, created_at, updated_at, deleted_at, archived_at, scheduled_at, duration_minutes')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(80),
    sb
      .from('gantt_projects')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('end_date', { ascending: true, nullsFirst: false })
      .limit(80),
    sb
      .from('client_history')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false })
      .limit(80),
    sb
      .from('clients')
      .select('id, name, name_en, color, keywords')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true }),
    sb
      .from('weekly_insights')
      .select('week_start, content, analyzed_at')
      .eq('workspace_id', workspaceId)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const tasks = ((tasksRes.data ?? []) as GanttTask[])
  const projects = ((projectsRes.data ?? []) as GanttProject[])
  const history = ((historyRes.data ?? []) as HistoryItem[])
  const clients = ((clientsRes.data ?? []) as Client[])
  const latestWeekly = (weeklyRes.data as WeeklyInsightRow | null) ?? null
  const clientById = new Map(clients.map(c => [c.id, c]))

  const openTasks = tasks.filter(t => t.status !== 'done')
  const scheduledToday = tasks.filter(t => t.scheduled_at?.slice(0, 10) === today)
  const dueToday = openTasks.filter(t => t.due_date === today)
  const dueThisWeek = openTasks.filter(t => t.due_date && t.due_date >= today && t.due_date <= weekEnd)
  const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < today)
  const waitingTasks = openTasks.filter(t => t.status === 'pending')
  const inProgressTasks = openTasks.filter(t => t.status === 'in-progress')

  const highHistoryAll = history.filter(h => h.priority === 'high')
  const highHistory = highHistoryAll.slice(0, 5)
  const decisionItems = history.filter(h => (h.tags ?? []).includes('decision')).slice(0, 4)
  const mentionItems = history.filter(h => (h.tags ?? []).includes('mention')).slice(0, 4)

  const projectRisks = projects
    .filter(p => p.status !== 'done')
    .map(p => ({ project: p, days: daysUntil(p.end_date, today) }))
    .filter(x => x.days !== null && x.days <= 14)
    .slice(0, 6)

  const workload = [...new Set(openTasks.map(t => t.assignee).filter(Boolean) as string[])]
    .map(name => ({
      name,
      count: openTasks.filter(t => t.assignee === name).length,
      urgent: openTasks.filter(t => t.assignee === name && t.due_date && t.due_date <= weekEnd).length,
    }))
    .sort((a, b) => b.urgent - a.urgent || b.count - a.count)
    .slice(0, 5)

  const focusList = [
    ...overdueTasks.slice(0, 2).map(task => ({ kind: '지연', title: task.title, href: taskHref(task, today), tone: 'late' as const })),
    ...highHistory.slice(0, 2).map(item => ({ kind: '이슈', title: item.title, href: summaryHref({ priority: 'high', query: item.title }), tone: 'high' as const })),
    ...dueToday.slice(0, 2).map(task => ({ kind: '오늘', title: task.title, href: taskHref(task, today), tone: 'today' as const })),
  ].slice(0, 5)

  const todayExecutionCount = new Set([...dueToday, ...scheduledToday].map(t => t.id)).size
  const plannedMinutes = scheduledToday.reduce((sum, t) => sum + (t.duration_minutes ?? 60), 0)
  const plannedHours = Math.round(plannedMinutes / 60 * 10) / 10

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <header className="h-12 shrink-0 border-b bg-card flex items-center px-5 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-foreground text-background">
            <Sparkles size={13} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xs font-semibold text-foreground uppercase tracking-wider">Command Center</h1>
            <p className="text-[10px] text-ink-400">{fmtDay(today)} 운영 브리핑</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <QuickLink href="/summary" label="Summary" icon={<MessageSquare size={12} />} />
          <QuickLink href="/tasks" label="Tasks" icon={<ListTodo size={12} />} />
          <QuickLink href="/calendar" label="Calendar" icon={<CalendarDays size={12} />} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-5 max-w-[1500px] mx-auto">
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard href={tasksQuickHref('due-today')} label="오늘 실행" value={todayExecutionCount} detail={`예정 ${scheduledToday.length} · 마감 ${dueToday.length}`} icon={<Timer size={14} />} tone="lilac" />
            <MetricCard href={tasksQuickHref('overdue')} label="지연 태스크" value={overdueTasks.length} detail={`대기 ${waitingTasks.length} · 진행 ${inProgressTasks.length}`} icon={<AlertTriangle size={14} />} tone="late" />
            <MetricCard href={summaryHref({ priority: 'high' })} label="고객 이슈" value={highHistoryAll.length} detail={`최근 high priority`} icon={<MessageSquare size={14} />} tone="coral" />
            <MetricCard href={tasksQuickHref('due-this-week')} label="이번 주 마감" value={dueThisWeek.length} detail={`계획 ${plannedHours}h time block`} icon={<CalendarDays size={14} />} tone="mint" />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-4">
            <Panel title="지금 볼 것" href={tasksQuickHref('overdue')} icon={<Flag size={13} />}>
              {focusList.length > 0 ? (
                <div className="divide-y divide-border">
                  {focusList.map((item, i) => (
                    <Link key={`${item.kind}-${i}`} href={item.href} className="flex items-center gap-3 py-3 group">
                      <span className={`w-10 shrink-0 text-center rounded px-1.5 py-1 text-[10px] font-semibold ${
                        item.tone === 'late' ? 'bg-red-50 text-status-late' :
                        item.tone === 'high' ? 'bg-coral-100 text-coral-500' :
                        'bg-lilac-100 text-lilac-600'
                      }`}>
                        {item.kind}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-lilac-600">
                        {item.title}
                      </span>
                      <ArrowRight size={13} className="text-ink-300 group-hover:text-lilac-500" />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyLine label="긴급히 볼 항목이 없습니다." />
              )}
            </Panel>

            <Panel title="오늘의 시간" href={`/calendar?date=${today}`} icon={<Clock3 size={13} />}>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="타임블록" value={`${scheduledToday.length}`} />
                <MiniStat label="계획 시간" value={`${plannedHours}h`} />
                <MiniStat label="미배치 마감" value={`${Math.max(0, dueToday.length - scheduledToday.length)}`} />
              </div>
              <div className="mt-4 space-y-2">
                {scheduledToday.slice(0, 4).map(task => (
                  <TaskRow key={task.id} task={task} today={today} compact />
                ))}
                {scheduledToday.length === 0 && <EmptyLine label="오늘 캘린더에 배치된 태스크가 없습니다." />}
              </div>
            </Panel>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Panel title="내 실행 큐" href={tasksQuickHref('overdue')} icon={<ListTodo size={13} />}>
              <div className="space-y-2">
                {[...overdueTasks, ...dueToday, ...dueThisWeek].slice(0, 7).map(task => (
                  <TaskRow key={task.id} task={task} today={today} />
                ))}
                {openTasks.length === 0 && <EmptyLine label="열린 태스크가 없습니다." />}
              </div>
            </Panel>

            <Panel title="고객 신호" href={summaryHref({ priority: 'high' })} icon={<MessageSquare size={13} />}>
              <div className="space-y-2">
                {highHistory.map(item => (
                  <HistoryRow key={item.id} item={item} client={clientById.get(item.client_id)} />
                ))}
                {highHistory.length === 0 && <EmptyLine label="최근 high priority 이슈가 없습니다." />}
              </div>
            </Panel>

            <Panel title="결정 대기" href="/summary?tags=decision" icon={<Target size={13} />}>
              <div className="space-y-2">
                {decisionItems.map(item => (
                  <DecisionRow key={item.id} item={item} client={clientById.get(item.client_id)} />
                ))}
                {decisionItems.length === 0 && <EmptyLine label="최근 결정 태그 항목이 없습니다." />}
              </div>
            </Panel>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
            <Panel title="프로젝트 리스크" href="/projects" icon={<AlertTriangle size={13} />}>
              <div className="grid md:grid-cols-2 gap-2">
                {projectRisks.map(({ project, days }) => (
                  <Link key={project.id} href="/projects" className="border border-border rounded-lg px-3 py-2.5 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: project.priority === 3 ? 'var(--color-status-late)' : 'var(--color-status-warn)' }} />
                      <span className="text-xs font-semibold text-foreground truncate">{project.name}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-400">
                      <span className="truncate">{project.team ?? project.pm ?? '담당 미지정'}</span>
                      <span className={days !== null && days < 0 ? 'text-status-late font-medium' : 'text-muted-foreground'}>
                        {days !== null && days < 0 ? `${Math.abs(days)}일 지연` : `${days}일 남음`}
                      </span>
                    </div>
                  </Link>
                ))}
                {projectRisks.length === 0 && <EmptyLine label="2주 내 종료 리스크가 없습니다." />}
              </div>
            </Panel>

            <Panel title="팀 워크로드" href="/tasks" icon={<Users size={13} />}>
              <div className="space-y-3">
                {workload.map(person => {
                  const width = Math.min(100, person.count * 14)
                  return (
                    <Link key={person.name} href={`/tasks?assignee=${queryValue(person.name)}`} className="block rounded-md -mx-2 px-2 py-1.5 hover:bg-muted/60 transition-colors">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground truncate">{person.name}</span>
                        <span className="text-[11px] text-ink-400">{person.urgent}/{person.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-lilac-500" style={{ width: `${width}%` }} />
                      </div>
                    </Link>
                  )
                })}
                {workload.length === 0 && <EmptyLine label="담당자 지정 태스크가 없습니다." />}
              </div>
            </Panel>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Weekly 인사이트" href="/weekly" icon={<FileText size={13} />}>
              {latestWeekly?.content ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground leading-relaxed">{plainInsightText(latestWeekly.content.headline)}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{plainInsightText(latestWeekly.content.changes)}</p>
                  <div className="grid grid-cols-4 gap-2">
                    <MiniStat label="작성" value={latestWeekly.content.stats.authors.count} />
                    <MiniStat label="이슈" value={latestWeekly.content.stats.issues.count} />
                    <MiniStat label="결정" value={latestWeekly.content.stats.decisions.count} />
                    <MiniStat label="계획" value={latestWeekly.content.stats.plans.count} />
                  </div>
                </div>
              ) : (
                <EmptyLine label="분석된 Weekly 인사이트가 없습니다." />
              )}
            </Panel>

            <Panel title="나를 부른 일" href={summaryHref({ tag: 'mention' })} icon={<CheckCircle2 size={13} />}>
              <div className="space-y-2">
                {mentionItems.map(item => (
                  <HistoryRow key={item.id} item={item} client={clientById.get(item.client_id)} />
                ))}
                {mentionItems.length === 0 && <EmptyLine label="최근 멘션 항목이 없습니다." />}
              </div>
            </Panel>
          </section>
        </div>
      </main>
    </div>
  )
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      {icon}
      {label}
    </Link>
  )
}

function MetricCard({ label, value, detail, icon, tone, href }: {
  label: string
  value: number | string
  detail: string
  icon: React.ReactNode
  tone: 'lilac' | 'late' | 'coral' | 'mint'
  href?: string
}) {
  const toneClass = {
    lilac: 'bg-lilac-100 text-lilac-600',
    late: 'bg-red-50 text-status-late',
    coral: 'bg-coral-100 text-coral-500',
    mint: 'bg-mint-100 text-mint-500',
  }[tone]
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{label}</span>
        <span className={`inline-flex size-7 items-center justify-center rounded-md ${toneClass}`}>{icon}</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-2xl font-semibold tracking-normal text-foreground">{value}</span>
        <span className="pb-1 text-[11px] text-muted-foreground">{detail}</span>
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

function Panel({ title, href, icon, children }: {
  title: string
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="h-10 flex items-center gap-2 px-4 border-b bg-muted">
        <span className="text-ink-400">{icon}</span>
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
        <Link href={href} className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-400 hover:text-foreground">
          열기
          <ArrowRight size={11} />
        </Link>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-2">
      <div className="text-[10px] text-ink-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}

function TaskRow({ task, today, compact = false }: { task: GanttTask; today?: string; compact?: boolean }) {
  const due = today ? daysUntil(task.due_date, today) : null
  const href = taskHref(task, today ?? todayLocal())
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[task.status] }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-foreground truncate`}>{task.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-400">
          <span className="rounded px-1.5 py-0.5" style={statusTone(task.status)}>{STATUS_LABEL[task.status]}</span>
          {task.assignee && <span className="truncate">{task.assignee}</span>}
        </div>
      </div>
      {task.due_date && (
        <span className={`text-[11px] shrink-0 ${due !== null && due < 0 ? 'text-status-late font-semibold' : 'text-muted-foreground'}`}>
          {fmtDay(task.due_date)}
        </span>
      )}
    </Link>
  )
}

function HistoryRow({ item, client }: { item: HistoryItem; client?: Client }) {
  const p = priorityLabel(item.priority)
  return (
    <Link href={summaryHref({ priority: item.priority ?? undefined, query: item.title })} className="block rounded-md border border-border px-3 py-2.5 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {client && <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: client.color }} />}
        <span className="text-xs font-semibold text-foreground truncate">{item.title}</span>
        {p && <span className="ml-auto shrink-0 text-[10px] font-medium" style={{ color: p.color }}>{p.label}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-400">
        <span className="truncate">{client?.name ?? item.channel}</span>
        <span>{fmtDay(item.occurred_at)}</span>
      </div>
    </Link>
  )
}

function DecisionRow({ item, client }: { item: HistoryItem; client?: Client }) {
  const tags = (item.tags ?? []).filter((tag): tag is Tag => tag in TAG_META).slice(0, 2)
  return (
    <Link href={summaryHref({ tag: 'decision', query: item.title })} className="block rounded-md border border-border px-3 py-2.5 hover:border-lilac-300 hover:bg-muted/50 transition-colors">
      <div className="text-xs font-semibold text-foreground truncate">{item.title}</div>
      <div className="mt-2 flex items-center gap-1.5 min-w-0">
        {client && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
            <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: client.color }} />
            <span className="truncate">{client.name}</span>
          </span>
        )}
        <span className="ml-auto flex gap-1 shrink-0">
          {tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: TAG_META[tag].bg, color: TAG_META[tag].color }}>
              {TAG_META[tag].label}
            </span>
          ))}
        </span>
      </div>
    </Link>
  )
}

function EmptyLine({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-ink-400">
      {label}
    </div>
  )
}
