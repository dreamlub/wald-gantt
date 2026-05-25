import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '@/app/(app)/summary/_lib/types'
import { filterHistoryItems, kstDayEnd, kstDayStart, matchesAllTags, toKSTDate } from './history-query-utils'

function item(overrides: Partial<HistoryItem>): HistoryItem {
  return {
    id: 'id',
    brand_name: '브랜드A',
    type: 'slack',
    tags: [],
    channel: 'general',
    source_id: null,
    source_ref: null,
    title: '기본 제목',
    body: null,
    occurred_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    status: null,
    status_kind: null,
    priority: null,
    author: null,
    raw_message_id: null,
    thread_count: 0,
    ...overrides,
  }
}

describe('history query date helpers', () => {
  it('builds KST day boundaries while keeping occurred_at stored as UTC-compatible input', () => {
    expect(kstDayStart('2026-01-07')).toBe('2026-01-07T00:00:00+09:00')
    expect(kstDayEnd('2026-01-07')).toBe('2026-01-07T23:59:59+09:00')
  })

  it('converts UTC timestamps to KST date before slicing', () => {
    expect(toKSTDate('2026-01-06T15:00:00.000Z')).toBe('2026-01-07')
    expect(toKSTDate('2026-01-07T14:59:59.000Z')).toBe('2026-01-07')
    expect(toKSTDate('2026-01-07T15:00:00.000Z')).toBe('2026-01-08')
  })
})

describe('filterHistoryItems', () => {
  it('filters dates by KST date, not browser local or raw UTC date', () => {
    const rows = [
      item({ id: 'prev', occurred_at: '2026-01-06T14:59:59.000Z' }),
      item({ id: 'in', occurred_at: '2026-01-06T15:00:00.000Z' }),
      item({ id: 'next', occurred_at: '2026-01-07T15:00:00.000Z' }),
    ]

    const result = filterHistoryItems(rows, {
      dateFrom: '2026-01-07',
      dateTo: '2026-01-07',
      selectedTags: new Set(),
      brandId: 'all',
      priorityKey: 'all',
      authorKey: 'all',
      searchQuery: '',
    })

    expect(result.map(r => r.id)).toEqual(['in'])
  })

  it('requires all selected tags', () => {
    expect(matchesAllTags(['issue', 'mention'], ['issue', 'mention'])).toBe(true)
    expect(matchesAllTags(['issue'], ['issue', 'mention'])).toBe(false)
  })

  it('filters by brand, priority, author, and search text together', () => {
    const rows = [
      item({ id: 'match', brand_name: 'A', priority: 'high', author: '민수', title: '긴급 승인 요청' }),
      item({ id: 'brand', brand_name: 'B', priority: 'high', author: '민수', title: '긴급 승인 요청' }),
      item({ id: 'priority', brand_name: 'A', priority: 'low', author: '민수', title: '긴급 승인 요청' }),
      item({ id: 'author', brand_name: 'A', priority: 'high', author: '지현', title: '긴급 승인 요청' }),
      item({ id: 'search', brand_name: 'A', priority: 'high', author: '민수', title: '다른 내용' }),
    ]

    const result = filterHistoryItems(rows, {
      dateFrom: '',
      dateTo: '',
      selectedTags: new Set(),
      brandId: 'A',
      priorityKey: 'high',
      authorKey: '민수',
      searchQuery: '승인',
    })

    expect(result.map(r => r.id)).toEqual(['match'])
  })
})
