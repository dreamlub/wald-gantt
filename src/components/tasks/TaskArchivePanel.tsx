'use client'

import { useEffect, useState } from 'react'
import { X, Archive, RotateCcw } from 'lucide-react'
import { getArchivedTasks, unarchiveTask } from '@/lib/task-service'
import type { GanttTask } from '@/types'
import { STATUS_COLOR, STATUS_BG_COLOR, STATUS_LABEL } from '@/app/(app)/tasks/_constants'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateYMD } from '@/lib/gantt-utils'

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
  onUnarchive: () => void
}

export function TaskArchivePanel({ open, onClose, workspaceId, onUnarchive }: Props) {
  const [archived, setArchived] = useState<GanttTask[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getArchivedTasks(workspaceId)
      .then(setArchived)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, workspaceId])

  async function handleUnarchive(id: string) {
    await unarchiveTask(id)
    setArchived(prev => prev.filter(t => t.id !== id))
    onUnarchive()
  }

  return (
    <Drawer open={open} onClose={onClose} width={320} backdrop={false} panelClass="border-l shadow-xl">
      {/* 헤더 */}
      <div className="h-12 flex items-center gap-2.5 px-4 border-b shrink-0">
        <Archive size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground flex-1">아카이브</span>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground shrink-0">
          <X size={15} />
        </button>
      </div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 border-b bg-muted shrink-0">
        아카이브된 태스크 — {archived.length}개
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">로딩 중...</div>
        ) : archived.length === 0 ? (
          <EmptyState icon={<Archive size={20} />} title="아카이브가 비어 있습니다" description="완료 후 7일이 지난 태스크가 자동으로 이동됩니다" className="h-28" />
        ) : archived.map(task => (
          <div key={task.id} className="px-4 py-3 border-b last:border-0 hover:bg-muted transition-colors group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: STATUS_BG_COLOR[task.status] ?? 'var(--task-status-backlog-bg)', color: STATUS_COLOR[task.status] ?? 'var(--task-status-backlog)' }}
                  >
                    {STATUS_LABEL[task.status] ?? task.status}
                  </span>
                  {task.assignee && (
                    <span className="text-xs text-muted-foreground truncate">{task.assignee}</span>
                  )}
                  {task.archived_at && (
                    <span className="text-xs text-ink-300">{formatDateYMD(task.archived_at)}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleUnarchive(task.id)}
                className="shrink-0 p-1 text-muted-foreground hover:text-lilac-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="아카이브 해제"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  )
}
