import { WebClient } from '@slack/web-api'
import { createClient } from '@/lib/supabase/server'
import { getApiKey } from '@/lib/workspace-api-keys'
import { fetchUserDirectory } from '@/lib/slack-service'

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

export interface SlackChannelItem {
  channel_id: string
  channel_name: string
  is_dm: boolean
  dm_user_id: string | null
  dm_user_name: string | null
  brand_name: string | null
  excluded: boolean
}

// 타입별로 개별 시도 — missing_scope인 타입은 경고만 남기고 스킵
async function fetchChannelsByType(
  slack: WebClient,
  type: string,
): Promise<{ id?: string; name?: string; is_im?: boolean; user?: string }[]> {
  const results: { id?: string; name?: string; is_im?: boolean; user?: string }[] = []
  let cursor: string | undefined
  try {
    do {
      const res = await slack.conversations.list({
        types: type,
        limit: 200,
        cursor,
        exclude_archived: true,
      })
      if (!res.ok || !res.channels) break
      results.push(...(res.channels as typeof results))
      cursor = (res.response_metadata?.next_cursor as string | undefined) || undefined
    } while (cursor)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('missing_scope')) {
      console.warn(`[slack/channels] ${type} 스킵 — 스코프 부족: ${msg}`)
    } else {
      throw e
    }
  }
  return results
}

export async function GET() {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)
    const token = await getApiKey(sb, workspaceId, 'slack_user', process.env.SLACK_USER_TOKEN)
    if (!token) return Response.json({ error: 'Slack User Token 미설정. 설정 > API 키에서 등록해 주세요.' }, { status: 500 })
    const slack = new WebClient(token)

    // 기존 매핑 조회
    const { data: mappingRows } = await sb
      .from('slack_channel_mappings')
      .select('channel_id, brand_name, excluded')
      .eq('workspace_id', workspaceId)

    const mappingMap = new Map<string, { brand_name: string | null; excluded: boolean }>(
      (mappingRows ?? []).map(r => [r.channel_id, { brand_name: r.brand_name, excluded: r.excluded ?? false }])
    )

    // 타입별 개별 조회 (스코프 없는 타입은 스킵)
    const [publicChs, privateChs, dmChs] = await Promise.all([
      fetchChannelsByType(slack, 'public_channel'),
      fetchChannelsByType(slack, 'private_channel'),
      fetchChannelsByType(slack, 'im'),
    ])

    const allRaw = [...publicChs, ...privateChs, ...dmChs]
    const missingScopes: string[] = []

    // 어떤 타입도 못 가져온 경우 힌트 제공
    if (publicChs.length === 0 && privateChs.length === 0 && dmChs.length === 0) {
      missingScopes.push('channels:read (공개 채널)', 'groups:read (비공개 채널)', 'im:read (DM)')
    } else {
      if (publicChs.length === 0)  missingScopes.push('channels:read (공개 채널)')
      if (privateChs.length === 0) missingScopes.push('groups:read (비공개 채널)')
      if (dmChs.length === 0)      missingScopes.push('im:read (DM)')
    }

    const channels: SlackChannelItem[] = allRaw
      .filter(c => c.id)
      .map(c => {
        const mapping = mappingMap.get(c.id!)
        return c.is_im
          ? {
              channel_id: c.id!,
              channel_name: '',
              is_dm: true,
              dm_user_id: c.user ?? null,
              dm_user_name: null,
              brand_name: mapping?.brand_name ?? null,
              excluded: mapping?.excluded ?? false,
            }
          : {
              channel_id: c.id!,
              channel_name: c.name ?? c.id!,
              is_dm: false,
              dm_user_id: null,
              dm_user_name: null,
              brand_name: mapping?.brand_name ?? null,
              excluded: mapping?.excluded ?? false,
            }
      })

    // DM 채널 사용자 이름 해석
    const dmChannels = channels.filter(c => c.is_dm && c.dm_user_id)
    if (dmChannels.length > 0) {
      const userDir = await fetchUserDirectory(slack)
      for (const ch of dmChannels) {
        if (ch.dm_user_id) {
          ch.dm_user_name = userDir.get(ch.dm_user_id) ?? ch.dm_user_id
          ch.channel_name = `${ch.dm_user_name} (DM)`
        }
      }
    }

    // 이름순 정렬 (DM 뒤로)
    channels.sort((a, b) => {
      if (a.is_dm !== b.is_dm) return a.is_dm ? 1 : -1
      return a.channel_name.localeCompare(b.channel_name, 'ko')
    })

    return Response.json({ channels, missing_scopes: missingScopes })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
