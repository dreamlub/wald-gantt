import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listHistoryPage, getHistoryStats } from '@/lib/history-service'
import { parseHistoryPageParams } from './history-route-utils'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('mode')

  const sb = await createClient()

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
