import { createClient } from '@/lib/supabase/client'
import type { CalEvent } from '@/types'

const db = () => createClient()

const SELECT = 'id, workspace_id, title, scheduled_at, duration_minutes, google_event_id'

/** 워크스페이스의 캘린더 이벤트 (특정 기간) */
export async function getCalendarEvents(
  workspaceId: string,
  startIso: string,
  endIso: string,
): Promise<CalEvent[]> {
  const { data, error } = await db()
    .from('calendar_events')
    .select(SELECT)
    .eq('workspace_id', workspaceId)
    .gte('scheduled_at', startIso)
    .lt('scheduled_at', endIso)
    .order('scheduled_at')
  if (error) throw error
  return (data ?? []) as CalEvent[]
}
