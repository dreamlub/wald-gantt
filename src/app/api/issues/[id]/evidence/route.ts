import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const EVIDENCE_COLUMNS =
  'id, occurred_at, brand_name, author, title, body, tags, priority, thread_count'

// GET /api/issues/[id]/evidence
// 선택된 이슈에 연결된 client_history 원문 타임라인 (좌측 evidence 패널용)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ evidence: [] })

  const { data: evidence } = await sb
    .from('client_history')
    .select(EVIDENCE_COLUMNS)
    .eq('workspace_id', member.workspace_id)
    .eq('issue_id', id)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: true })
    .limit(200)

  return NextResponse.json({ evidence: evidence ?? [] })
}
