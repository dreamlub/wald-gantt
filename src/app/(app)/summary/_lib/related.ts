import type { HistoryItem } from './types'

const DEFAULT_WINDOW_MINUTES = 30

/**
 * 같은 채널에서 시간적으로 인접한 다른 항목 찾기.
 * Slack 스레드 미사용 시(예: ext-snowflake-etl 같은 채널) 본문이
 * 여러 행으로 흩어진 경우, 사용자가 burst 대화를 함께 볼 수 있게 해줌.
 */
export function findRelatedItems(
  current: HistoryItem,
  all: HistoryItem[],
  windowMinutes: number = DEFAULT_WINDOW_MINUTES,
): HistoryItem[] {
  const currentMs = new Date(current.occurred_at).getTime()
  const windowMs = windowMinutes * 60 * 1000

  return all
    .filter(h =>
      h.id !== current.id &&
      h.channel === current.channel &&
      Math.abs(new Date(h.occurred_at).getTime() - currentMs) <= windowMs
    )
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
}

export interface BurstGroup {
  representative: HistoryItem   // 그룹의 첫(시간상 가장 빠른) 메시지
  members: HistoryItem[]        // 자기 포함, 시간 오름차순
}

/**
 * 같은 채널에서 sliding window(±N분)로 연쇄된 메시지를 한 그룹으로 묶음.
 * 그룹의 "대표"는 시간상 가장 빠른 메시지. 나머지는 디테일에서 하위 멤버로 표시.
 * 결과 그룹은 대표 occurred_at 내림차순 (최신이 위).
 */
export function groupByBurst(
  items: HistoryItem[],
  windowMinutes: number = DEFAULT_WINDOW_MINUTES,
): BurstGroup[] {
  // 시간 오름차순 정렬
  const sorted = [...items].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  const windowMs = windowMinutes * 60 * 1000
  const groupOf = new Map<string, string>() // id → repId
  const groups = new Map<string, HistoryItem[]>()

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    const curMs = new Date(cur.occurred_at).getTime()
    let myRep: string | null = null

    // 시간상 가까운 같은 채널 이전 메시지를 찾아 그 그룹에 합류
    for (let j = i - 1; j >= 0; j--) {
      const prev = sorted[j]
      const diff = curMs - new Date(prev.occurred_at).getTime()
      if (diff > windowMs) break // 정렬되어 있으니 더 이전은 더 멀어짐
      if (prev.channel === cur.channel) {
        myRep = groupOf.get(prev.id) ?? prev.id
        break
      }
    }
    if (!myRep) myRep = cur.id

    groupOf.set(cur.id, myRep)
    if (!groups.has(myRep)) groups.set(myRep, [])
    groups.get(myRep)!.push(cur)
  }

  const result: BurstGroup[] = []
  for (const [repId, members] of groups) {
    const rep = members.find(m => m.id === repId) ?? members[0]
    result.push({ representative: rep, members })
  }
  result.sort((a, b) => b.representative.occurred_at.localeCompare(a.representative.occurred_at))
  return result
}
