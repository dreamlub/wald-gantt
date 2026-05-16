import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CalendarEvent } from '@/types'

function parseGoogleApiError(body: string): { reason?: string; message?: string } {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string
        errors?: { reason?: string }[]
        details?: { reason?: string }[]
      }
    }
    return {
      reason: parsed.error?.errors?.[0]?.reason ?? parsed.error?.details?.[0]?.reason,
      message: parsed.error?.message,
    }
  } catch {
    return {}
  }
}

async function refreshAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  refreshToken: string
): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) return null

  const data = await res.json() as { access_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  await supabase.from('google_calendar_tokens').update({
    access_token: data.access_token,
    expires_at:   expiresAt,
    updated_at:   new Date().toISOString(),
  }).eq('user_id', userId)

  return data.access_token
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  // 저장된 토큰 조회
  const { data: tokenRow } = await supabase
    .from('google_calendar_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', user.id)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ error: 'NO_TOKEN' }, { status: 403 })
  }

  // 만료 여부 확인 (30초 여유)
  let accessToken = tokenRow.access_token
  const isExpired = new Date(tokenRow.expires_at).getTime() < Date.now() + 30_000

  if (isExpired) {
    if (!tokenRow.refresh_token) {
      return NextResponse.json({ error: 'TOKEN_EXPIRED' }, { status: 403 })
    }
    const refreshed = await refreshAccessToken(supabase, user.id, tokenRow.refresh_token)
    if (!refreshed) {
      return NextResponse.json({ error: 'TOKEN_EXPIRED' }, { status: 403 })
    }
    accessToken = refreshed
  }

  // Google Calendar API 호출
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin',      `${date}T00:00:00+09:00`)
  url.searchParams.set('timeMax',      `${date}T23:59:59+09:00`)
  url.searchParams.set('timeZone',     'Asia/Seoul')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy',      'startTime')
  url.searchParams.set('maxResults',   '50')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.text()
    const googleError = parseGoogleApiError(body)
    if (googleError.reason === 'SERVICE_DISABLED' || googleError.reason === 'accessNotConfigured') {
      return NextResponse.json({
        error: 'GOOGLE_API_DISABLED',
        message: googleError.message ?? 'Google Calendar API is disabled.',
      }, { status: res.status })
    }
    return NextResponse.json({ error: 'GOOGLE_API_ERROR', detail: body }, { status: res.status })
  }

  const json = await res.json() as { items?: Record<string, unknown>[] }
  const events: CalendarEvent[] = (json.items ?? []).map(item => {
    const isAllDay = Boolean((item.start as Record<string, unknown>)?.date)
    return {
      id:          item.id as string,
      title:       (item.summary as string) ?? '(제목 없음)',
      start:       ((item.start as Record<string, string>)?.dateTime ?? (item.start as Record<string, string>)?.date ?? ''),
      end:         ((item.end   as Record<string, string>)?.dateTime ?? (item.end   as Record<string, string>)?.date ?? ''),
      color:       item.colorId ? (GOOGLE_COLORS[item.colorId as string] ?? null) : null,
      isAllDay,
      location:    (item.location as string) ?? null,
      description: (item.description as string) ?? null,
    }
  })

  return NextResponse.json({ events })
}

const GOOGLE_COLORS: Record<string, string> = {
  '1':  '#a4bdfc',
  '2':  '#7ae28c',
  '3':  '#dbadff',
  '4':  '#ff887c',
  '5':  '#fbd75b',
  '6':  '#ffb878',
  '7':  '#46d6db',
  '8':  '#e1e1e1',
  '9':  '#5484ed',
  '10': '#51b749',
  '11': '#dc2626',
}
