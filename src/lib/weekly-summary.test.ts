import { describe, it, expect } from 'vitest'
import { validateWeeklySummary, isValidWeeklySummary } from './weekly-summary'

describe('validateWeeklySummary', () => {
  const valid = {
    summary: '이번 주 요약',
    items: [
      { type: 'issue', title: '결제 오류', detail: '...', date: null, brand: '매머드커피' },
      { type: 'plan', title: '오픈 준비', detail: '', date: null, brand: null },
    ],
  }

  it('정상 구조를 통과시킨다', () => {
    expect(validateWeeklySummary(valid).valid).toBe(true)
    expect(isValidWeeklySummary(valid)).toBe(true)
  })

  it('빈 items 배열 + summary 문자열은 유효(조용한 주)', () => {
    expect(validateWeeklySummary({ summary: '특이사항 없음', items: [] }).valid).toBe(true)
  })

  it('null/비객체/배열을 거부한다', () => {
    expect(validateWeeklySummary(null).valid).toBe(false)
    expect(validateWeeklySummary('x').valid).toBe(false)
    expect(validateWeeklySummary([]).valid).toBe(false)
  })

  it('items가 배열이 아니면 거부', () => {
    expect(validateWeeklySummary({ summary: 'x', items: {} }).valid).toBe(false)
  })

  it('summary 문자열이 없으면 거부', () => {
    expect(validateWeeklySummary({ items: [] }).valid).toBe(false)
  })

  it('item에 title이 없거나 type이 잘못되면 거부', () => {
    expect(validateWeeklySummary({ summary: 'x', items: [{ type: 'issue', title: '' }] }).valid).toBe(false)
    expect(validateWeeklySummary({ summary: 'x', items: [{ type: 'bogus', title: 'a' }] }).valid).toBe(false)
  })
})
