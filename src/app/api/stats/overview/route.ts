import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { OverviewStatsResponse } from '@/app/(app)/stats/_lib/stats-types'
import { EMPTY_OVERVIEW_STATS } from '@/app/(app)/stats/_lib/stats-types'

const SOURCE_LABEL: Record<string, string> = {
  daily_report: 'Daily', weekly: 'Weekly', note: 'Note', history: 'History',
}

// GET /api/stats/overview — Signal → Review → Task → Done 퍼널 (워크스페이스 스코프)
export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle()
  if (!member) return NextResponse.json(EMPTY_OVERVIEW_STATS)
  const wsId = member.workspace_id

  const [signalsRes, completionsRes, candidatesRes] = await Promise.all([
    sb.from('client_history').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId).is('deleted_at', null),
    sb.from('task_completions').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId),
    sb.from('review_candidates').select('source, status')
      .eq('workspace_id', wsId).limit(5000),
  ])

  const signals = signalsRes.count ?? 0
  const done = completionsRes.count ?? 0
  const candidates = (candidatesRes.data ?? []) as { source: string; status: string }[]

  const candidateTotal = candidates.length
  const createdTotal = candidates.filter(c => c.status === 'created').length
  const pendingTotal = candidates.filter(c => c.status === 'pending').length

  const sourceMap = new Map<string, number>()
  for (const c of candidates) sourceMap.set(c.source, (sourceMap.get(c.source) ?? 0) + 1)

  const payload: OverviewStatsResponse = {
    funnel: [
      { key: 'signal', label: '신호 (Slack/Weekly/Notes)', value: signals },
      { key: 'review', label: '검토 후보', value: candidateTotal },
      { key: 'task', label: 'Task 전환', value: createdTotal },
      { key: 'done', label: '완료', value: done },
    ],
    reviewBySource: ['daily_report', 'weekly', 'note', 'history']
      .filter(s => sourceMap.has(s))
      .map(s => ({ source: s, label: SOURCE_LABEL[s] ?? s, count: sourceMap.get(s)! })),
    conversion: {
      candidateToTask: candidateTotal > 0 ? Math.round(createdTotal / candidateTotal * 100) : 0,
      reviewedRatio: candidateTotal > 0 ? Math.round((candidateTotal - pendingTotal) / candidateTotal * 100) : 0,
    },
  }
  return NextResponse.json(payload)
}
