import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getWorkspaceId(sb: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!member) throw new Error('No workspace found')
  return member.workspace_id
}

// GET: 별칭 목록 조회
export async function GET() {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const { data, error } = await sb
      .from('brand_aliases')
      .select('id, alias_name, canonical_name, created_at')
      .eq('workspace_id', workspaceId)
      .order('canonical_name')

    if (error) throw error
    return Response.json({ aliases: data ?? [] })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST: 별칭 추가/갱신 + 기존 히스토리 일괄 반영
export async function POST(req: NextRequest) {
  try {
    const { aliases } = await req.json() as {
      aliases: { alias_name: string; canonical_name: string }[]
    }
    if (!Array.isArray(aliases) || aliases.length === 0) {
      return Response.json({ error: 'aliases 배열 필요' }, { status: 400 })
    }

    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const rows = aliases.map(a => ({
      workspace_id: workspaceId,
      alias_name: a.alias_name.trim(),
      canonical_name: a.canonical_name.trim(),
    }))

    const { error } = await sb
      .from('brand_aliases')
      .upsert(rows, { onConflict: 'workspace_id,alias_name' })

    if (error) throw error

    // 기존 client_history에 별칭 적용
    let updated = 0
    for (const a of rows) {
      const { data } = await sb
        .from('client_history')
        .update({ brand_name: a.canonical_name })
        .eq('workspace_id', workspaceId)
        .eq('brand_name', a.alias_name)
        .is('deleted_at', null)
        .select('id')
      updated += data?.length ?? 0
    }

    return Response.json({ saved: rows.length, historyUpdated: updated })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// DELETE: 별칭 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json() as { id: string }
    if (!id) return Response.json({ error: 'id 필요' }, { status: 400 })

    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const { error } = await sb
      .from('brand_aliases')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)

    if (error) throw error
    return Response.json({ deleted: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
