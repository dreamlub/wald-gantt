import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { WeeklyReportItem, WeeklyReportSummary } from '@/types'
import type { ReviewPriority, ReviewSource } from '@/types'

// daily_reports.content.action_items 구조
type ActionItem = {
  id: string
  title: string
  brand: string
  summary: string
  action: string
  severity: string
  related_count?: number
  // 분석 프롬프트가 생성하는 태스크 후보 필드
  task_title?: string | null
  task_memo?: string | null
  due_date?: string | null
  estimated_minutes?: number | null
}

// status를 제외한 upsert 행 — 신규는 DB 기본값 'pending', 기존 pending은 내용만 갱신
interface CandidateRow {
  workspace_id: string
  source: ReviewSource
  source_id: string
  source_date: string
  title: string
  memo: string | null
  brand: string | null
  priority: ReviewPriority | null
  due_date: string | null
  estimated_minutes: number | null
  evidence_count: number
}

function severityToPriority(severity: string): ReviewPriority {
  if (severity === 'urgent') return 'high'
  if (severity === 'watch') return 'medium'
  return 'low'
}

function weeklyPriority(item: WeeklyReportItem): ReviewPriority {
  if (item.status === 'blocked' || item.type === 'issue') return 'high'
  if (item.type === 'plan') return 'medium'
  return 'low'
}

function stableWeeklyItemKey(item: WeeklyReportItem): string {
  return `${item.type}:${item.title}:${item.brand ?? ''}`
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣:]/g, '')
    .slice(0, 120)
}

export async function POST() {
  try {
    const sb = await createClient()
    const { data: { user }, error: authErr } = await sb.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
    }

    const { data: member, error: memberErr } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (memberErr || !member) {
      return NextResponse.json({ error: '워크스페이스를 찾을 수 없습니다' }, { status: 403 })
    }

    const workspaceId = member.workspace_id
    const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    // ── 1. daily_report 후보 ───────────────────────────────────────────
    const { data: reports } = await sb
      .from('daily_reports')
      .select('report_date, content')
      .eq('workspace_id', workspaceId)
      .gte('report_date', since60.slice(0, 10))
      .limit(200) // 60일 × 팀별 1건. 팀 최대 3 × 60일 = 180건 상한

    const reportRows: CandidateRow[] = []
    for (const report of reports ?? []) {
      const content = report.content as Record<string, unknown>
      const actionItems = (content?.action_items ?? []) as ActionItem[]
      for (const item of actionItems) {
        if (item.severity !== 'urgent' && item.severity !== 'watch') continue

        // task_title/task_memo가 있으면 우선 사용 (분석 프롬프트 확장 필드)
        const title = item.task_title ?? item.title
        const memo  = item.task_memo
          ?? (item.summary ? `${item.summary}\n액션: ${item.action}` : item.action)

        reportRows.push({
          workspace_id: workspaceId,
          source: 'daily_report' as ReviewSource,
          source_id: `${report.report_date}|${item.id}`,
          source_date: report.report_date,
          title,
          memo,
          brand: item.brand ?? null,
          priority: severityToPriority(item.severity),
          due_date: item.due_date ?? null,
          estimated_minutes: item.estimated_minutes ?? null,
          evidence_count: item.related_count ?? 1,
        })
      }
    }

    // ── 2. weekly_report 후보 ──────────────────────────────────────────
    const { data: weeklyReports } = await sb
      .from('weekly_reports')
      .select('id, week_start, team, summary')
      .eq('workspace_id', workspaceId)
      .gte('week_start', since60.slice(0, 10))
      .limit(100) // 60일 ÷ 7 × 팀 수. 팀 10 × 9주 = 90건 상한

    const weeklyRows: CandidateRow[] = []
    for (const report of weeklyReports ?? []) {
      const summary = report.summary as WeeklyReportSummary | null
      const items = summary?.items ?? []
      items.forEach((item) => {
        if (!item.action_required) return

        weeklyRows.push({
          workspace_id: workspaceId,
          source: 'weekly' as ReviewSource,
          source_id: `${report.id}|${stableWeeklyItemKey(item)}`,
          source_date: report.week_start,
          title: item.task_title ?? item.title,
          memo: item.task_memo ?? item.detail ?? null,
          brand: item.brand ?? report.team ?? null,
          priority: weeklyPriority(item),
          due_date: item.due_date ?? null,
          estimated_minutes: item.estimated_minutes ?? null,
          evidence_count: 1,
        })
      })
    }

    const rows = [...reportRows, ...weeklyRows]
    if (rows.length === 0) {
      return NextResponse.json({ inserted: 0 })
    }

    // ignoreDuplicates: false — 기존 행도 title/memo/due_date 등 갱신
    // status는 upsert 행에 포함하지 않아 기존 created/snoozed/ignored는 보존됨
    const { error: upsertErr } = await sb
      .from('review_candidates')
      .upsert(rows, {
        onConflict: 'workspace_id,source,source_id',
        ignoreDuplicates: false,
      })

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({ inserted: rows.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[review/populate] uncaught:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
