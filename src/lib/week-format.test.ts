import { describe, it, expect } from 'vitest'
import { isoWeek, weekRangeLabel } from './week-format'

describe('week-format', () => {
  it('isoWeek는 ISO 주차 번호를 반환한다', () => {
    // 2026-05-25(월)~05-29(금)은 ISO 22주차
    expect(isoWeek('2026-05-25')).toBe(22)
  })

  it('weekRangeLabel은 "M/D ~ M/D (YYYY년 W{n})" 형식 (W는 항상 앞)', () => {
    expect(weekRangeLabel('2026-05-25', '2026-05-29')).toBe('5/25 ~ 5/29 (2026년 W22)')
  })

  it('연도는 종료일 기준으로 표기한다', () => {
    // 2025-12-29(월)~2026-01-04(일): 끝나는 해(2026) 표기
    expect(weekRangeLabel('2025-12-29', '2026-01-04')).toContain('2026년')
  })
})
