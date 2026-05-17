import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WeeklyReport, WeeklyReportSource } from '@/types/index'

type Sb = SupabaseClient

export type UpsertWeeklyReportInput = {
  workspace_id: string
  source: WeeklyReportSource
  team: string
  author?: string | null
  week_start: string       // 'YYYY-MM-DD'
  raw_content?: string | null
  summary?: Record<string, unknown> | null
}

// 해당 주 전체 리포트 조회 (week_start 기준)
export async function getWeeklyReports(
  weekStart: string,
  sb?: Sb,
): Promise<WeeklyReport[]> {
  const client = sb ?? createBrowserClient()
  const { data, error } = await client
    .from('weekly_reports')
    .select('*')
    .eq('week_start', weekStart)
    .order('source', { ascending: true })
    .order('team',   { ascending: true })
  if (error) throw error
  return (data ?? []) as WeeklyReport[]
}

// MCP 수집 시 INSERT/UPDATE — UNIQUE(workspace_id, source, team, author, week_start) 기준
export async function upsertWeeklyReport(
  report: UpsertWeeklyReportInput,
  sb?: Sb,
): Promise<WeeklyReport> {
  const client = sb ?? createBrowserClient()
  const { data, error } = await client
    .from('weekly_reports')
    .upsert(
      {
        workspace_id: report.workspace_id,
        source:       report.source,
        team:         report.team,
        author:       report.author ?? null,
        week_start:   report.week_start,
        raw_content:  report.raw_content ?? null,
        summary:      report.summary ?? null,
        updated_at:   new Date().toISOString(),
      },
      {
        onConflict: 'workspace_id,source,team,week_start',
        ignoreDuplicates: false,
      },
    )
    .select()
    .single()
  if (error) throw error
  return data as WeeklyReport
}
