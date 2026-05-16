import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const origin       = req.nextUrl.origin
  const { searchParams } = req.nextUrl
  const code         = searchParams.get('code')
  const state        = searchParams.get('state')
  const errorParam   = searchParams.get('error')

  const cookieStore  = await cookies()
  const savedState   = cookieStore.get('gcal_state')?.value
  cookieStore.delete('gcal_state')

  if (errorParam) {
    return NextResponse.redirect(`${origin}/calendar?gcal_error=denied`)
  }
  if (!code || !savedState || state !== savedState) {
    return NextResponse.redirect(`${origin}/calendar?gcal_error=invalid_state`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/login`)

  // 코드 → 토큰 교환
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  `${origin}/api/calendar/callback`,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/calendar?gcal_error=token_exchange`)
  }

  const token     = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()

  const { error } = await supabase.from('google_calendar_tokens').upsert({
    user_id:       user.id,
    access_token:  token.access_token,
    refresh_token: token.refresh_token ?? null,
    expires_at:    expiresAt,
    updated_at:    new Date().toISOString(),
  })

  if (error) {
    return NextResponse.redirect(`${origin}/calendar?gcal_error=db`)
  }

  return NextResponse.redirect(`${origin}/calendar`)
}
