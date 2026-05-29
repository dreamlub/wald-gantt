import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CalendarEvent } from '@/types'
import {
  getValidAccessToken, buildEventTimes, gcalInsert, gcalPatch, gcalDelete,
  WALD_ORIGIN_KEY,
} from '@/lib/google-calendar'

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

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const date    = searchParams.get('date')
  const endDate = searchParams.get('endDate') ?? date
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 })
  }

  const tk = await getValidAccessToken(supabase, user.id)
  if ('error' in tk) return NextResponse.json({ error: tk.error }, { status: 403 })

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin',      `${date}T00:00:00+09:00`)
  url.searchParams.set('timeMax',      `${endDate}T23:59:59+09:00`)
  url.searchParams.set('timeZone',     'Asia/Seoul')
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy',      'startTime')
  url.searchParams.set('maxResults',   '200')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${tk.token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    const googleError = parseGoogleApiError(body)
    // 토큰 무효화/권한 취소(401) → 재연결 유도 (UI에 'Google 연결' 버튼 노출)
    if (res.status === 401) {
      return NextResponse.json({ error: 'TOKEN_EXPIRED' }, { status: 403 })
    }
    if (googleError.reason === 'SERVICE_DISABLED' || googleError.reason === 'accessNotConfigured') {
      return NextResponse.json({
        error: 'GOOGLE_API_DISABLED',
        message: googleError.message ?? 'Google Calendar API is disabled.',
      }, { status: res.status })
    }
    console.error('[calendar/events] Google API error:', res.status, body)
    return NextResponse.json({ error: 'GOOGLE_API_ERROR' }, { status: res.status })
  }

  const json = await res.json() as { items?: Record<string, unknown>[] }
  const events: CalendarEvent[] = (json.items ?? [])
    // 앱에서 생성한 이벤트는 이미 태스크 블록으로 표시되므로 제외 (중복 방지)
    .filter(item => {
      const ext = item.extendedProperties as { private?: Record<string, string> } | undefined
      return !ext?.private?.[WALD_ORIGIN_KEY]
    })
    .map(item => {
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

const EVENT_SELECT = 'id, workspace_id, title, scheduled_at, duration_minutes, google_event_id'

async function getWorkspaceId(sb: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  return member?.workspace_id ?? null
}

/** 캘린더 이벤트 생성 → DB 저장 + 구글 이벤트 생성 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, scheduledAt, durationMinutes } = await req.json() as {
    title?: string; scheduledAt?: string; durationMinutes?: number
  }
  if (!scheduledAt) return NextResponse.json({ error: 'scheduledAt required' }, { status: 400 })

  const workspaceId = await getWorkspaceId(supabase)
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

  const safeTitle = (title ?? '').trim() || '(제목 없음)'
  const dur = durationMinutes && durationMinutes > 0 ? durationMinutes : 60

  // 1) DB 행 생성
  const { data: row, error } = await supabase
    .from('calendar_events')
    .insert({ workspace_id: workspaceId, title: safeTitle, scheduled_at: scheduledAt, duration_minutes: dur })
    .select(EVENT_SELECT)
    .single()
  if (error || !row) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })

  // 2) 구글 이벤트 생성 (연동 시에만, 실패해도 DB 행은 유지)
  const tk = await getValidAccessToken(supabase, user.id)
  if (!('error' in tk)) {
    const gid = await gcalInsert(tk.token, row.id, safeTitle, buildEventTimes(scheduledAt, dur))
    if (gid) {
      await supabase.from('calendar_events').update({ google_event_id: gid }).eq('id', row.id)
      row.google_event_id = gid
    }
  }

  return NextResponse.json({ event: row })
}

/** 캘린더 이벤트 수정 (이동/리사이즈/제목) → DB + 구글 PATCH */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, title, scheduledAt, durationMinutes } = await req.json() as {
    id?: string; title?: string; scheduledAt?: string; durationMinutes?: number
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined)           patch.title = title.trim() || '(제목 없음)'
  if (scheduledAt !== undefined)     patch.scheduled_at = scheduledAt
  if (durationMinutes !== undefined) patch.duration_minutes = durationMinutes

  const { data: row, error } = await supabase
    .from('calendar_events')
    .update(patch)
    .eq('id', id)
    .select(EVENT_SELECT)
    .single()
  if (error || !row) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 })

  const tk = await getValidAccessToken(supabase, user.id)
  if (!('error' in tk)) {
    if (row.google_event_id) {
      await gcalPatch(tk.token, row.google_event_id, row.title, buildEventTimes(row.scheduled_at, row.duration_minutes))
    } else {
      // 생성 시 구글 동기화에 실패했거나 그 후 연동한 행 → 토큰이 있으면 지연 백필
      const gid = await gcalInsert(tk.token, row.id, row.title, buildEventTimes(row.scheduled_at, row.duration_minutes))
      if (gid) {
        await supabase.from('calendar_events').update({ google_event_id: gid }).eq('id', row.id)
        row.google_event_id = gid
      }
    }
  }

  return NextResponse.json({ event: row })
}

/** 캘린더 이벤트 삭제 → DB + 구글 DELETE */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: row } = await supabase
    .from('calendar_events')
    .select('google_event_id')
    .eq('id', id)
    .single()

  if (row?.google_event_id) {
    const tk = await getValidAccessToken(supabase, user.id)
    if (!('error' in tk)) await gcalDelete(tk.token, row.google_event_id)
  }

  await supabase.from('calendar_events').delete().eq('id', id)
  return NextResponse.json({ ok: true })
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
