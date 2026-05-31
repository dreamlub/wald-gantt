import { describe, it, expect, vi } from 'vitest'
import { getWeeklyReports, getWeeklyInsight } from './weekly-service'

type Row = Record<string, unknown>

// weekly_reports/weekly_insights 조회가 workspace_id로 격리되는지 검증한다.
// (RLS에만 의존하지 않고 명시 필터를 거는 회귀 방지)
function makeClient(rows: Row[]) {
  const eqCalls: [string, unknown][] = []
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'gte', 'lte', 'order']
  for (const m of methods) chain[m] = vi.fn(() => chain)
  chain.eq = vi.fn((col: string, val: unknown) => { eqCalls.push([col, val]); return chain })
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null }))
  ;(chain as { then: unknown }).then = (resolve: (v: { data: Row[]; error: null }) => void) =>
    resolve({ data: rows, error: null })

  // workspace_members 조회용 별도 체인 (getWorkspaceId 내부)
  const memberChain: Record<string, unknown> = {}
  memberChain.select = vi.fn(() => memberChain)
  memberChain.eq = vi.fn(() => memberChain)
  memberChain.single = vi.fn(() => Promise.resolve({ data: { workspace_id: 'ws-1' }, error: null }))

  const from = vi.fn((table: string) =>
    table === 'workspace_members' ? memberChain : chain
  )
  const auth = { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u-1' } } })) }
  return { client: { from, auth }, eqCalls }
}

describe('weekly-service workspace 격리', () => {
  it('getWeeklyReports는 workspace_id로 필터한다', async () => {
    const { client, eqCalls } = makeClient([])
    await getWeeklyReports('2026-05-25', client as unknown as Parameters<typeof getWeeklyReports>[1])
    expect(eqCalls).toContainEqual(['workspace_id', 'ws-1'])
  })

  it('getWeeklyInsight는 workspace_id로 필터한다', async () => {
    const { client, eqCalls } = makeClient([])
    await getWeeklyInsight('2026-05-25', client as unknown as Parameters<typeof getWeeklyInsight>[1])
    expect(eqCalls).toContainEqual(['workspace_id', 'ws-1'])
  })
})
