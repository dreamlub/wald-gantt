import { describe, expect, it } from 'vitest'
import {
  autoSchedule, subtractIntervals, parseHHMM, formatHHMM,
  type SchedulableTask, type WorkHoursConfig, type BusyInterval,
} from './auto-schedule'

/* ── 헬퍼 ── */

// 2026-06-01 = 월요일 … 2026-06-07 = 일요일
const MON = '2026-06-01'
const TUE = '2026-06-02'
const WED = '2026-06-03'
const SAT = '2026-06-06'
const SUN = '2026-06-07'
const WEEK = [MON, TUE, WED, '2026-06-04', '2026-06-05', SAT, SUN]

// 평일 10:00~18:00, 주말 휴무
const WEEKDAY_9TO6: WorkHoursConfig = {
  0: null,
  1: { start: 600, end: 1080 },
  2: { start: 600, end: 1080 },
  3: { start: 600, end: 1080 },
  4: { start: 600, end: 1080 },
  5: { start: 600, end: 1080 },
  6: null,
}

function task(overrides: Partial<SchedulableTask> & { id: string }): SchedulableTask {
  return {
    durationMin: 60,
    dueDate: null,
    startDate: null,
    priority: 2,
    ...overrides,
  }
}

/* ── parseHHMM / formatHHMM ── */

describe('parseHHMM', () => {
  it('parses valid times', () => {
    expect(parseHHMM('10:00')).toBe(600)
    expect(parseHHMM('00:00')).toBe(0)
    expect(parseHHMM('23:59')).toBe(1439)
    expect(parseHHMM(' 9:30 ')).toBe(570)
  })
  it('rejects invalid times', () => {
    expect(parseHHMM('24:00')).toBeNull()
    expect(parseHHMM('10:60')).toBeNull()
    expect(parseHHMM('abc')).toBeNull()
    expect(parseHHMM('1000')).toBeNull()
  })
})

describe('formatHHMM', () => {
  it('round-trips with parseHHMM', () => {
    for (const t of ['00:00', '09:30', '13:00', '23:59']) {
      expect(formatHHMM(parseHHMM(t)!)).toBe(t)
    }
  })
})

/* ── subtractIntervals ── */

describe('subtractIntervals', () => {
  it('returns whole window when no blocks', () => {
    expect(subtractIntervals({ start: 600, end: 1080 }, [])).toEqual([{ start: 600, end: 1080 }])
  })
  it('removes a middle block', () => {
    expect(subtractIntervals({ start: 600, end: 1080 }, [{ start: 720, end: 780 }]))
      .toEqual([{ start: 600, end: 720 }, { start: 780, end: 1080 }])
  })
  it('merges overlapping blocks', () => {
    expect(subtractIntervals({ start: 600, end: 1080 }, [
      { start: 700, end: 800 },
      { start: 750, end: 850 },
    ])).toEqual([{ start: 600, end: 700 }, { start: 850, end: 1080 }])
  })
  it('clips blocks to the window', () => {
    expect(subtractIntervals({ start: 600, end: 1080 }, [
      { start: 0, end: 660 },
      { start: 1020, end: 1440 },
    ])).toEqual([{ start: 660, end: 1020 }])
  })
  it('returns empty when fully covered', () => {
    expect(subtractIntervals({ start: 600, end: 1080 }, [{ start: 500, end: 1200 }])).toEqual([])
  })
})

/* ── autoSchedule: 기본 배치 ── */

describe('autoSchedule — 기본', () => {
  it('빈 주에 첫 슬롯부터 채운다', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'a' }), task({ id: 'b' })],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.unplaced).toEqual([])
    expect(res.placements).toEqual([
      { taskId: 'a', date: MON, start: 600, durationMin: 60 },
      { taskId: 'b', date: MON, start: 660, durationMin: 60 },
    ])
  })

  it('기존 점유 구간을 피해 배치한다', () => {
    const busy: BusyInterval[] = [{ date: MON, start: 600, end: 720 }] // 10~12시 점유
    const res = autoSchedule({
      tasks: [task({ id: 'a' })],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
      busy,
    })
    expect(res.placements).toEqual([{ taskId: 'a', date: MON, start: 720, durationMin: 60 }])
  })

  it('점심시간(break)을 건너뛴다', () => {
    const res = autoSchedule({
      tasks: [
        task({ id: 'a', durationMin: 120 }), // 10~12
        task({ id: 'b', durationMin: 60 }),  // 12~13은 점심 → 13~14
      ],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
      breaks: [{ start: 720, end: 780 }], // 12~13시 점심
    })
    expect(res.placements).toEqual([
      { taskId: 'a', date: MON, start: 600, durationMin: 120 },
      { taskId: 'b', date: MON, start: 780, durationMin: 60 },
    ])
  })

  it('하루가 꽉 차면 다음 업무일로 넘어간다', () => {
    // 월요일 10~18 = 480분. 240분짜리 2개 = 꽉 참. 3번째는 화요일로.
    const res = autoSchedule({
      tasks: [
        task({ id: 'a', durationMin: 240 }),
        task({ id: 'b', durationMin: 240 }),
        task({ id: 'c', durationMin: 60 }),
      ],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements).toEqual([
      { taskId: 'a', date: MON, start: 600, durationMin: 240 },
      { taskId: 'b', date: MON, start: 840, durationMin: 240 },
      { taskId: 'c', date: TUE, start: 600, durationMin: 60 },
    ])
  })

  it('주말(휴무)은 건너뛴다', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'a' })],
      days: [SAT, SUN, MON],
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements).toEqual([{ taskId: 'a', date: MON, start: 600, durationMin: 60 }])
  })
})

