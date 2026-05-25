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

// 채널 매핑 기준으로 client_history.brand_name을 재매핑 (AI 재분류 없이 즉시 처리)
export async function POST() {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const { data: mappings, error: mapErr } = await sb
      .from('slack_channel_mappings')
      .select('channel_id, brand_name')
      .eq('workspace_id', workspaceId)
      .not('brand_name', 'is', null)

    if (mapErr) throw mapErr
    if (!mappings || mappings.length === 0) {
      return Response.json({ updated: 0, message: '매핑 없음' })
    }

    let totalUpdated = 0

    for (const mapping of mappings) {
      const { data: rawRows } = await sb
        .from('slack_raw_messages')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('channel_id', mapping.channel_id)

      if (!rawRows || rawRows.length === 0) continue

      const rawIds = rawRows.map(r => r.id)

      const { data: updated, error: updErr } = await sb
        .from('client_history')
        .update({ brand_name: mapping.brand_name })
        .eq('workspace_id', workspaceId)
        .in('raw_message_id', rawIds)
        .is('deleted_at', null)
        .select('id')

      if (updErr) {
        console.error(`[remap-history] channel_id=${mapping.channel_id} update error:`, updErr)
        continue
      }

      totalUpdated += updated?.length ?? 0
    }

    return Response.json({ updated: totalUpdated, mappings_applied: mappings.length })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
