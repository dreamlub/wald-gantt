import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getClients, listHistory } from '@/lib/history-service'
import type { Client, HistoryItem } from '@/app/(app)/summary/_lib/types'

export async function getServerClients(): Promise<Client[]> {
  const sb = await createClient()
  return getClients(sb)
}

export async function getServerHistory(): Promise<HistoryItem[]> {
  const sb = await createClient()
  return listHistory(sb)
}
