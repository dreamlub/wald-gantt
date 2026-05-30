import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface BrandTimelineStat {
  brand_name: string
  daily_count: number
  weekly_count: number
  issue_count: number
  eligible: boolean
  reason: string | null
}

const MIN_WEEKLY = 4
const MIN_DAILY  = 30

export async function GET() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ brands: [] })

  const { data, error } = await sb.rpc('get_brand_timeline_stats', {
    p_workspace_id: member.workspace_id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const brands: BrandTimelineStat[] = (data ?? []).map((r: {
    brand_name: string; daily_count: number; weekly_count: number; issue_count: number
  }) => {
    let reason: string | null = null
    if (r.weekly_count === 0) {
      reason = `위클리 리포트 없음 (classify 3단계 필요)`
    } else if (r.weekly_count < MIN_WEEKLY) {
      reason = `위클리 ${r.weekly_count}주 (최소 ${MIN_WEEKLY}주 필요)`
    } else if (r.daily_count < MIN_DAILY) {
      reason = `데일리 ${r.daily_count}건 (최소 ${MIN_DAILY}건 필요)`
    }

    return {
      brand_name:   r.brand_name,
      daily_count:  Number(r.daily_count),
      weekly_count: Number(r.weekly_count),
      issue_count:  Number(r.issue_count),
      eligible:     reason === null,
      reason,
    }
  })

  return NextResponse.json({ brands })
}
