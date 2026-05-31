import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST /api/notes/[id]/to-review
 *  노트를 Review 후보로 등록하고 노트 status를 'reviewed'로 변경.
 *  review_candidates: source='note', source_id=note.id로 upsert.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const sb = await createClient()

    // 인증
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // workspace_id 해석 (review_candidates는 workspace 스코프)
    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'No workspace found' }, { status: 403 })

    // 본인 노트 조회 (user 스코프 확인)
    const { data: note, error: noteErr } = await sb
      .from('notes')
      .select('id, title, content')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()
    if (noteErr || !note) return NextResponse.json({ error: '노트를 찾을 수 없습니다.' }, { status: 404 })

    const today = new Date().toISOString().slice(0, 10)
    const title = (note.title as string).trim() || (note.content as string).slice(0, 60).trim() || '(제목 없음)'

    // review_candidates upsert — 이미 등록된 경우 덮어쓰지 않음 (status 보존)
    const { error: rcErr } = await sb.from('review_candidates').upsert(
      {
        workspace_id:  member.workspace_id,
        source:        'note',
        source_id:     note.id,
        source_date:   today,
        title,
        memo:          (note.content as string) || null,
        status:        'pending',
      },
      { onConflict: 'workspace_id,source,source_id', ignoreDuplicates: true },
    )
    if (rcErr) throw rcErr

    // 노트 status → 'reviewed'
    const { error: updateErr } = await sb
      .from('notes')
      .update({ status: 'reviewed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
    if (updateErr) throw updateErr

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
