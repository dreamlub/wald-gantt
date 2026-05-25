import { createClient } from '@/lib/supabase/server'
import { WebClient } from '@slack/web-api'
import { classifyMessage, matchBrand, fetchBrandMappings, buildSourceRef, tsToISO, getSlackIdentity, type RawJson } from '@/lib/slack-service'

export async function GET() {
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

    const token = process.env.SLACK_USER_TOKEN
    if (!token) return Response.json({ error: 'SLACK_USER_TOKEN 환경변수 미설정' }, { status: 500 })
    const slack = new WebClient(token)
    const [brandMappings, identity] = await Promise.all([
      fetchBrandMappings(sb, workspaceId),
      getSlackIdentity(slack),
    ])
    const FALLBACK_BRAND = '미분류'

    const results = []
    for (const row of rows) {
      const rj = row.raw_json as RawJson
      const brandName = matchBrand(rj.channel_id, brandMappings) ?? FALLBACK_BRAND

      let classifyResult = null
      let classifyError = null
      let upsertError = null
      let upsertData = null

      try {
        classifyResult = await classifyMessage(rj, brandName, identity.userId)
      } catch (e) {
        classifyError = e instanceof Error ? e.message : String(e)
      }

      if (classifyResult) {
        upsertData = {
          workspace_id: workspaceId,
          brand_name: brandName,
          raw_message_id: row.id,
          thread_count: rj.reply_count,
          type: 'slack',
          tags: classifyResult.tags,
          channel: rj.channel,
          source_id: rj.ts,
          source_ref: buildSourceRef(identity.domain, rj.channel_id, rj.ts),
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
        brand_name: brandName,
        classify_result: classifyResult,
        classify_error: classifyError,
        upsert_data: upsertData,
        upsert_error: upsertError,
      })
    }

    return Response.json({ results })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
