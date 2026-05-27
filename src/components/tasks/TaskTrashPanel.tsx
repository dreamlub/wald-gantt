'use client'

import { getDeletedTasks, restoreTask, permanentDeleteTask, emptyTaskTrash } from '@/lib/task-service'
import type { GanttTask } from '@/types'
import { STATUS_COLOR, STATUS_BG_COLOR, STATUS_LABEL } from '@/app/(app)/tasks/_constants'
import { formatDateYMD } from '@/lib/gantt-utils'
import { TrashDrawer } from '@/components/ui/trash-drawer'

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
  onRestore: () => void
}

export function TaskTrashPanel({ open, onClose, workspaceId, onRestore }: Props) {
  return (
    <TrashDrawer<GanttTask>
      open={open}
      onClose={onClose}
      fetchDeleted={() => getDeletedTasks(workspaceId)}
      restoreItem={restoreTask}
      permanentDeleteItem={permanentDeleteTask}
      emptyAll={() => emptyTaskTrash(workspaceId)}
      onRestore={() => onRestore()}
      getItemName={t => t.title}
      label="태스크"
      fetchDeps={[workspaceId]}
      renderItem={task => (
        <>
          <div className="text-sm font-medium text-foreground truncate">{task.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: STATUS_BG_COLOR[task.status] ?? 'var(--task-status-backlog-bg)', color: STATUS_COLOR[task.status] ?? 'var(--task-status-backlog)' }}
            >
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
            {task.assignee && (
              <span className="text-sm text-muted-foreground truncate">{task.assignee}</span>
            )}
            {task.deleted_at && (
              <span className="text-sm text-ink-300">{formatDateYMD(task.deleted_at)}</span>
            )}
          </div>
        </>
      )}
    />
  )
}
