import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getWorkspaceId(sb: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()
  if (!member) throw new Error('No workspace found')
  return member.workspace_id
}

export async function POST(req: NextRequest) {
  try {
    const { date } = await req.json() as { date: string }
    if (!date) {
      return NextResponse.json({ error: 'date required' }, { status: 400 })
    }

    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    // 리포트가 없는 날짜에 대해 토큰을 발급하면 열었을 때 죽은 링크가 되므로 사전 확인
    const { data: report } = await sb
      .from('daily_reports')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('report_date', date)
      .maybeSingle()
    if (!report) {
      return NextResponse.json({ error: '해당 날짜의 데일리 리포트가 없습니다.' }, { status: 404 })
    }

    const { data: token, error } = await sb.rpc('upsert_daily_report_share', {
      p_date: date,
      p_workspace_id: workspaceId,
    })

    if (error) throw error
    if (!token) throw new Error('토큰 생성 실패')

    const origin = req.nextUrl.origin
    const url = `${origin}/share/daily/${token}`
    return NextResponse.json({ token, url })
  } catch (e) {
    console.error('[daily-share]', e)
    const msg =
      e instanceof Error ? e.message :
      (typeof e === 'object' && e !== null && 'message' in e)
        ? String((e as { message: unknown }).message)
        : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
