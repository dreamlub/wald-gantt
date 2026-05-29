import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getApiKey } from '@/lib/workspace-api-keys'

const OUTLINE_API = 'https://waldlust.getoutline.com/api'

async function outlinePost(endpoint: string, body: object, token: string) {

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

/** collections.documents 트리 노드 (중첩 children 포함) */
type OutlineTreeNode = { id: string; title: string; children?: OutlineTreeNode[] }

/** 중첩 트리를 평탄화하면서 parentDocumentId를 채운다 (documents.list가 중첩을 안 주는 경우 대비) */
function flattenTree(nodes: OutlineTreeNode[] | undefined, parentId: string | null): OutlineDoc[] {
  const out: OutlineDoc[] = []
  for (const n of nodes ?? []) {
    out.push({ id: n.id, title: n.title, parentDocumentId: parentId })
    if (n.children?.length) out.push(...flattenTree(n.children, n.id))
  }
  return out
}

/** ## YYYY-MM-DD 또는 ## YYYY.MM.DD 섹션 단위로 분리 */
function parseWeeklySections(text: string): { weekStart: string; content: string }[] {
  const sections: { weekStart: string; content: string }[] = []
  // 하이픈(실제 형식) · 점(레거시) 둘 다 허용
  const regex = /^## (\d{4}[-.]?\d{2}[-.]?\d{2})/gm
  const matches: { index: number; weekStart: string }[] = []

  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    // 구분자를 하이픈으로 통일 → YYYY-MM-DD
    const normalized = m[1].replace(/\./g, '-')
    matches.push({ index: m.index, weekStart: normalized })
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const content = text.slice(start, end).trim()
    if (content) sections.push({ weekStart: matches[i].weekStart, content })
  }

  return sections
}

/**
 * 문서 제목이 분기 문서인지 판별.
 * 실제 Outline 제목 형식: "DX기획1팀(2026.2Q)", "기획1팀 주간회의(2025.4Q)"
 * 그 외 "2026 Q1", "Q2 2026", "2026년 2분기" 등도 허용 (연/분기 사이 . - 공백 년 구분자 모두 허용)
 */
function isQuarterDoc(title: string): boolean {
  // 연도 → 분기: "2026.2Q", "2026 Q2", "2026년 2분기"
  const yearFirst    = /20\d{2}\s*[.\-\s년]?\s*(?:[1-4]\s*[Qq]|[Qq]\s*[1-4]|[1-4]\s*분기)/
  // 분기 → 연도: "Q2 2026", "2Q 2026"
  const quarterFirst = /(?:[1-4]\s*[Qq]|[Qq]\s*[1-4])\s*[.\-\s]?\s*20\d{2}/
  return yearFirst.test(title) || quarterFirst.test(title)
}

/**
 * 분기 문서 제목에서 정렬 키(연도*4 + 분기)를 추출. 추출 실패 시 -1.
 * "DX기획1팀(2026.2Q)" → 2026*4+2 = 8106
 */
function quarterSortKey(title: string): number {
  const year = title.match(/20\d{2}/)?.[0]
  const quarter = title.match(/([1-4])\s*[Qq]|[Qq]\s*([1-4])|([1-4])\s*분기/)
  if (!year || !quarter) return -1
  const q = Number(quarter[1] ?? quarter[2] ?? quarter[3])
  return Number(year) * 4 + q
}

// 수집할 최근 분기 문서 수 (현재 + 직전 분기). 분석 윈도우(8주)를 충분히 커버하며
// 과거 전체 분기를 매번 재수집하던 비용을 줄인다.
const RECENT_QUARTERS = 2


export async function POST(req: Request) {
  try {
    // 특정 팀만 수집할 때 { collectionId } 전달 (없으면 전체 팀 수집)
    const body = await req.json().catch(() => ({})) as { collectionId?: unknown }
    const onlyCollectionId = typeof body.collectionId === 'string' ? body.collectionId : null

    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 404 })

    const outlineToken = await getApiKey(sb, member.workspace_id, 'outline', process.env.OUTLINE_API_TOKEN)
    if (!outlineToken) {
      return NextResponse.json({ error: 'Outline API 토큰 미설정. 설정 > API 키에서 등록해 주세요.' }, { status: 500 })
    }

    const { data: allSources } = await sb
      .from('weekly_sources')
      .select('*')
      .eq('workspace_id', member.workspace_id)
      .order('sort_order')

    const sources = onlyCollectionId
      ? (allSources ?? []).filter(s => s.collection_id === onlyCollectionId)
      : (allSources ?? [])

    if (sources.length === 0) {
      return NextResponse.json({ ok: true, results: [], total: 0 })
    }

    const results: { team: string; upserted: number; errors: number; quarterDocsFound: string[] }[] = []

    for (const source of sources) {
      // 1. 컬렉션 전체 문서 트리 조회 (중첩 문서 포함) → 평탄화
      //    documents.list 는 중첩 하위 문서를 누락할 수 있어 collections.documents(트리)를 사용
      const treeRes = await outlinePost('collections.documents', {
        id: source.collection_id,
      }, outlineToken)
      const allDocs: OutlineDoc[] = flattenTree(treeRes.data as OutlineTreeNode[] | undefined, null)

      // 2. 분기 문서 탐색
      //    우선순위: "주간회의" 폴더(정확 일치) 하위의 분기 문서
      //    └ 폴더를 못 찾거나 하위에 분기 문서가 없으면 컬렉션 전체에서 분기 패턴으로 폴백
      //    ※ includes('주간회의')는 "기획1팀 주간회의(2025.4Q)" 같은 분기 문서까지
      //      부모로 오인할 수 있어 정확 일치로 제한한다.
      const weeklyParentIds = new Set(
        allDocs.filter(d => d.title.trim() === '주간회의').map(d => d.id)
      )

      let quarterDocs = weeklyParentIds.size > 0
        ? allDocs.filter(d => d.parentDocumentId != null && weeklyParentIds.has(d.parentDocumentId) && isQuarterDoc(d.title))
        : []

      if (quarterDocs.length === 0) {
        quarterDocs = allDocs.filter(d => isQuarterDoc(d.title))
      }

      // 최근 분기 문서만 수집 — 제목의 연/분기 기준 내림차순 정렬 후 상위 N개.
      // 과거 전체 분기를 매번 재수집하던 동작을 제한한다.
      quarterDocs = quarterDocs
        .slice()
        .sort((a, b) => quarterSortKey(b.title) - quarterSortKey(a.title))
        .slice(0, RECENT_QUARTERS)

      let upserted = 0
      let errors = 0

      for (const qDoc of quarterDocs) {
        // 3. 쿼터 문서 내용 조회
        let text: string
        try {
          const docRes = await outlinePost('documents.info', { id: qDoc.id }, outlineToken)
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

      results.push({
        team: source.label,
        upserted,
        errors,
        quarterDocsFound: quarterDocs.map(d => d.title),
      })
    }

    const total = results.reduce((s, r) => s + r.upserted, 0)
    return NextResponse.json({ ok: true, results, total })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
