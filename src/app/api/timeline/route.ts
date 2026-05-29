import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const from  = sp.get('from')
  const to    = sp.get('to')
  const brand = sp.get('brand')

  const sb = await createClient()

  // 심층방어: RLS 외에 명시적 인증 가드 + 본인 워크스페이스로 한정
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ rows: [] })

  let query = sb
    .from('weekly_brand_summaries')
    .select('id, week_start, brand_name, topic, summary, item_count, key_tags, max_priority, thread_id, parent_thread_ids')
    .eq('workspace_id', member.workspace_id)
    .order('week_start', { ascending: true })
    .order('brand_name', { ascending: true })

  if (from)  query = query.gte('week_start', from)
  if (to)    query = query.lte('week_start', to)
  if (brand) query = query.eq('brand_name', brand)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: data ?? [] })
}
