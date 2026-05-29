import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WeeklyReport, WeeklyReportSource, WeeklyInsight } from '@/types/index'

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

// 팀의 수집된 주차 목록 (week_start 내림차순)
export async function getWeeklyWeeks(
  team: string,
  sb?: Sb,
): Promise<string[]> {
  const client = sb ?? createBrowserClient()
  const { data, error } = await client
    .from('weekly_reports')
    .select('week_start')
    .eq('team', team)
    .order('week_start', { ascending: false })
  if (error) throw error
  return [...new Set((data ?? []).map(r => r.week_start as string))]
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

export async function getWeeklyInsight(
  weekStart: string,
  sb?: Sb,
): Promise<WeeklyInsight | null> {
  const client = sb ?? createBrowserClient()
  const { data } = await client
    .from('weekly_insights')
    .select('*')
    .eq('week_start', weekStart)
    .maybeSingle()
  return (data as WeeklyInsight | null) ?? null
}

export async function analyzeWeekly(
  weekStart: string,
  onStatus?: (message: string) => void,
): Promise<WeeklyInsight> {
  const res = await fetch('/api/weekly/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ week_start: weekStart }),
  })

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.split('\n')
      let eventType = 'message'
      let eventData = ''

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim()
        else if (line.startsWith('data: ')) eventData = line.slice(6)
      }

      if (!eventData) continue

      const data = JSON.parse(eventData) as Record<string, unknown>
      if (eventType === 'status' || eventType === 'warning') {
        onStatus?.(data.message as string)
      } else if (eventType === 'result') {
        return data as unknown as WeeklyInsight
      } else if (eventType === 'error') {
        throw new Error(data.message as string)
      }
    }
  }

  throw new Error('분석 스트림이 결과 없이 종료되었습니다')
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
