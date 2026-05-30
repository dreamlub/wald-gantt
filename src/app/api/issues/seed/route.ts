import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getApiKey } from '@/lib/workspace-api-keys'

// ── Zod 스키마 ──────────────────────────────────────────────
const IssueNodeSchema = z.object({
  title:        z.string(),
  type:         z.enum(['issue', 'project', 'decision']),
  priority:     z.enum(['high', 'medium', 'low']),
  body:         z.string(),
  action:       z.string(),
  status:       z.enum(['open', 'closed']),
  message_keys: z.array(z.string()),
})

const SeedOutputSchema = z.object({
  issues: z.array(IssueNodeSchema),
})

// ── POST /api/issues/seed ────────────────────────────────────
export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { brand_name } = await req.json() as { brand_name: string }
  if (!brand_name) return NextResponse.json({ error: 'brand_name required' }, { status: 400 })

  // 워크스페이스 조회
  const { data: member } = await sb
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 400 })
  const workspaceId = member.workspace_id

  // Anthropic API 키
  const apiKey = await getApiKey(sb, workspaceId, 'anthropic', process.env.ANTHROPIC_API_KEY)
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API key not set' }, { status: 400 })

  // 기존 이슈 삭제 (재시딩)
  await sb.from('issues').delete().eq('workspace_id', workspaceId).eq('brand_name', brand_name)

  // 전체 이력 조회 (날짜 제한 없음)
  const { data: messages } = await sb
    .from('client_history')
    .select('id, title, body, priority, tags, occurred_at')
    .eq('workspace_id', workspaceId)
    .eq('brand_name', brand_name)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: true })
    .limit(600)

  if (!messages?.length) {
    return NextResponse.json({ error: 'No messages found', brand_name }, { status: 404 })
  }

  // key → id 매핑
  interface MsgEntry { key: string; id: string; dateStr: string }
  const keyedMessages: MsgEntry[] = messages.map((m, i) => ({
    key:     `msg_${i}`,
    id:      m.id as string,
    dateStr: (m.occurred_at as string).slice(0, 10),
  }))

  const messageText = messages.map((m, i) => {
    const dateStr = (m.occurred_at as string).slice(0, 10)
    const body    = (m.body as string | null)?.slice(0, 280) ?? ''
    return `[msg_${i}] ${dateStr} | ${m.priority} | ${m.title}\n${body}`
  }).join('\n\n---\n\n')

  // Claude 호출
  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model:      'claude-opus-4-8-20251101',
    max_tokens: 8000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output_config: { format: zodOutputFormat(SeedOutputSchema) } as any,
    system: `당신은 슬랙 메시지 요약본을 분석해 브랜드 이슈 노드로 통합하는 전문가입니다.

규칙:
- 같은 매장/시스템의 반복 오류는 하나의 이슈 노드로 묶으세요 (예: 여러 매장 POS 결제 오류 → "POS 결제 오류 (반복)")
- 프로젝트: 명확한 시작~완료가 있는 것 (연동 개발, 업데이트 배포 등)
- 결정: 정책/방향이 확정된 것
- 이슈 제목에 브랜드명 포함 금지
- closed: 조치 완료 또는 해소됨 / open: 미결 또는 진행 중
- message_keys에는 해당 노드에 속하는 메시지 key 전부 포함
- 반드시 한국어로 작성`,
    messages: [{
      role: 'user',
      content: `브랜드: ${brand_name}\n메시지 수: ${messages.length}건\n\n${messageText}`,
    }],
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = (message as any).parsed_output as z.infer<typeof SeedOutputSchema> | null
  if (!parsed?.issues?.length) {
    return NextResponse.json({ error: 'AI returned no issues' }, { status: 500 })
  }

  // key → uuid 역매핑
  const keyToId  = new Map(keyedMessages.map(m => [m.key, m.id]))
  const keyToDate = new Map(keyedMessages.map(m => [m.key, m.dateStr]))

  let inserted = 0
  let linked   = 0

  for (const node of parsed.issues) {
    const dates = node.message_keys
      .map((k: string) => keyToDate.get(k) ?? '')
      .filter(Boolean)
      .sort()

    const first_seen = dates[0]
      ? new Date(dates[0]).toISOString()
      : new Date().toISOString()
    const last_seen  = dates[dates.length - 1]
      ? new Date(dates[dates.length - 1]).toISOString()
      : new Date().toISOString()

    const { data: issueRow } = await sb.from('issues').insert({
      workspace_id: workspaceId,
      brand_name,
      title:     node.title,
      type:      node.type,
      priority:  node.priority,
      status:    node.status,
      body:      node.body,
      action:    node.action,
      first_seen,
      last_seen,
    }).select('id').single()

    if (!issueRow) continue
    inserted++

    const msgIds = node.message_keys
      .map((k: string) => keyToId.get(k))
      .filter((id: string | undefined): id is string => !!id)

    if (msgIds.length) {
      await sb.from('client_history')
        .update({ issue_id: issueRow.id })
        .in('id', msgIds)
      linked += msgIds.length
    }
  }

  return NextResponse.json({
    ok: true,
    brand_name,
    messages: messages.length,
    issues_created: inserted,
    messages_linked: linked,
  })
}
