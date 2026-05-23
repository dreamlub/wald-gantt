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
import type { WebClient } from '@slack/web-api'

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

export interface BrandMapping {
  channel_id: string
  brand_name: string | null
  excluded: boolean
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

/**
 * AI 분류 전 명백한 노이즈 사전 필터
 * - 스레드가 있으면 항상 false (답글에 의미 있을 수 있음)
 * - 빈 텍스트, 한 단어 답변, 이모지 only는 true
 */
export function isObviousNoise(rj: RawJson): boolean {
  if (rj.replies.length > 0) return false

  const text = rj.text.trim()
  if (text === '') return true

  // 한 단어/짧은 한국어·영어 답변
  const SHORT_ANSWER = /^(네+|넵+|넹+|ㅇㅋ+|확인|확인했어요|좋아요|좋습니다|감사|감사합니다|굿|good|ok|okay|thanks?|thx|\^\^|ㅎㅎ+|ㅋㅋ+|👍|🙏|💯)[.!?]*$/i
  if (SHORT_ANSWER.test(text)) return true

  // Slack 이모지 코드 또는 유니코드 이모지만 있는 경우
  const EMOJI_ONLY = /^(\s*(:[\w+-]+:|[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}])\s*)+$/u
  if (EMOJI_ONLY.test(text)) return true

  return false
}

export function getReplySourceIds(rawMessages: RawJson[]): string[] {
  const ids = new Set<string>()
  for (const raw of rawMessages) {
    for (const reply of raw.replies) {
      if (reply.ts && reply.ts !== raw.ts) ids.add(reply.ts)
    }
  }
  return [...ids]
}

