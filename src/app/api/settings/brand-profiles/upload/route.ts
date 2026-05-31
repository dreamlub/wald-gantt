import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const BUCKET = 'brand-logos'
const MAX_BYTES = 512 * 1024  // 512 KB

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

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').slice(0, 60)
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const workspaceId = await getWorkspaceId(sb)

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const name = formData.get('name') as string | null

    if (!file || !name) return NextResponse.json({ error: 'file and name required' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: '512KB 이하 이미지만 업로드 가능합니다' }, { status: 413 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${workspaceId}/${slugify(name)}.${ext}`
    const bytes = await file.arrayBuffer()

    const admin = await createAdminClient()

    // 버킷이 없으면 생성
    const { data: buckets } = await admin.storage.listBuckets()
    if (!buckets?.find(b => b.name === BUCKET)) {
      await admin.storage.createBucket(BUCKET, { public: true })
    }

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true })

    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)

    const { error: dbErr } = await sb
      .from('brand_profiles')
      .upsert(
        { workspace_id: workspaceId, name, logo_url: publicUrl },
        { onConflict: 'workspace_id,name' },
      )

    if (dbErr) throw dbErr
    return NextResponse.json({ logo_url: publicUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
