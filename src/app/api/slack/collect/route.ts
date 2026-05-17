import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SLACK_API = 'https://slack.com/api'

async function slackFetch(endpoint: string, params: Record<string, string>) {
  const token = process.env.SLACK_USER_TOKEN
  if (!token) throw new Error('SLACK_USER_TOKEN이 설정되지 않았습니다')
  const url = new URL(`${SLACK_API}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack error: ${data.error}`)
  return data
}

export async function POST() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 400 })

    const wsId = member.workspace_id

    const { data: clients, error: cErr } = await sb
      .from('clients')
      .select('id, keywords')
      .eq('workspace_id', wsId)
      .order('sort_order')
    if (cErr) throw cErr
    if (!clients?.length) return NextResponse.json({ inserted: 0 })

    // 마지막 수집 시점 기준 (없으면 30일 전)
    const { data: latest } = await sb
      .from('client_history')
      .select('occurred_at')
      .eq('workspace_id', wsId)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .single()

    const sinceDate = latest
      ? new Date(latest.occurred_at)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    sinceDate.setDate(sinceDate.getDate() - 2) // 2일 버퍼 (중복은 dedup으로 처리)
    const sinceStr = sinceDate.toISOString().split('T')[0]

    // 기존 (client_id, source_id) 조합 — 중복 방지
    const { data: existing } = await sb
      .from('client_history')
      .select('source_id, client_id')
      .eq('workspace_id', wsId)
      .not('source_id', 'is', null)

    const existingSet = new Set(
      (existing ?? []).map(e => `${e.client_id}:${e.source_id}`)
    )

    // 유저명 캐시
    const userCache = new Map<string, string>()
    async function getAuthor(userId: string): Promise<string> {
      if (!userId) return ''
      if (userCache.has(userId)) return userCache.get(userId)!
      try {
        const d = await slackFetch('users.info', { user: userId })
        const name = d.user?.profile?.display_name_normalized || d.user?.real_name || userId
        userCache.set(userId, name)
        return name
      } catch {
        userCache.set(userId, userId)
        return userId
      }
    }

    const debugLog: string[] = [`since=${sinceStr}`, `clients=${clients.length}`, `existing=${existingSet.size}`]

    const rows: object[] = []

    for (const client of clients) {
      if (!client.keywords?.length) { debugLog.push(`skip:${client.id}(no keywords)`); continue }
      const query = client.keywords.map((k: string) => `"${k}"`).join(' OR ')
      debugLog.push(`query: ${query} after:${sinceStr}`)
      try {
        // 날짜 필터 없이 먼저 테스트
        const dataNoDate = await slackFetch('search.messages', {
          query,
          count: '3',
          sort: 'timestamp',
          sort_dir: 'desc',
        })
        const totalNoDate = dataNoDate.messages?.total ?? '?'
        debugLog.push(`(날짜없이) client:${client.id} → total:${totalNoDate}`)

        const data = await slackFetch('search.messages', {
          query: `${query} after:${sinceStr}`,
          count: '100',
          sort: 'timestamp',
          sort_dir: 'desc',
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages: any[] = data.messages?.matches ?? []
        const total = data.messages?.total ?? data.messages?.pagination?.total_count ?? '?'
        debugLog.push(`(날짜있이) client:${client.id} → matches:${messages.length} total:${total}`)
        for (const msg of messages) {
          const sourceId = `${msg.channel?.id}_${msg.ts}`
          const dedupKey = `${client.id}:${sourceId}`
          if (existingSet.has(dedupKey)) continue
          existingSet.add(dedupKey)

          const text: string = msg.text ?? ''
          const lines = text.split('\n').filter(Boolean)
          const title = (lines[0] ?? text).slice(0, 300)
          const body = lines.slice(1).join('\n').trim() || null
          const author = await getAuthor(msg.user ?? '')
          const occurredAt = new Date(parseFloat(msg.ts) * 1000).toISOString()

          rows.push({
            workspace_id: wsId,
            client_id: client.id,
            type: 'slack',
            tags: [],
            channel: msg.channel?.name ?? msg.channel?.id ?? '',
            source_id: sourceId,
            source_ref: msg.permalink ?? null,
            title,
            body,
            occurred_at: occurredAt,
            priority: null,
            author,
          })
        }
      } catch (e) {
        console.error(`[slack/collect] client ${client.id}:`, e)
      }
    }

    if (rows.length > 0) {
      const { error: iErr } = await sb.from('client_history').insert(rows)
      if (iErr) throw iErr
    }

    return NextResponse.json({ inserted: rows.length, debug: debugLog })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '수집 실패'
    console.error('[slack/collect]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
