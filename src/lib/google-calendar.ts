import type { createClient } from '@/lib/supabase/server'
import { kstDate } from '@/lib/kst'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/** DB(workspace_api_keys)에서 Google OAuth 자격증명 조회, 없으면 환경변수 fallback */
export async function getGoogleCreds(
  supabase: ServerSupabase,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (member?.workspace_id) {
      const { data: rows } = await supabase
        .from('workspace_api_keys')
        .select('key_name, key_value')
        .eq('workspace_id', member.workspace_id)
        .in('key_name', ['google_client_id', 'google_client_secret'])
      const map = Object.fromEntries((rows ?? []).map(r => [r.key_name, r.key_value as string]))
      if (map.google_client_id && map.google_client_secret) {
        return { clientId: map.google_client_id, clientSecret: map.google_client_secret }
      }
    }
  }
  // 환경변수 fallback
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (clientId && clientSecret) return { clientId, clientSecret }
  return null
}

/** 앱에서 생성한 이벤트 식별용 — 읽기 시 중복 표시 방지에 사용 */
export const WALD_ORIGIN_KEY = 'waldOrigin'

export type TokenResult =
  | { token: string }
  | { error: 'NO_TOKEN' | 'TOKEN_EXPIRED' }

/** 저장된 토큰을 조회하고, 만료됐으면 refresh 후 유효한 access token 반환 */
export async function getValidAccessToken(
  supabase: ServerSupabase,
  userId: string,
): Promise<TokenResult> {
  const { data: tokenRow } = await supabase
    .from('google_calendar_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) return { error: 'NO_TOKEN' }

  const isExpired = new Date(tokenRow.expires_at).getTime() < Date.now() + 30_000
  if (!isExpired) return { token: tokenRow.access_token }

  if (!tokenRow.refresh_token) return { error: 'TOKEN_EXPIRED' }

  const creds = await getGoogleCreds(supabase)
  if (!creds) return { error: 'TOKEN_EXPIRED' }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: tokenRow.refresh_token,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) return { error: 'TOKEN_EXPIRED' }

  const data = await res.json() as { access_token: string; expires_in: number }
  await supabase.from('google_calendar_tokens').update({
    access_token: data.access_token,
    expires_at:   new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at:   new Date().toISOString(),
  }).eq('user_id', userId)

  return { token: data.access_token }
}

/** 구글 이벤트 시각 — 종일(date) 또는 시간(dateTime) */
type EventTime = { date: string } | { dateTime: string; timeZone: string }
export interface EventTimes { start: EventTime; end: EventTime }

/** scheduled_at(절대 instant) + 종일/시간 여부로 구글 이벤트 시각 페이로드 생성 */
export function buildEventTimes(scheduledAt: string, durationMinutes: number | null): EventTimes {
  const isAllDay = durationMinutes === 0 || durationMinutes === null
  if (isAllDay) {
    // KST 달력 날짜로 변환
    const startDate = kstDate(scheduledAt)
    const endDate   = kstDate(new Date(new Date(scheduledAt).getTime() + 86_400_000))
    return { start: { date: startDate }, end: { date: endDate } } // end는 exclusive
  }
  const startMs = new Date(scheduledAt).getTime()
  const endMs   = startMs + durationMinutes * 60_000
  return {
    start: { dateTime: new Date(startMs).toISOString(), timeZone: 'Asia/Seoul' },
    end:   { dateTime: new Date(endMs).toISOString(),   timeZone: 'Asia/Seoul' },
  }
}

interface GcalBody extends EventTimes {
  summary: string
  extendedProperties?: { private: Record<string, string> }
}

/** 이벤트 생성 → 생성된 eventId 반환 */
export async function gcalInsert(token: string, taskId: string, summary: string, times: EventTimes): Promise<string | null> {
  const body: GcalBody = {
    summary,
    ...times,
    extendedProperties: { private: { [WALD_ORIGIN_KEY]: taskId } },
  }
  const res = await fetch(GCAL_BASE, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) return null
  const json = await res.json() as { id?: string }
  return json.id ?? null
}

/** 기존 이벤트 수정 */
export async function gcalPatch(token: string, eventId: string, summary: string, times: EventTimes): Promise<boolean> {
  const res = await fetch(`${GCAL_BASE}/${encodeURIComponent(eventId)}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ summary, ...times }),
  })
  return res.ok
}

/** 이벤트 삭제 (이미 삭제된 410도 성공 처리) */
export async function gcalDelete(token: string, eventId: string): Promise<boolean> {
  const res = await fetch(`${GCAL_BASE}/${encodeURIComponent(eventId)}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok || res.status === 410
}
