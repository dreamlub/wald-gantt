import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ISSUE_COLUMNS =
  'id, brand_name, title, type, priority, status, body, action, first_seen, last_seen, parent_issue_id, created_at'

export interface IssueRelation {
  id: string
  from_issue_id: string
  to_issue_id: string
  relation_type: 'causes' | 'blocks' | 'recurs_as' | 'continues' | 'related'
  note: string | null
}

// GET /api/issues?brand=더리터&status=open
// 응답: { issues, relations, evidenceCounts }
//   - issues: 이슈 목록 (원문 미포함 — 첫 로딩 경량 유지)
//   - relations: 비계층 관계 (from→to, 점선)
//   - evidenceCounts: { [issueId]: number } — 연결된 client_history 메시지 수
export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ issues: [], relations: [], evidenceCounts: {} })

  const sp     = req.nextUrl.searchParams
  const brand  = sp.get('brand')
  const status = sp.get('status') // open | closed | all

  let q = sb
    .from('issues')
    .select(ISSUE_COLUMNS)
    .eq('workspace_id', member.workspace_id)
    .order('last_seen', { ascending: false })
    .limit(2000) // 브랜드당 수십 건 × 브랜드 수 상한

  if (brand) q = q.eq('brand_name', brand)
  if (status && status !== 'all') q = q.eq('status', status)

  const { data: issues } = await q
  const issueList = issues ?? []
  const issueIds = new Set(issueList.map(i => i.id))

  // 관계 + evidence 집계를 병렬 조회 (이슈가 없으면 스킵)
  if (issueList.length === 0) {
    return NextResponse.json({ issues: [], relations: [], evidenceCounts: {} })
  }

  const [relationsRes, evidenceRes] = await Promise.all([
    // 비계층 관계 — 워크스페이스 전체 후 현재 이슈 집합으로 필터
    sb
      .from('issue_relations')
      .select('id, from_issue_id, to_issue_id, relation_type, note')
      .eq('workspace_id', member.workspace_id)
      .limit(5000),
    // evidence_count — issue_id 컬럼만 끌어와 JS에서 group-by (N+1 회피, 단일 쿼리)
    sb
      .from('client_history')
      .select('issue_id')
      .eq('workspace_id', member.workspace_id)
      .not('issue_id', 'is', null)
      .is('deleted_at', null)
      .limit(20000),
  ])

  // 현재 이슈 집합에 속한 관계만 전달
  const relations = (relationsRes.data ?? []).filter(
    r => issueIds.has(r.from_issue_id) && issueIds.has(r.to_issue_id),
  )

  const evidenceCounts: Record<string, number> = {}
  for (const row of evidenceRes.data ?? []) {
    const id = row.issue_id as string | null
    if (id && issueIds.has(id)) {
      evidenceCounts[id] = (evidenceCounts[id] ?? 0) + 1
    }
  }

  return NextResponse.json({ issues: issueList, relations, evidenceCounts })
}
