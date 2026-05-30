import { createClient } from '@/lib/supabase/client'
import type { Insight } from '@/app/(app)/slack/_lib/types'

async function getWorkspaceId(): Promise<string> {
  const sb = createClient()
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

export async function getInsight(weekStart: string): Promise<Insight | null> {
  const sb = createClient()
  const workspaceId = await getWorkspaceId()
  const { data } = await sb
    .from('insights')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('week_start', weekStart)
    .single()
  return data ?? null
}

export async function generateInsight(
  weekStart: string,
  onStatus?: (message: string) => void,
): Promise<Insight> {
  const res = await fetch('/api/insights/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ week_start: weekStart }),
  })

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.split('\n')
      let eventType = 'message'
      let eventData = ''

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim()
        else if (line.startsWith('data: ')) eventData = line.slice(6)
      }

      if (!eventData) continue

      const data = JSON.parse(eventData) as Record<string, unknown>
      if (eventType === 'status') {
        onStatus?.(data.message as string)
      } else if (eventType === 'result') {
        return data as unknown as Insight
      } else if (eventType === 'error') {
        throw new Error(data.message as string)
      }
    }
  }

  throw new Error('분석 스트림이 결과 없이 종료되었습니다')
}
