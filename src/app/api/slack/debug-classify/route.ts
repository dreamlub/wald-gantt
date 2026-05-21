import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyMessage, matchBrand, fetchClientsForWorkspace, buildSourceRef, tsToISO, type RawJson } from '@/lib/slack-service'

export async function GET(_req: NextRequest) {
  try {
    const sb = await createClient()

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!member) return Response.json({ error: 'No workspace' }, { status: 400 })

    const workspaceId = member.workspace_id

    // ext-snowflake-etl 제외, 실제 업무 메시지 2건만 테스트
    const { data: rows, error } = await sb
      .from('slack_raw_messages')
      .select('id, channel, raw_json')
      .eq('workspace_id', workspaceId)
      .not('channel', 'ilike', '%snowflake%')
      .limit(2)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!rows?.length) return Response.json({ error: 'No raw messages found' }, { status: 404 })

    const clients = await fetchClientsForWorkspace(sb, workspaceId)
    const fallbackClientId = clients.find(c => c.name === '미분류')?.id ?? null

    const results = []
    for (const row of rows) {
      const rj = row.raw_json as RawJson
      const fullText = rj.text + ' ' + rj.replies.map(r => r.text).join(' ')
      const clientId = matchBrand(rj.channel, fullText, clients) ?? fallbackClientId
      const clientName = clients.find(c => c.id === clientId)?.name ?? '미분류'

      let classifyResult = null
      let classifyError = null
      let upsertError = null
      let upsertData = null

      try {
        classifyResult = await classifyMessage(rj, clientId, clients)
      } catch (e) {
        classifyError = e instanceof Error ? e.message : String(e)
      }

      if (classifyResult && clientId) {
        upsertData = {
          workspace_id: workspaceId,
          client_id: clientId,
          raw_message_id: row.id,
          thread_count: rj.reply_count,
          type: 'slack',
          tags: classifyResult.tags,
          channel: rj.channel,
          source_id: rj.ts,
          source_ref: buildSourceRef(rj.channel_id, rj.ts),
          title: classifyResult.title,
          body: classifyResult.body,
          priority: classifyResult.priority,
          author: classifyResult.author,
          occurred_at: tsToISO(rj.ts),
        }
        const { error: err } = await sb.from('client_history').upsert(
          upsertData,
          { onConflict: 'workspace_id,source_id' }
        )
        if (err) upsertError = err
      }

      results.push({
        id: row.id,
        channel: rj.channel,
        text: rj.text.slice(0, 100),
        matched_brand: clientName,
        client_id: clientId,
        classify_result: classifyResult,
        classify_error: classifyError,
        upsert_data: upsertData,
        upsert_error: upsertError,
      })
    }

    return Response.json({ fallback_client_id: fallbackClientId, results })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
