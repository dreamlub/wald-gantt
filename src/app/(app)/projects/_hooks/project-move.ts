import type { GanttProject } from '@/types'

export interface ProjectMoveUpdate {
  id: string
  category_id: string
  sort_order: number
}

export function includeChildProjectMoves(
  projects: GanttProject[],
  updates: ProjectMoveUpdate[],
): ProjectMoveUpdate[] {
  const withChildren = [...updates]
  for (const u of updates) {
    const proj = projects.find(p => p.id === u.id)
    if (proj && proj.category_id !== u.category_id) {
      projects.filter(p => p.parent_id === u.id).forEach(child => {
        if (!withChildren.some(x => x.id === child.id)) {
          withChildren.push({
            id: child.id,
            category_id: u.category_id,
            sort_order: child.sort_order,
          })
        }
      })
    }
  }
  return withChildren
}
