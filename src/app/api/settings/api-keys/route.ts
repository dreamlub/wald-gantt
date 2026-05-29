import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_KEYS = ['anthropic', 'slack_user', 'outline', 'slack_domain', 'google_client_id', 'google_client_secret', 'slack_reminder_channel'] as const
type KeyName = typeof ALLOWED_KEYS[number]

/** 화면에 마스킹 표시할 항목 */
const SECRET_KEYS = new Set<KeyName>(['anthropic', 'slack_user', 'outline', 'google_client_secret'])

const KEY_LABELS: Record<KeyName, string> = {
  anthropic:              'Anthropic API Key',
  slack_user:             'Slack User Token',
  outline:                'Outline API 토큰',
  slack_domain:           'Slack 워크스페이스 도메인',
  google_client_id:       'Google OAuth Client ID',
  google_client_secret:   'Google OAuth Client Secret',
  slack_reminder_channel: 'Slack 리마인더 채널 ID',
}

async function getWorkspaceId(sb: Awaited<ReturnType<typeof createClient>>): Promise<string> {
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

/** 키 값을 마스킹 — 끝 4자만 노출 */
function mask(value: string): string {
  if (value.length <= 4) return '••••'
  return '•'.repeat(Math.min(value.length - 4, 12)) + value.slice(-4)
}

/** GET — 저장된 키 목록 (마스킹) */
export async function GET() {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const { data, error } = await sb
      .from('workspace_api_keys')
      .select('key_name, key_value, updated_at')
      .eq('workspace_id', workspaceId)

    if (error) throw error

    const saved = Object.fromEntries((data ?? []).map(r => [r.key_name, r]))

    const result = ALLOWED_KEYS.map(name => {
      const isSecret = SECRET_KEYS.has(name)
      const raw = saved[name]?.key_value ?? null
      return {
        name,
        label: KEY_LABELS[name],
        secret: isSecret,
        set: !!saved[name],
        masked: raw ? (isSecret ? mask(raw) : raw) : null,
        updated_at: saved[name]?.updated_at ?? null,
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : (typeof e === 'object' && e !== null && 'message' in e) ? String((e as { message: unknown }).message)
      : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** PUT — 키 저장 (upsert) */
export async function PUT(req: NextRequest) {
  try {
    const { name, value } = await req.json() as { name: string; value: string }

    if (!ALLOWED_KEYS.includes(name as KeyName)) {
      return NextResponse.json({ error: '허용되지 않은 키 이름' }, { status: 400 })
    }
    if (!value?.trim()) {
      return NextResponse.json({ error: '키 값을 입력해 주세요' }, { status: 400 })
    }

    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const { error } = await sb
      .from('workspace_api_keys')
      .upsert(
        { workspace_id: workspaceId, key_name: name, key_value: value.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'workspace_id,key_name' },
      )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : (typeof e === 'object' && e !== null && 'message' in e) ? String((e as { message: unknown }).message)
      : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** DELETE — 키 삭제 */
export async function DELETE(req: NextRequest) {
  try {
    const { name } = await req.json() as { name: string }

    if (!ALLOWED_KEYS.includes(name as KeyName)) {
      return NextResponse.json({ error: '허용되지 않은 키 이름' }, { status: 400 })
    }

    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const { error } = await sb
      .from('workspace_api_keys')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('key_name', name)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : (typeof e === 'object' && e !== null && 'message' in e) ? String((e as { message: unknown }).message)
      : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
