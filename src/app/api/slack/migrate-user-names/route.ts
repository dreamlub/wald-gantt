import { WebClient } from '@slack/web-api'
import { createClient } from '@/lib/supabase/server'
import {
  fetchUserDirectory, resolveUserName,
  type RawJson, type RawReply,
} from '@/lib/slack-service'

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

/**
 * 기존 slack_raw_messages.raw_json 및 client_history.author 를
 * 현재 Slack 워크스페이스 사용자 디렉토리 기준으로 일괄 갱신.
 *
 * 호출: 브라우저 DevTools Console (로그인 세션 사용)에서
 *   fetch('/api/slack/migrate-user-names', { method: 'POST' })
 *     .then(r => r.json()).then(console.log)
 */
export async function POST() {
  const token = process.env.SLACK_USER_TOKEN
  if (!token) {
    return Response.json({ error: 'SLACK_USER_TOKEN 미설정' }, { status: 500 })
  }

  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)
    const slack = new WebClient(token)

    // 1. Slack users 디렉토리
    const userDir = await fetchUserDirectory(slack)
    if (userDir.size === 0) {
      return Response.json({
        error: 'Slack 사용자 디렉토리를 가져올 수 없습니다. SLACK_USER_TOKEN에 users:read scope이 누락되었습니다. Slack 앱 설정에서 User Token Scopes에 users:read 추가 후 재설치(토큰 재발급) 필요.',
        directory_size: 0,
      }, { status: 400 })
    }

    // 2. slack_raw_messages 전체 조회
    const { data: rawRows, error: rawErr } = await sb
      .from('slack_raw_messages')
      .select('id, raw_json')
      .eq('workspace_id', workspaceId)
      .limit(10000)
    if (rawErr) throw rawErr

    let rawScanned = 0
    let rawUpdated = 0
    const rawById = new Map<string, RawJson>()

    // raw_json 변환은 메모리에서 + 변경 감지 후만 UPDATE
    const BATCH = 5
    for (let i = 0; i < (rawRows ?? []).length; i += BATCH) {
      const batch = (rawRows ?? []).slice(i, i + BATCH)
      await Promise.all(batch.map(async row => {
        rawScanned++
        const rj = row.raw_json as RawJson
        const newUserName = resolveUserName(userDir, rj.user, rj.user_name)
        const newReplies: RawReply[] = rj.replies.map(r => ({
          ...r,
          user_name: resolveUserName(userDir, r.user, r.user_name),
        }))

        const replyChanged = newReplies.some(
          (r, idx) => r.user_name !== rj.replies[idx]?.user_name
        )
        const changed = newUserName !== rj.user_name || replyChanged

        const newRj: RawJson = { ...rj, user_name: newUserName, replies: newReplies }
        rawById.set(row.id, newRj) // history 처리용 매핑

        if (!changed) return

        const { error } = await sb
          .from('slack_raw_messages')
          .update({ raw_json: newRj })
          .eq('id', row.id)
        if (!error) rawUpdated++
      }))
    }

    // 3. client_history 전체 조회
    const { data: historyRows, error: histErr } = await sb
      .from('client_history')
      .select('id, author, body, raw_message_id')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .limit(20000)
    if (histErr) throw histErr

    // user ID → name 역방향 맵 (body 텍스트 치환용)
    const userIdToName = new Map<string, string>()
    for (const [userId, name] of userDir.entries()) {
      userIdToName.set(userId, name)
    }

    // body 텍스트에서 <@USERID> 또는 단독 USERID 패턴을 이름으로 치환
    function replaceUserIds(text: string | null): string | null {
      if (!text) return text
      return text.replace(/<@([A-Z0-9]+)>|(?<!\w)([UW][A-Z0-9]{8,})(?!\w)/g, (match, id1, id2) => {
        const id = id1 ?? id2
        return userIdToName.get(id) ?? match
      })
    }

    let histScanned = 0
    let histUpdated = 0
    for (let i = 0; i < (historyRows ?? []).length; i += BATCH) {
      const batch = (historyRows ?? []).slice(i, i + BATCH)
      await Promise.all(batch.map(async h => {
        histScanned++
        const rj = h.raw_message_id ? rawById.get(h.raw_message_id) : null
        const newAuthor = rj ? resolveUserName(userDir, rj.user, h.author) : h.author
        const newBody = replaceUserIds(h.body)

        const changed = newAuthor !== h.author || newBody !== h.body
        if (!changed) return

        const update: Record<string, unknown> = {}
        if (newAuthor !== h.author) update.author = newAuthor
        if (newBody !== h.body) update.body = newBody

        const { error } = await sb
          .from('client_history')
          .update(update)
          .eq('id', h.id)
        if (!error) histUpdated++
      }))
    }

    return Response.json({
      directory_size: userDir.size,
      raw_scanned: rawScanned,
      raw_updated: rawUpdated,
      history_scanned: histScanned,
      history_updated: histUpdated,
    })
  } catch (err) {
    console.error('[slack/migrate-user-names]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
