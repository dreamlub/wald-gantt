import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { useUndoRedo, projectUndoUpdate } from './use-undo-redo'
import { updateCategory, updateProject } from '@/lib/gantt-service'
import type { GanttCategory, GanttProject } from '@/types'

vi.mock('@/lib/gantt-service', () => ({
  updateProject: vi.fn(),
  updateCategory: vi.fn(),
}))

const baseProject: GanttProject = {
  id: 'project-1',
  workspace_id: 'workspace-1',
  board_id: 'board-1',
  category_id: 'category-1',
  parent_id: null,
  name: 'Before',
  status: 'to-do',
  start_date: '2026-05-01',
  end_date: '2026-05-10',
  sort_order: 2,
  team: 'DX',
  pm: 'Kim',
  memo: 'before memo',
  priority: 3,
  progress: 25,
  is_milestone: true,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  deleted_at: null,
}

function renderUndoRedo(initialProjects: GanttProject[]) {
  return renderHook(() => {
    const [projects, setProjects] = useState(initialProjects)
    const [categories, setCategories] = useState<GanttCategory[]>([])
    const undoRedo = useUndoRedo({
      projects,
      categories,
      onProjectsChange: setProjects,
      onCategoriesChange: setCategories,
    })

    return { projects, ...undoRedo }
  })
}

describe('useUndoRedo', () => {
  beforeEach(() => {
    vi.mocked(updateProject).mockReset()
    vi.mocked(updateCategory).mockReset()
  })

  it('builds a complete project update for undoable project fields', () => {
    expect(projectUndoUpdate(baseProject)).toEqual({
      category_id: 'category-1',
      parent_id: null,
      name: 'Before',
      status: 'to-do',
      start_date: '2026-05-01',
      end_date: '2026-05-10',
      sort_order: 2,
      team: 'DX',
      pm: 'Kim',
      memo: 'before memo',
      priority: 3,
      progress: 25,
      is_milestone: true,
    })
  })

  it('restores memo, priority, progress, and milestone state on undo', async () => {
    const currentProject: GanttProject = {
      ...baseProject,
      name: 'After',
      memo: 'after memo',
      priority: 1,
      progress: 80,
      is_milestone: false,
    }
    vi.mocked(updateProject).mockResolvedValue(baseProject)

    const { result } = renderUndoRedo([currentProject])

    act(() => {
      result.current.pushUndo({ type: 'project', prev: baseProject })
    })

    await waitFor(() => expect(result.current.undoCount).toBe(1))

    await act(async () => {
      await result.current.handleUndo()
    })

    expect(updateProject).toHaveBeenCalledWith('project-1', {
      category_id: 'category-1',
      parent_id: null,
      name: 'Before',
      status: 'to-do',
      start_date: '2026-05-01',
      end_date: '2026-05-10',
      sort_order: 2,
      team: 'DX',
      pm: 'Kim',
      memo: 'before memo',
      priority: 3,
      progress: 25,
      is_milestone: true,
    })
    expect(result.current.projects[0]).toEqual(baseProject)
  })
})
