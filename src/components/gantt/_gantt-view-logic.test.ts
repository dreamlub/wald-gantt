import { describe, expect, it } from 'vitest'
import { buildDayRange, buildWeekRange } from '@/lib/gantt-utils'
import type { GanttProject } from '@/types'
import {
  matchesGanttFilters,
  orderedProjectsForCategory,
  projectBarCols,
} from './_gantt-view-logic'

function project(overrides: Partial<GanttProject>): GanttProject {
  return {
    id: 'project-1',
    workspace_id: 'workspace-1',
    board_id: 'board-1',
    category_id: 'category-1',
    parent_id: null,
    name: 'Project',
    status: 'to-do',
    start_date: '2026-05-01',
    end_date: '2026-05-08',
    sort_order: 0,
    team: null,
    pm: null,
    memo: null,
    priority: 0,
    progress: 0,
    is_milestone: false,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

const emptyFilters = {
  searchQuery: '',
  excludedTeams: new Set<string>(),
  excludedPMs: new Set<string>(),
  overdueFilter: false,
  startDelayedFilter: false,
  todayStr: '2026-05-30',
}

describe('gantt view logic', () => {
  it('keeps parent context when only a child matches active filters', () => {
    const parent = project({ id: 'parent', name: 'Parent', sort_order: 0 })
    const matchingChild = project({
      id: 'child-match',
      parent_id: 'parent',
      name: 'Launch checklist',
      sort_order: 0,
    })
    const hiddenChild = project({
      id: 'child-hidden',
      parent_id: 'parent',
      name: 'Budget',
      sort_order: 1,
    })

    const result = orderedProjectsForCategory({
      catId: 'category-1',
      projects: [parent, hiddenChild, matchingChild],
      liveItems: null,
      sortMode: 'default',
      collapsedParents: new Set(),
      filters: { ...emptyFilters, searchQuery: 'launch' },
    })

    expect(result.map(p => p.id)).toEqual(['parent', 'child-match'])
  })

  it('includes the full child list when the parent matches active filters', () => {
    const parent = project({ id: 'parent', name: 'Launch', sort_order: 0 })
    const firstChild = project({ id: 'child-1', parent_id: 'parent', name: 'Budget', sort_order: 0 })
    const secondChild = project({ id: 'child-2', parent_id: 'parent', name: 'QA', sort_order: 1 })

    const result = orderedProjectsForCategory({
      catId: 'category-1',
      projects: [parent, secondChild, firstChild],
      liveItems: null,
      sortMode: 'default',
      collapsedParents: new Set(),
      filters: { ...emptyFilters, searchQuery: 'launch' },
    })

    expect(result.map(p => p.id)).toEqual(['parent', 'child-1', 'child-2'])
  })

  it('filters excluded teams and PMs', () => {
    const p = project({ team: 'DX', pm: 'Kim' })

    expect(matchesGanttFilters(p, {
      ...emptyFilters,
      excludedTeams: new Set(['DX']),
    })).toBe(false)
    expect(matchesGanttFilters(p, {
      ...emptyFilters,
      excludedPMs: new Set(['Kim']),
    })).toBe(false)
  })

  it('calculates day-view bar columns for normal projects and milestones', () => {
    const days = buildDayRange('2026-05', '2026-05')
    const weeks = buildWeekRange('2026-05', '2026-05')

    expect(projectBarCols({
      project: project({ start_date: '2026-05-02', end_date: '2026-05-04' }),
      viewMode: 'day',
      viewStart: '2026-05',
      weeks,
      days,
      totalCols: days.length,
    })).toEqual({ start: 1, end: 4 })

    expect(projectBarCols({
      project: project({ is_milestone: true, start_date: null, end_date: '2026-05-10' }),
      viewMode: 'day',
      viewStart: '2026-05',
      weeks,
      days,
      totalCols: days.length,
    })).toEqual({ start: 9, end: 10 })
  })
})
