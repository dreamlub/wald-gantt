import { describe, expect, it } from 'vitest'
import {
  kstDate, kstParts, addDaysYMD, addMonthsYMD, kstDateRange,
  kstDayStart, kstDayEnd, kstDayRange,
} from './kst'

describe('kstDate', () => {
  it('converts a UTC instant to the KST calendar date (UTC+9)', () => {
    // 2026-01-06 15:00Z == 2026-01-07 00:00 KST
    expect(kstDate('2026-01-06T15:00:00.000Z')).toBe('2026-01-07')
    expect(kstDate('2026-01-07T14:59:59.000Z')).toBe('2026-01-07')
    expect(kstDate('2026-01-07T15:00:00.000Z')).toBe('2026-01-08')
  })

  it('accepts a Date object', () => {
    expect(kstDate(new Date('2026-05-28T23:00:00.000Z'))).toBe('2026-05-29')
  })
})

describe('kstParts', () => {
  it('returns KST date components with weekday (0=Sun)', () => {
    // 2026-05-29 is a Friday in KST
    const p = kstParts('2026-05-29T01:00:00.000Z')
    expect(p).toMatchObject({ ymd: '2026-05-29', year: 2026, month: 5, day: 29, dow: 5 })
  })

  it('rolls into the next KST day for late-UTC instants', () => {
    // 2026-05-29 16:00Z == 2026-05-30 01:00 KST (Saturday)
    expect(kstParts('2026-05-29T16:00:00.000Z')).toMatchObject({ ymd: '2026-05-30', dow: 6 })
  })
})

describe('addDaysYMD', () => {
  it('adds and subtracts days across month/year boundaries', () => {
    expect(addDaysYMD('2026-05-29', 1)).toBe('2026-05-30')
    expect(addDaysYMD('2026-05-25', -7)).toBe('2026-05-18')
    expect(addDaysYMD('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysYMD('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('addMonthsYMD', () => {
  it('shifts months across year boundaries', () => {
    expect(addMonthsYMD('2026-05-15', 1)).toBe('2026-06-15')
    expect(addMonthsYMD('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonthsYMD('2026-06-15', 12)).toBe('2027-06-15')
  })
})

describe('kstDateRange', () => {
  it('lists inclusive date strings', () => {
    expect(kstDateRange('2026-05-29', '2026-06-01')).toEqual([
      '2026-05-29', '2026-05-30', '2026-05-31', '2026-06-01',
    ])
  })
  it('returns a single date when from === to', () => {
    expect(kstDateRange('2026-05-29', '2026-05-29')).toEqual(['2026-05-29'])
  })
})

describe('day boundaries', () => {
  it('builds KST day start/end as +09:00 literals', () => {
    expect(kstDayStart('2026-05-29')).toBe('2026-05-29T00:00:00+09:00')
    expect(kstDayEnd('2026-05-29')).toBe('2026-05-29T23:59:59.999+09:00')
  })

  it('kstDayRange is a half-open [start, nextStart) interval', () => {
    expect(kstDayRange('2026-05-29')).toEqual({
      gte: '2026-05-29T00:00:00+09:00',
      lt: '2026-05-30T00:00:00+09:00',
    })
  })
})
