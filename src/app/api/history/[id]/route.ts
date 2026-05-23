import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = await req.json()

    const sb = await createClient()
    const { data: { user }, error: authErr } = await sb.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: '인증이 필요합니다' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: member, error: memberErr } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (memberErr || !member) {
      return new Response(JSON.stringify({ error: '워크스페이스를 찾을 수 없습니다' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }

    const allowed = ['brand_name', 'author', 'priority', 'tags'] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { error } = await sb
      .from('client_history')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[history/patch] uncaught:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
