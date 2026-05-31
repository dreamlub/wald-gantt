import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileText,
  Inbox,
  ListTodo,
  MessageSquare,
  Radar,
  Sparkles,
  Target,
  ClipboardList,
  Timer,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { GanttProject, GanttTask, ReviewCandidate, WeeklyInsightContent } from '@/types'
import type { HistoryItem } from './slack/_lib/types'
import { ProjectsSection } from './_ProjectsSection'
import { TodayTasksPanel } from './_TodayTasksPanel'
import {
  todayLocal, addDays, fmtDay, plainInsightText, tasksQuickHref, summaryHref, reviewPriorityRank,
} from './_home/helpers'
import {
  QuickLink, MetricCard, Panel, MiniStat, TaskRow, HistoryRow, DecisionRow,
  ReviewRow, NoteRow, IssueRow, EmptyLine,
} from './_home/ui'

type WeeklyInsightRow = {
  week_start: string
  content: WeeklyInsightContent | null
  analyzed_at: string | null
}

type NoteInbox = { id: string; title: string; content: string }
type OpenIssue = { id: string; title: string; brand_name: string | null; last_seen: string | null }

async function getSession() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { sb, userId: null as string | null, workspaceId: null as string | null }
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  return { sb, userId: user.id, workspaceId: member?.workspace_id ?? null }
}

export const metadata = {
  title: '운영 관제판 - Wald',
}

