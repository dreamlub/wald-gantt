import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ISSUE_COLUMNS =
  'id, brand_name, title, type, priority, status, body, action, first_seen, last_seen, parent_issue_id, created_at'

// PATCH /api/issues/[id]
// body: { status: 'open' | 'closed', includeChildren?: boolean }
// 응답: { updated: IssueRow[] } — 변경된 이슈(부모 + 자식 포함)
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await req.json()
    const { status, includeChildren } = body as {
      status: 'open' | 'closed'
      includeChildren?: boolean
    }

    if (status !== 'open' && status !== 'closed') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const sb = await createClient()
    const { data: { user }, error: authErr } = await sb.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: member, error: memberErr } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (memberErr || !member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: updated, error } = await sb
      .from('issues')
      .update({ status })
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .select(ISSUE_COLUMNS)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let childrenUpdated: typeof updated = []
    if (includeChildren) {
      const { data: children } = await sb
        .from('issues')
        .update({ status })
        .eq('parent_issue_id', id)
        .eq('workspace_id', member.workspace_id)
        .select(ISSUE_COLUMNS)
      childrenUpdated = children ?? []
    }

    return NextResponse.json({ updated: [...updated, ...childrenUpdated] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