export async function softDeleteReplyHistoryRows(
  sb: SupabaseClient,
  workspaceId: string,
  replySourceIds: string[],
): Promise<number> {
  const uniqueIds = [...new Set(replySourceIds)].filter(Boolean)
  if (uniqueIds.length === 0) return 0

  const { data, error } = await sb
    .from('client_history')
    .update({ deleted_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .in('source_id', uniqueIds)
    .is('deleted_at', null)
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}

// ── 브랜드 매칭 ──────────────────────────────────────────────────

/** 채널 ID → 브랜드명 매핑. brand_name이 없으면 fallback(미분류) 사용. */
export function matchBrand(
  channelId: string,
  brandMappings: BrandMapping[],
): string | null {
  const mapping = brandMappings.find(m => m.channel_id === channelId)
  return mapping?.brand_name ?? null
}

export async function fetchBrandMappings(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<BrandMapping[]> {
  const { data, error } = await sb
    .from('slack_channel_mappings')
    .select('channel_id, brand_name, excluded')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return (data ?? []) as BrandMapping[]
}

export function getExcludedChannelIds(mappings: BrandMapping[]): Set<string> {
  return new Set(mappings.filter(m => m.excluded).map(m => m.channel_id))
}

// ── 사용자 디렉토리 (Slack users.list) ─────────────────────────

export type UserDirectory = Map<string, string>

/**
 * Slack 워크스페이스 전체 사용자 ID → 표시 이름 매핑.
 * 우선순위: profile.display_name > profile.real_name > name > user_id
 *
 * 필요 scope: users:read
 * 실패 시(missing_scope 등) 빈 Map 반환 — 호출자는 fallback 동작 유지.
 */
export async function fetchUserDirectory(slack: WebClient): Promise<UserDirectory> {
  const map: UserDirectory = new Map()
  let cursor: string | undefined
  let safety = 0
  try {
    do {
      const res = await slack.users.list({ limit: 200, cursor })
      if (!res.ok || !res.members) break
      for (const m of res.members) {
        const u = m as {
          id?: string
          name?: string
          deleted?: boolean
          profile?: { display_name?: string; real_name?: string }
        }
        if (!u.id || u.deleted) continue
        const display = (u.profile?.display_name ?? '').trim()
        const real = (u.profile?.real_name ?? '').trim()
        const name = display || real || u.name || u.id
        map.set(u.id, name)
      }
      cursor = res.response_metadata?.next_cursor || undefined
      safety++
      if (cursor) await delay(300)
    } while (cursor && safety < 20)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[slack/users.list] 디렉토리 fetch 실패 (scope 부족 가능 — users:read 필요): ${msg}`)
    return new Map()
  }
  return map
}

/** user_id → 표시 이름. 디렉토리에 없으면 fallback chain. */
export function resolveUserName(
  dir: UserDirectory,
  userId: string | undefined | null,
  fallback?: string | null,
): string {
  if (userId && dir.has(userId)) return dir.get(userId)!
  return (fallback ?? '').trim() || userId || ''
}

const USER_ID_RE = /^U[A-Z0-9]{8,}$/

export function resolveChannelName(dir: UserDirectory, name: string): string {
  if (USER_ID_RE.test(name)) {
    const resolved = dir.get(name)
    if (resolved) return `${resolved} (DM)`
  }
  return name
}

// ── AI 분류 ──────────────────────────────────────────────────────

/**
 * raw_json 1건을 Claude Haiku로 분류.
 * 노이즈(잡담/봇/단순인사)면 null 반환.
 */
export async function classifyMessage(
  raw: RawJson,
  brandName: string,
): Promise<ClassifyResult | null> {
  const clientName = brandName || '미분류'

  const fullText = [
    `채널: #${raw.channel}`,
    `작성자: ${raw.user_name || raw.user}`,
    `내용: ${raw.text}`,
    ...(raw.replies.length > 0 ? [
      '--- 스레드 답글 ---',
      ...raw.replies.map(r => `${r.user_name || r.user}: ${r.text}`),
    ] : []),
  ].join('\n')

  const isDmChannel = /^[UW][A-Z0-9]{8,}$/.test(raw.channel)

  const prompt = `슬랙 메시지를 분류하세요.

${fullText}

브랜드: ${clientName}${isDmChannel ? '\n채널 유형: DM (업무 관련 가능성 높음)' : ''}

제외 (skip: true):
- 봇/자동화/캘린더 알림, 채널 입퇴장
- 단순 인사/이모지/잡담, "넵"/"확인" 단독 답변

태그 (해당하는 것만, 복수 가능):
- issue: 버그/오류/CS/장애/문의
- decision: 정책/계약/방향 확정
- schedule: 미팅/배포/오픈 일정 + 구체적 날짜

중요도:
- high: 운영장애/CS다발/계약/긴급
- medium: 일반 이슈/프로젝트 진행 (기본값)
- low: 단순공유/완료보고/일정조율

{"skip":false,"tags":[],"priority":"medium","title":"30자 이내","body":"• **배경**: 어떤 상황인지\\n• **경과**: 어떻게 진행되었는지\\n• **조치/결과**: 어떤 액션이 필요하거나 결론이 났는지\\n(해당 단계가 없으면 생략. 중요 키워드는 **볼드**로 표기)","author":"작성자 이름"}`

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
  console.log(`[classify] channel=${raw.channel} ts=${raw.ts} response=${rawText.slice(0, 200)}`)

  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) {
    console.log(`[classify] JSON 파싱 실패 (no match): ${rawText.slice(0, 100)}`)
    return null
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(repairJson(match[0]))
  } catch (e) {
    console.log(`[classify] JSON.parse 실패: ${e}`)
    return null
  }

  console.log(`[classify] skip=${parsed.skip} tags=${JSON.stringify(parsed.tags)} title=${parsed.title}`)
  if (parsed.skip === true) return null

  const tags = Array.isArray(parsed.tags) ? parsed.tags as string[] : []
  const allText = raw.text + ' ' + raw.replies.map(r => r.text).join(' ')
  if (allText.includes(`<@${MENTION_USER_ID}>`) && !tags.includes('mention')) {
    tags.push('mention')
  }

  return {
    tags,
    priority: (['high', 'medium', 'low'].includes(parsed.priority as string)
                ? parsed.priority as 'high' | 'medium' | 'low'
                : 'medium'),
    title:    typeof parsed.title === 'string' ? parsed.title.slice(0, 60) : '',
    body:     typeof parsed.body  === 'string' ? parsed.body  : '',
    author:   typeof parsed.author === 'string' ? parsed.author : '',
  }
}
