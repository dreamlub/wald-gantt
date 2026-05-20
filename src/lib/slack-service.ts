/**
 * Slack 수집 공통 유틸리티
 *
 * DB migration (Supabase 대시보드에서 실행):
 *
 * CREATE TABLE IF NOT EXISTS slack_raw_messages (
 *   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   workspace_id uuid NOT NULL,
 *   channel      text NOT NULL,
 *   channel_id   text,
 *   parent_ts    text NOT NULL,
 *   raw_json     jsonb NOT NULL,
 *   collected_at timestamptz NOT NULL DEFAULT now(),
 *   UNIQUE (workspace_id, channel, parent_ts)
 * );
 * ALTER TABLE slack_raw_messages ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "workspace members access" ON slack_raw_messages FOR ALL
 *   USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
 *
 * ALTER TABLE client_history ADD COLUMN IF NOT EXISTS raw_message_id uuid REFERENCES slack_raw_messages(id);
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 발트루스트 슬랙 워크스페이스 도메인
const WORKSPACE_DOMAIN = 'waldlust-product'
// 멘션 감지 대상 User ID
const MENTION_USER_ID = 'U09H44MEK5Z'

// ── 타입 ─────────────────────────────────────────────────────────

export interface RawReply {
  ts: string
  text: string
  user: string
  user_name: string
}

export interface RawJson {
  ts: string
  text: string
  user: string
  user_name: string
  channel: string
  channel_id: string
  permalink: string
  reply_count: number
  replies: RawReply[]
}

export interface ClassifyResult {
  tags: string[]
  priority: 'high' | 'medium' | 'low'
  title: string
  body: string
  author: string
}

interface DbClient {
  id: string
  name: string
  keywords: string[]
  channels: string[]
}

// ── 유틸 ─────────────────────────────────────────────────────────

/** 슬랙 ts(Unix 소수점) → ISO 8601 */
export function tsToISO(ts: string): string {
  return new Date(parseFloat(ts) * 1000).toISOString()
}

/** 슬랙 메시지 permalink URL 생성 */
export function buildSourceRef(channelId: string, ts: string): string {
  const pTs = ts.replace('.', '')
  return `https://${WORKSPACE_DOMAIN}.slack.com/archives/${channelId}/p${pTs}`
}

/** JSON 문자열 내부 리터럴 줄바꿈/탭 이스케이프 */
function repairJson(raw: string): string {
  let inString = false
  let escape = false
  let result = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (escape) { result += ch; escape = false; continue }
    if (ch === '\\') { escape = true; result += ch; continue }
    if (ch === '"') { inString = !inString; result += ch; continue }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') { result += '\\r'; continue }
      if (ch === '\t') { result += '\\t'; continue }
    }
    result += ch
  }
  return result
}

export function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── 브랜드 매칭 (코드 기반) ───────────────────────────────────────

/**
 * 채널명 → 클라이언트 ID 매칭
 * 우선순위: channels 배열 → keywords 본문 매칭
 */
export function matchBrand(
  channel: string,
  text: string,
  clients: DbClient[],
): string | null {
  // 1. clients.channels에 현재 채널명 포함 → 확정
  for (const c of clients) {
    if (c.channels?.includes(channel)) return c.id
  }
  // 2. 본문에서 keywords 매칭
  const lower = text.toLowerCase()
  for (const c of clients) {
    if (c.keywords?.some(kw => kw && lower.includes(kw.toLowerCase()))) return c.id
  }
  return null
}

// ── 클라이언트 조회 ───────────────────────────────────────────────

export async function fetchClientsForWorkspace(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<DbClient[]> {
  const { data, error } = await sb
    .from('clients')
    .select('id, name, keywords, channels')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return (data ?? []) as DbClient[]
}

// ── AI 분류 ──────────────────────────────────────────────────────

/**
 * raw_json 1건을 Claude Haiku로 분류.
 * 노이즈(잡담/봇/단순인사)면 null 반환.
 */
export async function classifyMessage(
  raw: RawJson,
  clientId: string | null,
  clients: DbClient[],
): Promise<ClassifyResult | null> {
  const clientName = clientId
    ? (clients.find(c => c.id === clientId)?.name ?? '미분류')
    : '미분류'

  const fullText = [
    `채널: #${raw.channel}`,
    `작성자: ${raw.user_name || raw.user}`,
    `내용: ${raw.text}`,
    ...(raw.replies.length > 0 ? [
      '--- 스레드 답글 ---',
      ...raw.replies.map(r => `${r.user_name || r.user}: ${r.text}`),
    ] : []),
  ].join('\n')

  const prompt = `슬랙 메시지를 분류하세요.

${fullText}

매칭된 브랜드: ${clientName}
멘션 감지 ID: ${MENTION_USER_ID} (이 ID가 메시지/답글에 포함되면 mention 태그 추가)

다음 기준으로 분류하고 JSON만 반환하세요:

제외 기준 (skip: true):
- 단순 인사/이모지/잡담, 채널 입장·퇴장, 단순 근태(반차/연차), "넵"/"확인" 단독 답변

태그 (해당하는 것만, 복수 가능):
- issue: 버그/오류/CS/장애
- decision: 정책/계약/방향 확정
- mention: ${MENTION_USER_ID} 멘션 포함
- in_progress: 미해결 이슈/검토/협의중
- done: 명시적 완료 표현
- schedule: 미팅/배포 일정 확정

중요도:
- high: 운영장애/CS다발/계약/긴급
- medium: 일반 이슈/정책변경/프로젝트 진행 (기본값)
- low: 단순공유/완료보고/일정조율

{
  "skip": false,
  "tags": [],
  "priority": "medium",
  "title": "30자 이내",
  "body": "• 맥락(날짜·대상)\n• 무슨 일이 있었는지\n• 액션/결과",
  "author": "이름만"
}`

  let msg: Awaited<ReturnType<typeof anthropic.messages.create>> | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      })
      break
    } catch (e: unknown) {
      const status = (e as { status?: number }).status
      if (status === 529 && attempt < 3) { await delay(5000 * attempt); continue }
      throw e
    }
  }
  if (!msg) return null

  const rawText = (msg.content[0] as { type: string; text: string }).text.trim()
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(repairJson(match[0]))
  } catch {
    return null
  }

  if (parsed.skip === true) return null

  return {
    tags:     Array.isArray(parsed.tags) ? parsed.tags as string[] : [],
    priority: (['high', 'medium', 'low'].includes(parsed.priority as string)
                ? parsed.priority as 'high' | 'medium' | 'low'
                : 'medium'),
    title:    typeof parsed.title === 'string' ? parsed.title.slice(0, 60) : '',
    body:     typeof parsed.body  === 'string' ? parsed.body  : '',
    author:   typeof parsed.author === 'string' ? parsed.author : '',
  }
}
