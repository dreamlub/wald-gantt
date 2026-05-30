import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ReviewCandidate, ReviewPriority } from '@/types'

const PRIORITY_ORDER: Record<ReviewPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function priorityRank(p: ReviewPriority | null): number {
  if (p == null) return 3
  return PRIORITY_ORDER[p] ?? 3
}

export async function GET(req: NextRequest) {
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

    const sp       = req.nextUrl.searchParams
    const status   = sp.get('status') ?? 'pending'
    const source   = sp.get('source')
    const brand    = sp.get('brand')
    const priority = sp.get('priority')

    let q = sb
      .from('review_candidates')
      .select('*')
      .eq('workspace_id', member.workspace_id)
      .eq('status', status)
      .order('source_date', { ascending: false })
      .limit(500) // status 탭별 최대 500건

    if (source)   q = q.eq('source', source)
    if (brand)    q = q.eq('brand', brand)
    if (priority) q = q.eq('priority', priority)

    const { data, error } = await q
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const candidates = (data ?? []) as ReviewCandidate[]

    // priority는 'high'/'medium'/'low' 문자열이라 알파벳순 DB 정렬 불가 → JS에서 처리
    candidates.sort((a, b) => {
      const pd = priorityRank(a.priority) - priorityRank(b.priority)
      if (pd !== 0) return pd
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return b.source_date.localeCompare(a.source_date)
    })

    return NextResponse.json(candidates)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[review/candidates] uncaught:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
