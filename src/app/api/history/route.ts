import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listHistoryPage, getHistoryStats } from '@/lib/history-service'
import { parseHistoryPageParams } from './history-route-utils'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('mode')

  const sb = await createClient()

  // 심층방어: RLS 외에 명시적 인증 가드 (다른 라우트와 동일 패턴)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if (mode === 'stats') {
    const stats = await getHistoryStats(
      sp.get('from') ?? undefined,
      sp.get('to') ?? undefined,
      sb,
    )
    return NextResponse.json(stats)
  }

  const page = await listHistoryPage(parseHistoryPageParams(sp), sb)

  return NextResponse.json(page)
}
