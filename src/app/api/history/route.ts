import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listHistoryPage, getHistoryStats } from '@/lib/history-service'

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

  const page = await listHistoryPage({
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    brand: sp.get('brand') ?? undefined,
    priority: sp.get('priority') ?? undefined,
    tags: sp.get('tags') ? sp.get('tags')!.split(',') : undefined,
    author: sp.get('author') ?? undefined,
    q: sp.get('q') ?? undefined,
    cursor: sp.get('cursor') ?? undefined,
    limit: sp.get('limit') ? parseInt(sp.get('limit')!) : undefined,
  }, sb)

  return NextResponse.json(page)
}
