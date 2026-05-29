import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleCreds } from '@/lib/google-calendar'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const creds = await getGoogleCreds(supabase)
  if (!creds) return NextResponse.json({ error: 'Google 자격증명이 설정되지 않았습니다. 설정 > 연동에서 Client ID / Secret을 입력해 주세요.' }, { status: 400 })

  const state       = crypto.randomBytes(16).toString('hex')
  const cookieStore = await cookies()
  cookieStore.set('gcal_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const origin      = req.nextUrl.origin
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/calendar/callback`
  const params = new URLSearchParams({
    client_id:     creds.clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/calendar.events',
    access_type:   'offline',
    prompt:        'consent',
    state,
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
}
