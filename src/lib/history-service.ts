import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client, HistoryItem, HistoryType, StatusKind, Priority, Tag } from '@/app/(app)/summary/_lib/types'

type Sb = SupabaseClient

interface DbClient {
  id: string
  workspace_id: string
  name: string
  name_en: string | null
  color: string
  keywords: string[]
  sort_order: number
}

interface DbHistory {
  id: string
  workspace_id: string
  client_id: string
  type: HistoryType
  tags: Tag[] | null
  channel: string
  source_ref: string | null
  source_id: string | null
  title: string
  body: string | null
  occurred_at: string
  updated_at: string
  status: string | null
  status_kind: StatusKind | null
  priority: Priority | null
  author: string | null
  raw_message_id: string | null
  thread_count: number
  deleted_at: string | null
}

function toClient(r: DbClient): Client {
  return {
    id: r.id,
    name: r.name,
    name_en: r.name_en ?? '',
    color: r.color,
    keywords: r.keywords ?? [],
  }
}

function toHistory(r: DbHistory): HistoryItem {
  return {
    id: r.id,
    client_id: r.client_id,
    type: r.type,
    tags: r.tags ?? [],
    channel: r.channel,
    source_id: r.source_id,
    source_ref: r.source_ref,
    title: r.title,
    body: r.body,
    occurred_at: r.occurred_at,
    updated_at: r.updated_at,
    status: r.status,
    status_kind: r.status_kind,
    priority: r.priority,
    author: r.author,
    raw_message_id: r.raw_message_id,
    thread_count: r.thread_count ?? 0,
  }
}

async function getWorkspaceId(sb: Sb): Promise<string> {
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

// ── 클라이언트 ───────────────────────────────────────────────

export async function getClients(sb?: Sb): Promise<Client[]> {
  const client = sb ?? createBrowserClient()
  const { data, error } = await client
    .from('clients')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toClient)
}

export async function updateClientKeywords(clientId: string, keywords: string[]): Promise<void> {
  const sb = createBrowserClient()
  const { error } = await sb
    .from('clients')
    .update({ keywords })
    .eq('id', clientId)
  if (error) throw error
}

// ── 히스토리 ─────────────────────────────────────────────────

export async function listHistory(sb?: Sb): Promise<HistoryItem[]> {
  const client = sb ?? createBrowserClient()
  const { data, error } = await client
    .from('client_history')
    .select('*')
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(toHistory)
}

// Insert는 Make 시나리오가 Supabase에 직접 수행. 앱은 읽기만.
// 서버 컴포넌트용 헬퍼는 `@/lib/history-service-server` 참조

// getWorkspaceId가 미사용이 되긴 했지만, 향후 service_role 없는 클라이언트 측 insert가
// 다시 필요해질 때를 위해 export하지 않은 채로 남겨둠.
void getWorkspaceId
