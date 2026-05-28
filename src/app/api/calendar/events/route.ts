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
    if (googleError.reason === 'SERVICE_DISABLED' || googleError.reason === 'accessNotConfigured') {
      return NextResponse.json({
        error: 'GOOGLE_API_DISABLED',
        message: googleError.message ?? 'Google Calendar API is disabled.',
      }, { status: res.status })
    }
    return NextResponse.json({ error: 'GOOGLE_API_ERROR', detail: body }, { status: res.status })
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

/** 태스크 시간 배치 → 구글 이벤트 생성/수정 (upsert) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId } = await req.json() as { taskId?: string }
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  const { data: task } = await supabase
    .from('gantt_tasks')
    .select('title, scheduled_at, duration_minutes, google_event_id')
    .eq('id', taskId)
    .single()
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (!task.scheduled_at) return NextResponse.json({ ok: true, skipped: true })

  const tk = await getValidAccessToken(supabase, user.id)
  if ('error' in tk) return NextResponse.json({ error: tk.error }, { status: 403 })

  const title = task.title || '(제목 없음)'
  const times = buildEventTimes(task.scheduled_at, task.duration_minutes)

  // 기존 연결이 있으면 수정, 실패 시(삭제됨 등) 새로 생성
  if (task.google_event_id) {
    const ok = await gcalPatch(tk.token, task.google_event_id, title, times)
    if (ok) return NextResponse.json({ ok: true, googleEventId: task.google_event_id })
  }

  const newId = await gcalInsert(tk.token, taskId, title, times)
  if (!newId) return NextResponse.json({ error: 'GOOGLE_API_ERROR' }, { status: 502 })

  await supabase.from('gantt_tasks').update({ google_event_id: newId }).eq('id', taskId)
  return NextResponse.json({ ok: true, googleEventId: newId })
}

/** 배치 해제/삭제 → 연결된 구글 이벤트 삭제 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId } = await req.json() as { taskId?: string }
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

  const { data: task } = await supabase
    .from('gantt_tasks')
    .select('google_event_id')
    .eq('id', taskId)
    .single()
  if (!task?.google_event_id) return NextResponse.json({ ok: true, skipped: true })

  const tk = await getValidAccessToken(supabase, user.id)
  if ('error' in tk) return NextResponse.json({ error: tk.error }, { status: 403 })

  await gcalDelete(tk.token, task.google_event_id)
  await supabase.from('gantt_tasks').update({ google_event_id: null }).eq('id', taskId)
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