export default async function CommandCenterPage() {
  const { sb, userId, workspaceId } = await getSession()
  const today    = todayLocal()
  const tomorrow = addDays(today, 1)
  const weekEnd  = addDays(today, 6)

  if (!workspaceId || !userId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">워크스페이스를 불러오지 못했습니다.</div>
      </div>
    )
  }

  const [tasksRes, projectsRes, historyRes, weeklyRes, reviewRes, notesRes, issuesRes, dailyRes,
         reviewCountRes, reviewHighCountRes, notesCountRes] = await Promise.all([
    sb.from('gantt_tasks')
      .select('id, workspace_id, title, status, type, assignee, start_date, due_date, memo, labels, parent_id, priority, sort_order, created_at, updated_at, deleted_at, archived_at, scheduled_at, duration_minutes')
      .eq('workspace_id', workspaceId).is('deleted_at', null).is('archived_at', null)
      .order('due_date', { ascending: true, nullsFirst: false }).limit(80),
    sb.from('gantt_projects').select('*')
      .eq('workspace_id', workspaceId).is('deleted_at', null)
      .order('end_date', { ascending: true, nullsFirst: false }).limit(200),
    sb.from('client_history').select('*')
      .eq('workspace_id', workspaceId).is('deleted_at', null)
      .order('occurred_at', { ascending: false }).limit(80),
    sb.from('weekly_insights').select('week_start, content, analyzed_at')
      .eq('workspace_id', workspaceId).order('week_start', { ascending: false }).limit(1).maybeSingle(),
    sb.from('review_candidates').select('*')
      .eq('workspace_id', workspaceId).eq('status', 'pending')
      .order('source_date', { ascending: false }).limit(60),
    sb.from('notes').select('id, title, content')
      .eq('user_id', userId).eq('status', 'inbox').is('deleted_at', null)
      .order('updated_at', { ascending: false }).limit(60),
    sb.from('issues').select('id, title, brand_name, last_seen')
      .eq('workspace_id', workspaceId).eq('status', 'open')
      .order('last_seen', { ascending: true, nullsFirst: true }).limit(8),
    sb.from('daily_reports').select('report_date')
      .eq('workspace_id', workspaceId).order('report_date', { ascending: false }).limit(1).maybeSingle(),
    sb.from('review_candidates').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'pending'),
    sb.from('review_candidates').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'pending').eq('priority', 'high'),
    sb.from('notes').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'inbox').is('deleted_at', null),
  ])

  const tasks       = (tasksRes.data ?? []) as GanttTask[]
  const projects    = (projectsRes.data ?? []) as GanttProject[]
  const history     = (historyRes.data ?? []) as HistoryItem[]
  const latestWeekly = (weeklyRes.data as WeeklyInsightRow | null) ?? null
  const reviewPending = (reviewRes.data ?? []) as ReviewCandidate[]
  const notesInbox  = (notesRes.data ?? []) as NoteInbox[]
  const openIssues  = (issuesRes.data ?? []) as OpenIssue[]
  const latestDaily = (dailyRes.data as { report_date: string } | null) ?? null

  const openTasks       = tasks.filter(t => t.status !== 'done')
  const scheduledToday  = tasks.filter(t => t.scheduled_at?.slice(0, 10) === today)
  const dueToday        = openTasks.filter(t => t.due_date === today)
  const dueTomorrow     = openTasks.filter(t => t.due_date === tomorrow)
  const dueRestWeek     = openTasks.filter(t => t.due_date && t.due_date > tomorrow && t.due_date <= weekEnd)
  const overdueTasks    = openTasks.filter(t => t.due_date && t.due_date < today)
  const waitingTasks    = openTasks.filter(t => t.status === 'pending')
  const inProgressTasks = openTasks.filter(t => t.status === 'in-progress')

  const highHistory   = history.filter(h => h.priority === 'high').slice(0, 5)
  const decisionItems = history.filter(h => (h.tags ?? []).includes('decision')).slice(0, 4)

  const reviewSorted   = [...reviewPending].sort((a, b) => reviewPriorityRank(a.priority) - reviewPriorityRank(b.priority))
  const reviewCount     = reviewCountRes.count ?? reviewPending.length
  const reviewHighCount = reviewHighCountRes.count ?? reviewPending.filter(c => c.priority === 'high').length
  const notesCount      = notesCountRes.count ?? notesInbox.length
  const todayExecutionCount = new Set([...dueToday, ...scheduledToday].map(t => t.id)).size
  const plannedMinutes = scheduledToday.reduce((sum, t) => sum + (t.duration_minutes ?? 60), 0)
  const plannedHours = Math.round(plannedMinutes / 60 * 10) / 10
  const dailyFresh = latestDaily?.report_date === today

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <header className="h-12 shrink-0 border-b bg-card flex items-center px-5 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-foreground text-background">
            <Sparkles size={13} />
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground uppercase tracking-wider">홈</h1>
            <p className="text-sm text-ink-400">{fmtDay(today)} 운영 관제판</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <QuickLink href="/review" label="일감 판단" icon={<ClipboardList size={12} />} />
          <QuickLink href="/tasks" label="Tasks" icon={<ListTodo size={12} />} />
          <QuickLink href="/calendar" label="Calendar" icon={<CalendarDays size={12} />} />
        </div>
      </header>

      <main data-scrolltop className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-5 max-w-[93.75rem] mx-auto">
          {/* KPI */}
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard href="/review" label="검토 대기" value={reviewCount} detail={`높음 ${reviewHighCount}`} icon={<ClipboardList size={14} />} tone="lilac" />
            <MetricCard href="/notes" label="미처리 메모" value={notesCount} detail="포착 신호" icon={<Inbox size={14} />} tone="teal" />
            <MetricCard href={tasksQuickHref('due-today')} label="오늘 실행" value={todayExecutionCount} detail={`예정 ${scheduledToday.length} · 마감 ${dueToday.length}`} icon={<Timer size={14} />} tone="mint" />
            <MetricCard href={tasksQuickHref('overdue')} label="지연 태스크" value={overdueTasks.length} detail={`진행 ${inProgressTasks.length} · 대기 ${waitingTasks.length}`} icon={<AlertTriangle size={14} />} tone="late" />
          </section>

          {/* 1. Review Queue + Capture Inbox */}
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="검토 대기 (Review Queue)" href="/review" icon={<ClipboardList size={13} />} badge={reviewCount}>
              <div className="space-y-2">
                {reviewSorted.slice(0, 6).map(c => <ReviewRow key={c.id} candidate={c} />)}
                {reviewPending.length === 0 && <EmptyLine label="검토 대기 중인 일감이 없습니다." />}
              </div>
            </Panel>

            <Panel title="미처리 메모 (Capture Inbox)" href="/notes" icon={<Inbox size={13} />} badge={notesCount}>
              <div className="space-y-2">
                {notesInbox.slice(0, 6).map(n => <NoteRow key={n.id} note={n} />)}
                {notesInbox.length === 0 && <EmptyLine label="미처리 메모가 없습니다." />}
              </div>
            </Panel>
          </section>

          {/* 2. Today Execution */}
          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-4">
            <TodayTasksPanel
              overdueTasks={overdueTasks}
              dueToday={dueToday}
              dueTomorrow={dueTomorrow}
              dueRestWeek={dueRestWeek}
              today={today}
            />
            <Panel title="오늘의 시간" href={`/calendar?date=${today}`} icon={<Clock3 size={13} />}>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="타임블록" value={`${scheduledToday.length}`} />
                <MiniStat label="계획 시간" value={`${plannedHours}h`} />
                <MiniStat label="미배치 마감" value={`${Math.max(0, dueToday.length - scheduledToday.length)}`} />
              </div>
              <div className="mt-4 space-y-2">
                {scheduledToday.slice(0, 4).map(task => <TaskRow key={task.id} task={task} today={today} compact />)}
                {scheduledToday.length === 0 && <EmptyLine label="오늘 캘린더에 배치된 태스크가 없습니다." />}
              </div>
            </Panel>
          </section>

          {/* 3. Monitoring */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Panel title="장기 이슈" href="/slack" icon={<Radar size={13} />}>
              <div className="space-y-2">
                {openIssues.map(i => <IssueRow key={i.id} issue={i} today={today} />)}
                {openIssues.length === 0 && <EmptyLine label="열린 이슈가 없습니다." />}
              </div>
            </Panel>
            <Panel title="고객 신호" href={summaryHref({ priority: 'high' })} icon={<MessageSquare size={13} />}>
              <div className="space-y-2">
                {highHistory.map(item => <HistoryRow key={item.id} item={item} />)}
                {highHistory.length === 0 && <EmptyLine label="최근 high priority 이슈가 없습니다." />}
              </div>
            </Panel>
            <Panel title="결정 대기" href="/slack?tags=decision" icon={<Target size={13} />}>
              <div className="space-y-2">
                {decisionItems.map(item => <DecisionRow key={item.id} item={item} />)}
                {decisionItems.length === 0 && <EmptyLine label="최근 결정 태그 항목이 없습니다." />}
              </div>
            </Panel>
          </section>

          {/* 4. Pipeline Health */}
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="파이프라인 상태" href="/slack" icon={<Radar size={13} />}>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="최근 데일리" value={latestDaily ? `${fmtDay(latestDaily.report_date)}${dailyFresh ? ' ✓' : ''}` : '없음'} />
                <MiniStat label="Weekly 분석" value={latestWeekly ? fmtDay(latestWeekly.week_start) : '없음'} />
                <MiniStat label="검토 대기" value={reviewCount} />
              </div>
              {!dailyFresh && (
                <p className="mt-3 text-sm text-ink-400">오늘 데일리 리포트가 아직 생성되지 않았습니다.</p>
              )}
            </Panel>

            <Panel title="Weekly 인사이트" href="/weekly" icon={<FileText size={13} />}>
              {latestWeekly?.content ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground leading-relaxed">{plainInsightText(latestWeekly.content.headline)}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{plainInsightText(latestWeekly.content.changes)}</p>
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
          </section>

          {/* 5. Projects */}
          <ProjectsSection projects={projects} today={today} />
        </div>
      </main>
    </div>
  )
}
