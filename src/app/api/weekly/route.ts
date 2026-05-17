import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { WeeklyDoc, WeekSection } from '@/app/(app)/weekly/_lib/types'

function parseWeekSections(text: string): WeekSection[] {
  const DATE_RE = /^## (\d{4}\.\d{2}\.\d{2})\s*$/gm
  const matches: { date: string; start: number; headerEnd: number }[] = []

  let m
  while ((m = DATE_RE.exec(text)) !== null) {
    matches.push({ date: m[1], start: m.index, headerEnd: m.index + m[0].length })
  }

  const sections: WeekSection[] = []
  for (let i = 0; i < matches.length; i++) {
    const { date, headerEnd } = matches[i]
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : text.length
    const content = text.slice(headerEnd, nextStart).trim()
    sections.push({ date, isoDate: date.replace(/\./g, '-'), content })
  }

  return sections
}

async function fetchDocSections(
  apiUrl: string,
  token: string,
  docId: string,
): Promise<WeekSection[]> {
  try {
    const res = await fetch(`${apiUrl}/api/documents.info`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: docId }),
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return parseWeekSections(json.data?.text ?? '')
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const apiUrl = process.env.OUTLINE_API_URL
  const token = process.env.OUTLINE_API_TOKEN
  const teamId = req.nextUrl.searchParams.get('team')

  if (!apiUrl || !token) {
    return NextResponse.json(
      { error: 'OUTLINE_API_URL 및 OUTLINE_API_TOKEN 환경 변수를 설정해주세요' },
      { status: 500 },
    )
  }

  if (!teamId) {
    return NextResponse.json({ error: '팀을 선택해주세요' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: source, error } = await supabase
    .from('weekly_sources')
    .select('label, collection_id')
    .eq('id', teamId)
    .single()

  if (error || !source) {
    return NextResponse.json({ error: '팀 정보를 찾을 수 없습니다' }, { status: 404 })
  }

  try {
    const listRes = await fetch(`${apiUrl}/api/documents.list`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ collectionId: source.collection_id, limit: 100 }),
      next: { revalidate: 300 },
    })

    if (!listRes.ok) {
      return NextResponse.json(
        { error: `Outline API 오류: ${listRes.status}` },
        { status: listRes.status },
      )
    }

    const listJson = await listRes.json()
    const docs: { id: string }[] = listJson.data ?? []

    const allSections = await Promise.all(
      docs.map(doc => fetchDocSections(apiUrl, token, doc.id))
    )

    // 병합 후 중복 제거(isoDate 기준), 날짜 내림차순
    const seen = new Set<string>()
    const merged: WeekSection[] = []
    for (const sections of allSections) {
      for (const s of sections) {
        if (!seen.has(s.isoDate)) {
          seen.add(s.isoDate)
          merged.push(s)
        }
      }
    }
    merged.sort((a, b) => b.isoDate.localeCompare(a.isoDate))

    const result: WeeklyDoc = {
      title: source.label,
      weeks: merged,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/weekly]', err)
    return NextResponse.json({ error: '문서 조회 실패' }, { status: 500 })
  }
}
