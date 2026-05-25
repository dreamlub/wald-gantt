import { describe, expect, it } from 'vitest'
import { parseHistoryLimit, parseHistoryPageParams, parseHistoryTags } from './history-route-utils'

describe('history route query parsing', () => {
  it('parses tags while trimming empty values', () => {
    expect(parseHistoryTags('issue, mention,,schedule ')).toEqual(['issue', 'mention', 'schedule'])
    expect(parseHistoryTags(' , ')).toBeUndefined()
  })

  it('parses valid numeric limits only', () => {
    expect(parseHistoryLimit('75')).toBe(75)
    expect(parseHistoryLimit('abc')).toBeUndefined()
    expect(parseHistoryLimit(null)).toBeUndefined()
  })

  it('builds listHistoryPage params from URLSearchParams', () => {
    const params = parseHistoryPageParams(new URLSearchParams({
      from: '2026-01-01',
      to: '2026-01-31',
      brand: '브랜드A',
      priority: 'high',
      tags: 'issue,decision',
      author: '민수',
      q: '승인',
      cursor: '2026-01-01T00:00:00.000Z|id',
      limit: '25',
    }))

    expect(params).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      brand: '브랜드A',
      priority: 'high',
      tags: ['issue', 'decision'],
      author: '민수',
      q: '승인',
      cursor: '2026-01-01T00:00:00.000Z|id',
      limit: 25,
    })
  })
})
