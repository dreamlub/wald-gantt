import { describe, it, expect } from 'vitest'
import { STATUS_COLOR, STATUS_BG_COLOR, STATUS_LABEL, STATUS_GROUPS, PROJECT_COLORS, ASSIGNEE_COLORS } from './_constants'
import type { TaskStatus } from '@/types'

const ALL_STATUSES: TaskStatus[] = ['backlog', 'to-do', 'in-progress', 'done', 'pending']

describe('STATUS_COLOR / STATUS_BG_COLOR', () => {
  // 회귀: 2026-05-16 디자인 토큰 마이그레이션 때 STATUS_COLOR가 hex(#xxx) → CSS var(var(--...))로
  // 바뀌었는데, GanttView.tsx에서 `statusColor + 'bb'`로 hex alpha 합치는 코드가 남아 막대 색이 사라짐.
  // 이 테스트는 두 맵의 값이 모두 CSS var() 형태임을 보장 — 호출부가 hex 가정 안 하도록 강제.
  it('STATUS_COLOR 모든 값이 CSS var() 형태', () => {
    for (const s of ALL_STATUSES) {
      const v = STATUS_COLOR[s]
      expect(v, `STATUS_COLOR[${s}]는 var()로 시작해야 함 — 호출부가 hex+alpha 가정하면 깨짐`).toMatch(/^var\(--/)
    }
  })

  it('STATUS_BG_COLOR 모든 값이 CSS var() 형태', () => {
    for (const s of ALL_STATUSES) {
      const v = STATUS_BG_COLOR[s]
      expect(v).toMatch(/^var\(--/)
    }
  })

  it('STATUS_COLOR/BG/LABEL 키가 모든 TaskStatus를 커버', () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_COLOR).toHaveProperty(s)
      expect(STATUS_BG_COLOR).toHaveProperty(s)
      expect(STATUS_LABEL).toHaveProperty(s)
    }
  })

  it('STATUS_GROUPS color/bgColor가 STATUS_COLOR/BG와 일치', () => {
    for (const g of STATUS_GROUPS) {
      expect(g.color).toBe(STATUS_COLOR[g.status])
      expect(g.bgColor).toBe(STATUS_BG_COLOR[g.status])
    }
  })
})

describe('식별 컬러 팔레트', () => {
  it('PROJECT_COLORS 비어있지 않고 모두 CSS var()', () => {
    expect(PROJECT_COLORS.length).toBeGreaterThan(0)
    for (const c of PROJECT_COLORS) expect(c).toMatch(/^var\(--/)
  })

  it('ASSIGNEE_COLORS 비어있지 않고 모두 CSS var()', () => {
    expect(ASSIGNEE_COLORS.length).toBeGreaterThan(0)
    for (const c of ASSIGNEE_COLORS) expect(c).toMatch(/^var\(--/)
  })
})
