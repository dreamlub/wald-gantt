'use client'

import { getDeletedProjects, restoreProject, permanentDeleteProject, emptyTrash } from '@/lib/gantt-service'
import type { GanttProject, GanttCategory } from '@/types'
import { formatDateYMD } from '@/lib/gantt-utils'
import { TrashDrawer } from '@/components/ui/trash-drawer'

interface Props {
  open: boolean
  onClose: () => void
  boardId: string
  categories: GanttCategory[]
  onRestore: (project: GanttProject) => void
}

export function TrashPanel({ open, onClose, boardId, categories, onRestore }: Props) {
  return (
    <TrashDrawer<GanttProject>
      open={open}
      onClose={onClose}
      fetchDeleted={() => getDeletedProjects(boardId)}
      restoreItem={async (id) => { await restoreProject(id) }}
      permanentDeleteItem={permanentDeleteProject}
      emptyAll={() => emptyTrash(boardId)}
      onRestore={onRestore}
      getItemName={p => p.name}
      label="프로젝트"
      fetchDeps={[boardId]}
      renderItem={project => {
        const cat = categories.find(c => c.id === project.category_id)
        return (
          <>
            <div className="text-sm font-medium text-foreground truncate">{project.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {cat && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </span>
              )}
              {project.deleted_at && (
                <span className="text-sm text-ink-300">{formatDateYMD(project.deleted_at)}</span>
              )}
            </div>
          </>
        )
      }}
    />
  )
}
