import { NextRequest } from 'next/server'
import { WebClient } from '@slack/web-api'
import { createClient } from '@/lib/supabase/server'
import { getApiKey } from '@/lib/workspace-api-keys'
import { fetchUserDirectory } from '@/lib/slack-service'

interface MappingInput {
  channel_id: string
  channel_name: string
  is_dm: boolean
  dm_user_id: string | null
  dm_user_name: string | null
  brand_name: string | null
  excluded: boolean
}

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

const USER_ID_RE = /^U[A-Z0-9]{8,}$/

export async function GET() {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const { data, error } = await sb
      .from('slack_channel_mappings')
      .select('channel_id, channel_name, is_dm, dm_user_id, dm_user_name, brand_name, excluded')
      .eq('workspace_id', workspaceId)
      .order('channel_name')

    if (error) throw error
    const channels = data ?? []

    const unresolved = channels.filter(ch => USER_ID_RE.test(ch.channel_name))
    if (unresolved.length > 0) {
      const token = await getApiKey(sb, workspaceId, 'slack_user', process.env.SLACK_USER_TOKEN)
      if (token) {
        const userDir = await fetchUserDirectory(new WebClient(token))
        for (const ch of unresolved) {
          const name = userDir.get(ch.channel_name)
          if (name) ch.channel_name = `${name} (DM)`
        }
      }
    }

    return Response.json({ channels })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { mappings } = await req.json() as { mappings: MappingInput[] }
    if (!Array.isArray(mappings)) {
      return Response.json({ error: 'mappings 배열 필요' }, { status: 400 })
    }

    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const rows = mappings.map(m => ({
      workspace_id: workspaceId,
      channel_id: m.channel_id,
      channel_name: m.channel_name,
      is_dm: m.is_dm,
      dm_user_id: m.dm_user_id,
      dm_user_name: m.dm_user_name,
      brand_name: m.brand_name,
      excluded: m.excluded ?? false,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await sb
      .from('slack_channel_mappings')
      .upsert(rows, { onConflict: 'workspace_id,channel_id' })

    if (error) throw error

    return Response.json({ saved: rows.length })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
