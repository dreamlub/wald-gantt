'use client'

import { useEffect, useState } from 'react'
import { X, Trash2, RotateCcw } from 'lucide-react'
import { useConfirm } from '@/hooks/use-confirm'
import { getDeletedTasks, restoreTask, permanentDeleteTask, emptyTaskTrash } from '@/lib/gantt-service'
import type { GanttTask } from '@/types'
import { STATUS_COLOR, STATUS_BG_COLOR, STATUS_LABEL } from '@/app/(app)/tasks/_constants'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateYMD } from '@/lib/gantt-utils'

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
  onRestore: () => void
}

export function TaskTrashPanel({ open, onClose, workspaceId, onRestore }: Props) {
  const { confirm: showConfirm, dialog: confirmDialog } = useConfirm()
  const [deleted, setDeleted] = useState<GanttTask[]>([])
  const [loading, setLoading] = useState(false)

  // 패널 열릴 때 휴지통 fetch (외부 fetch → setState 의도된 패턴)
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getDeletedTasks(workspaceId)
      .then(setDeleted)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [open, workspaceId])

  async function handleRestore(id: string) {
    await restoreTask(id)
    setDeleted(prev => prev.filter(t => t.id !== id))
    onRestore()
  }

  async function handlePermanentDelete(id: string) {
    const task = deleted.find(t => t.id === id)
    if (!await showConfirm({
      title: `'${task?.title ?? '태스크'}' 영구 삭제`,
      description: '영구 삭제하면 복원할 수 없어요.',
    })) return
    await permanentDeleteTask(id)
    setDeleted(prev => prev.filter(t => t.id !== id))
  }

  async function handleEmptyTrash() {
    if (!await showConfirm({
      title: '휴지통 비우기',
      description: `${deleted.length}개 항목이 영구 삭제됩니다. 되돌릴 수 없어요.`,
    })) return
    await emptyTaskTrash(workspaceId)
    setDeleted([])
  }

  return (
    <>
      {confirmDialog}
      <Drawer open={open} onClose={onClose} width={320} backdrop={false} panelClass="border-l shadow-xl">
        {/* 헤더 */}
        <div className="h-12 flex items-center gap-2.5 px-4 border-b shrink-0">
          <Trash2 size={14} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold text-foreground flex-1">휴지통</span>
          {deleted.length > 0 && (
            <button
              onClick={handleEmptyTrash}
              className="text-[11px] text-status-late hover:text-status-late/80 px-2 py-0.5 rounded hover:bg-status-late/10 transition-colors"
            >
              전체 비우기
            </button>
          )}
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground shrink-0">
            <X size={15} />
          </button>
        </div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 border-b bg-muted shrink-0">
          삭제된 태스크 — {deleted.length}개
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">로딩 중...</div>
          ) : deleted.length === 0 ? (
            <EmptyState icon={<Trash2 size={20} />} title="휴지통이 비어 있습니다" className="h-28" />
          ) : deleted.map(task => (
            <div key={task.id} className="px-4 py-3 border-b last:border-0 hover:bg-muted transition-colors group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{task.title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: STATUS_BG_COLOR[task.status] ?? 'var(--task-status-backlog-bg)', color: STATUS_COLOR[task.status] ?? 'var(--task-status-backlog)' }}
                    >
                      {STATUS_LABEL[task.status] ?? task.status}
                    </span>
                    {task.assignee && (
                      <span className="text-[10px] text-muted-foreground truncate">{task.assignee}</span>
                    )}
                    {task.deleted_at && (
                      <span className="text-[10px] text-ink-300">{formatDateYMD(task.deleted_at)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRestore(task.id)}
                    className="p-1 text-muted-foreground hover:text-lilac-500 rounded"
                    title="복원"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(task.id)}
                    className="p-1 text-muted-foreground hover:text-status-late rounded"
                    title="영구 삭제"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Drawer>
    </>
  )
}
