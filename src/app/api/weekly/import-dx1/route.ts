import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WEEKS_PART1, type WeekSeed } from './_weeks-part1'
import { WEEKS_PART2 } from './_weeks-part2'

const TEAM = 'DX기획1팀'

const WEEKS: WeekSeed[] = [...WEEKS_PART1, ...WEEKS_PART2]

export async function GET() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

    const results = []
    for (const week of WEEKS) {
      const { data, error } = await sb
        .from('weekly_reports')
        .upsert(
          {
            workspace_id: member.workspace_id,
            source: 'team_doc',
            team: TEAM,
            author: null,
            week_start: week.week_start,
            raw_content: week.raw_content,
            summary: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,source,team,week_start', ignoreDuplicates: false }
        )
        .select('id, week_start')
        .single()

      if (error) return NextResponse.json({ error: error.message, week_start: week.week_start }, { status: 500 })
      results.push({ id: data.id, week_start: data.week_start })
    }

    return NextResponse.json({ ok: true, team: TEAM, inserted: results.length, weeks: results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
