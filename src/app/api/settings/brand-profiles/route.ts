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

export async function GET() {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const { data, error } = await sb
      .from('brand_profiles')
      .select('name, logo_url, lucide_icon')
      .eq('workspace_id', workspaceId)

    if (error) throw error
    return NextResponse.json({ profiles: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)
    const { name, lucide_icon } = await req.json() as { name: string; lucide_icon: string | null }

    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const { error } = await sb
      .from('brand_profiles')
      .upsert(
        { workspace_id: workspaceId, name, lucide_icon: lucide_icon ?? null },
        { onConflict: 'workspace_id,name' },
      )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)
    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name')

    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const { error } = await sb
      .from('brand_profiles')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('name', name)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
