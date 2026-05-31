import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WeeklyReport, WeeklyReportSource, WeeklyInsight } from '@/types/index'

type Sb = SupabaseClient

// 현재 사용자의 workspace_id 조회 — 쿼리에 명시 필터를 걸어 RLS에만 의존하지 않도록
async function getWorkspaceId(client: Sb): Promise<string> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { data: member } = await client
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!member) throw new Error('no workspace')
  return member.workspace_id
}

export type UpsertWeeklyReportInput = {
  workspace_id: string
  source: WeeklyReportSource
  team: string
  author?: string | null
  week_start: string       // 'YYYY-MM-DD'
  raw_content?: string | null
  summary?: Record<string, unknown> | null
}

// 해당 주 전체 리포트 조회
// weekStart는 월요일 기준이지만 DB의 week_start는 Outline 원문 날짜(비-월요일 가능)이므로
// Mon~Sun 범위로 조회한다
export async function getWeeklyReports(
  weekStart: string,
  sb?: Sb,
): Promise<WeeklyReport[]> {
  const client = sb ?? createBrowserClient()
  const workspaceId = await getWorkspaceId(client)
  const d = new Date(weekStart + 'T00:00:00')
  d.setDate(d.getDate() + 6)
  const weekEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const { data, error } = await client
    .from('weekly_reports')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('week_start', weekStart)
    .lte('week_start', weekEnd)
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
  const workspaceId = await getWorkspaceId(client)
  const { data } = await client
    .from('weekly_insights')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('week_start', weekStart)
    .maybeSingle()
  return (data as WeeklyInsight | null) ?? null
}

/**
 * 전체 팀의 모든 주차 리포트를 한 번에 조회해 주차×팀 매트릭스로 구성.
 * 사이드바의 "수집 현황"(주차별 팀 제출 상태)에 사용.
 * 반환: 주차 목록(내림차순) + week→team(label)→report 맵.
 */
export async function getWeeklyMatrix(
  sb?: Sb,
): Promise<{ weeks: string[]; byWeek: Map<string, Map<string, WeeklyReport>> }> {
  const client = sb ?? createBrowserClient()
  const workspaceId = await getWorkspaceId(client)
  const { data, error } = await client
    .from('weekly_reports')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('week_start', { ascending: false })
    .order('team', { ascending: true })
  if (error) throw error

  const reports = (data ?? []) as WeeklyReport[]
  const byWeek = new Map<string, Map<string, WeeklyReport>>()
  for (const r of reports) {
    let teamMap = byWeek.get(r.week_start)
    if (!teamMap) { teamMap = new Map(); byWeek.set(r.week_start, teamMap) }
    // 같은 팀·주차에 source가 여러 개면 먼저 온 것(정렬상 안정) 유지
    if (!teamMap.has(r.team)) teamMap.set(r.team, r)
  }
  const weeks = [...byWeek.keys()].sort((a, b) => (a < b ? 1 : -1))
  return { weeks, byWeek }
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