/* ── autoSchedule: 정렬 ── */

describe('autoSchedule — 정렬 (마감 → 우선순위)', () => {
  it('마감 임박 태스크가 먼저 배치된다', () => {
    const res = autoSchedule({
      tasks: [
        task({ id: 'late', dueDate: WED }),
        task({ id: 'soon', dueDate: MON }),
      ],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements[0].taskId).toBe('soon')
    expect(res.placements[1].taskId).toBe('late')
  })

  it('마감이 같으면 우선순위 높은(숫자 큰) 태스크가 먼저', () => {
    const res = autoSchedule({
      tasks: [
        task({ id: 'low', dueDate: MON, priority: 1 }),
        task({ id: 'high', dueDate: MON, priority: 3 }),
      ],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements[0].taskId).toBe('high')
  })

  it('마감 있는 태스크가 마감 없는 태스크보다 먼저', () => {
    const res = autoSchedule({
      tasks: [
        task({ id: 'none' }),
        task({ id: 'has', dueDate: TUE }),
      ],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements[0].taskId).toBe('has')
  })
})

/* ── autoSchedule: 마감·시작일 제약 ── */

describe('autoSchedule — 제약', () => {
  it('마감일 전에 슬롯이 부족하면 past-deadline', () => {
    // 둘 다 월요일 마감. 월요일은 480분뿐. a(300) 배치 후 b(300)는 안 들어감.
    const res = autoSchedule({
      tasks: [
        task({ id: 'a', durationMin: 300, dueDate: MON, priority: 3 }),
        task({ id: 'b', durationMin: 300, dueDate: MON, priority: 1 }),
      ],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements).toEqual([{ taskId: 'a', date: MON, start: 600, durationMin: 300 }])
    expect(res.unplaced).toEqual([{ taskId: 'b', reason: 'past-deadline' }])
  })

  it('마감 전 슬롯이 없으면 past-deadline', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'x', durationMin: 60, dueDate: MON, startDate: TUE })],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    // 시작일(화) > 마감일(월) → 배치 불가
    expect(res.placements).toEqual([])
    expect(res.unplaced).toEqual([{ taskId: 'x', reason: 'past-deadline' }])
  })

  it('시작일 이전에는 배치하지 않는다', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'x', startDate: WED })],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements[0].date).toBe(WED)
  })

  it('소요시간 0/음수는 invalid-duration', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'zero', durationMin: 0 }), task({ id: 'neg', durationMin: -30 })],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements).toEqual([])
    expect(res.unplaced).toEqual([
      { taskId: 'zero', reason: 'invalid-duration' },
      { taskId: 'neg', reason: 'invalid-duration' },
    ])
  })

  it('어떤 날에도 안 맞으면 no-slot', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'big', durationMin: 600 })], // 600분 > 하루 480분
      days: WEEK,
      workHours: WEEKDAY_9TO6,
    })
    expect(res.placements).toEqual([])
    expect(res.unplaced).toEqual([{ taskId: 'big', reason: 'no-slot' }])
  })
})

/* ── autoSchedule: 현재시각(now) ── */

describe('autoSchedule — now (과거 슬롯 제외)', () => {
  it('오늘은 현재 시각 이후로만 배치한다', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'a' })],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
      now: { date: MON, minute: 660 }, // 11:00 → 스냅 후 11:00부터
    })
    expect(res.placements).toEqual([{ taskId: 'a', date: MON, start: 660, durationMin: 60 }])
  })

  it('현재 시각이 업무 종료 이후면 그날을 건너뛴다', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'a' })],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
      now: { date: MON, minute: 1200 }, // 20:00, 업무종료 18:00 이후
    })
    expect(res.placements[0].date).toBe(TUE)
  })

  it('현재 시각이 30분 경계 밖이면 다음 스냅으로 올림', () => {
    const res = autoSchedule({
      tasks: [task({ id: 'a' })],
      days: WEEK,
      workHours: WEEKDAY_9TO6,
      now: { date: MON, minute: 615 }, // 10:15 → 10:30으로 스냅
    })
    expect(res.placements).toEqual([{ taskId: 'a', date: MON, start: 630, durationMin: 60 }])
  })
})
