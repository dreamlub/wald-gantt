import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/issues?brand=더리터&status=open
export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ issues: [] })

  const sp     = req.nextUrl.searchParams
  const brand  = sp.get('brand')
  const status = sp.get('status') // open | closed | all

  let q = sb
    .from('issues')
    .select('*')
    .eq('workspace_id', member.workspace_id)
    .order('last_seen', { ascending: false })
    .limit(2000) // 브랜드당 수십 건 × 브랜드 수 상한

  if (brand) q = q.eq('brand_name', brand)
  if (status && status !== 'all') q = q.eq('status', status)

  const { data: issues } = await q
  return NextResponse.json({ issues: issues ?? [] })
}
