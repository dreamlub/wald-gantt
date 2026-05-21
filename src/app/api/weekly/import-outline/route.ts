import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const OUTLINE_API = 'https://waldlust.getoutline.com/api'

async function outlinePost(endpoint: string, body: object) {
  const token = process.env.OUTLINE_API_TOKEN
  if (!token) throw new Error('OUTLINE_API_TOKEN이 설정되지 않았습니다')

  const res = await fetch(`${OUTLINE_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Outline API 오류: ${res.status} ${endpoint}`)
  return res.json()
}

type OutlineDoc = {
  id: string
  title: string
  parentDocumentId: string | null
}

/** ## YYYY.MM.DD 섹션 단위로 분리 */
function parseWeeklySections(text: string): { weekStart: string; content: string }[] {
  const sections: { weekStart: string; content: string }[] = []
  const regex = /^## (\d{4}\.\d{2}\.\d{2})/gm
  const matches: { index: number; weekStart: string }[] = []

  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    matches.push({
      index: m.index,
      weekStart: m[1].replace(/\./g, '-'),
    })
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const content = text.slice(start, end).trim()
    if (content) sections.push({ weekStart: matches[i].weekStart, content })
  }

  return sections
}

export async function POST() {
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

    const { data: sources } = await sb
      .from('weekly_sources')
      .select('*')
      .eq('workspace_id', member.workspace_id)
      .order('sort_order')

    if (!sources || sources.length === 0) {
      return NextResponse.json({ ok: true, results: [], total: 0 })
    }

    const results: { team: string; upserted: number; errors: number }[] = []

    for (const source of sources) {
      // 1. 컬렉션 전체 문서 목록 조회
      const docsRes = await outlinePost('documents.list', {
        collectionId: source.collection_id,
        limit: 100,
      })
      const allDocs: OutlineDoc[] = docsRes.data ?? []

      // 2. "주간회의" 부모 문서 탐색 → 없으면 쿼터 패턴으로 직접 탐색
      const weeklyParent = allDocs.find(
        d => d.title === '주간회의' || d.title.includes('주간회의')
      )

      const quarterDocs = weeklyParent
        ? allDocs.filter(d => d.parentDocumentId === weeklyParent.id)
        : allDocs.filter(d => /\(20\d\d\.\dQ\)/.test(d.title))

      let upserted = 0
      let errors = 0

      for (const qDoc of quarterDocs) {
        // 3. 쿼터 문서 내용 조회
        let text: string
        try {
          const docRes = await outlinePost('documents.info', { id: qDoc.id })
          text = docRes.data?.text ?? ''
        } catch {
          errors++
          continue
        }

        // 4. ## YYYY.MM.DD 섹션 파싱 → upsert
        const sections = parseWeeklySections(text)
        for (const section of sections) {
          const { error } = await sb.from('weekly_reports').upsert(
            {
              workspace_id: member.workspace_id,
              source: 'outline',
              team: source.label,
              author: null,
              week_start: section.weekStart,
              raw_content: section.content,
              summary: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'workspace_id,source,team,week_start', ignoreDuplicates: false }
          )
          if (error) errors++
          else upserted++
        }
      }

      results.push({ team: source.label, upserted, errors })
    }

    const total = results.reduce((s, r) => s + r.upserted, 0)
    return NextResponse.json({ ok: true, results, total })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
