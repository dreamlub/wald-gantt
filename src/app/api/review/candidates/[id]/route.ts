import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Priority } from '@/types'

interface TaskBody {
  title: string
  memo: string | null
  due_date: string | null
  priority: Priority | null
  project_ids?: string[]
}

interface PatchBody {
  status: 'created' | 'snoozed' | 'ignored'
  task?: TaskBody
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = (await req.json()) as PatchBody

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
    const now = new Date().toISOString()

    // 후보 존재·소유권·상태 확인
    const { data: candidate } = await sb
      .from('review_candidates')
      .select('id, status')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (!candidate) {
      return NextResponse.json({ error: '후보를 찾을 수 없습니다' }, { status: 404 })
    }
    if (candidate.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 후보입니다' }, { status: 409 })
    }

    if (body.status === 'created') {
      if (!body.task) {
        return NextResponse.json({ error: 'task 정보가 필요합니다' }, { status: 400 })
      }

      // 1. sort_order 계산
      const { data: existing } = await sb
        .from('gantt_tasks')
        .select('sort_order')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const sort_order = existing ? existing.sort_order + 1 : 0

      // 2. gantt_tasks insert
      const { data: task, error: taskErr } = await sb
        .from('gantt_tasks')
        .insert({
          workspace_id: workspaceId,
          sort_order,
          title: body.task.title,
          status: 'to-do',
          type: 'task',
          memo: body.task.memo,
          due_date: body.task.due_date,
          priority: body.task.priority,
          assignee: null,
          start_date: null,
        })
        .select()
        .single()

      if (taskErr || !task) {
        return NextResponse.json({ error: taskErr?.message ?? 'task 생성 실패' }, { status: 500 })
      }

      // 3. project_ids 연결
      if (body.task.project_ids && body.task.project_ids.length > 0) {
        const { error: linkErr } = await sb
          .from('gantt_task_projects')
          .insert(body.task.project_ids.map(project_id => ({ task_id: task.id, project_id })))
        if (linkErr) {
          // 연결 실패는 롤백 불가이므로 태스크를 삭제하고 에러 반환
          await sb.from('gantt_tasks').delete().eq('id', task.id)
          return NextResponse.json({ error: '프로젝트 연결 실패: ' + linkErr.message }, { status: 500 })
        }
      }

      // 4. review_candidates 상태 업데이트
      const { data: updated, error: updateErr } = await sb
        .from('review_candidates')
        .update({ status: 'created', task_id: task.id, reviewed_at: now })
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .select('id')

      if (updateErr || !updated || updated.length === 0) {
        // 상태 업데이트 실패 시 태스크 롤백
        await sb.from('gantt_task_projects').delete().eq('task_id', task.id)
        await sb.from('gantt_tasks').delete().eq('id', task.id)
        return NextResponse.json({ error: updateErr?.message ?? '후보 상태 업데이트 실패' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, task_id: task.id })
    }

    // status: snoozed | ignored
    const { data: updated, error: updateErr } = await sb
      .from('review_candidates')
      .update({ status: body.status, reviewed_at: now })
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('id')

    if (updateErr || !updated || updated.length === 0) {
      return NextResponse.json({ error: updateErr?.message ?? '업데이트 실패' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[review/candidates/[id]/patch] uncaught:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
