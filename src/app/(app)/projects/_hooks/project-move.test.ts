import { describe, expect, it } from 'vitest'
import type { GanttProject } from '@/types'
import { includeChildProjectMoves } from './project-move'

function project(overrides: Partial<GanttProject>): GanttProject {
  return {
    id: 'project-1',
    workspace_id: 'workspace-1',
    board_id: 'board-1',
    category_id: 'category-1',
    parent_id: null,
    name: 'Project',
    status: 'to-do',
    start_date: null,
    end_date: null,
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

describe('includeChildProjectMoves', () => {
  it('moves children with a parent when the parent changes category', () => {
    const parent = project({ id: 'parent', category_id: 'category-1', sort_order: 0 })
    const child = project({ id: 'child', parent_id: 'parent', category_id: 'category-1', sort_order: 4 })

    expect(includeChildProjectMoves([parent, child], [
      { id: 'parent', category_id: 'category-2', sort_order: 1 },
    ])).toEqual([
      { id: 'parent', category_id: 'category-2', sort_order: 1 },
      { id: 'child', category_id: 'category-2', sort_order: 4 },
    ])
  })

  it('does not add children when the parent only changes sort order', () => {
    const parent = project({ id: 'parent', category_id: 'category-1', sort_order: 0 })
    const child = project({ id: 'child', parent_id: 'parent', category_id: 'category-1', sort_order: 4 })

    expect(includeChildProjectMoves([parent, child], [
      { id: 'parent', category_id: 'category-1', sort_order: 1 },
    ])).toEqual([
      { id: 'parent', category_id: 'category-1', sort_order: 1 },
    ])
  })
})
