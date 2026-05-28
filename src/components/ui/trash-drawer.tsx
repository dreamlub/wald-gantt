'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { X, Trash2, RotateCcw } from 'lucide-react'
import { useConfirm } from '@/hooks/use-confirm'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'

interface TrashDrawerProps<T extends { id: string }> {
  open: boolean
  onClose: () => void
  /** 삭제된 항목을 fetch하는 함수 */
  fetchDeleted: () => Promise<T[]>
  /** 개별 복원 */
  restoreItem: (id: string) => Promise<void>
  /** 개별 영구 삭제 */
  permanentDeleteItem: (id: string) => Promise<void>
  /** 전체 비우기 */
  emptyAll: () => Promise<void>
  /** 복원 후 콜백 */
  onRestore: (item: T) => void
  /** 목록 아이템 렌더링 */
  renderItem: (item: T) => ReactNode
  /** 항목 이름 (확인 다이얼로그용) */
  getItemName: (item: T) => string
  /** 표시 레이블 ("프로젝트" / "태스크") */
  label: string
  /** fetch 의존성 */
  fetchDeps?: unknown[]
}

export function TrashDrawer<T extends { id: string }>({
  open, onClose,
  fetchDeleted, restoreItem, permanentDeleteItem, emptyAll,
  onRestore, renderItem, getItemName, label,
  fetchDeps = [],
}: TrashDrawerProps<T>) {
  const { confirm: showConfirm, dialog: confirmDialog } = useConfirm()
  const [deleted, setDeleted] = useState<T[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const items = await fetchDeleted()
        if (!cancelled) setDeleted(items)
      } catch {
        // 조회 실패 — 빈 목록 유지
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...fetchDeps])

  async function handleRestore(item: T) {
    await restoreItem(item.id)
    setDeleted(prev => prev.filter(i => i.id !== item.id))
    onRestore(item)
  }

  async function handlePermanentDelete(item: T) {
    if (!await showConfirm({
      title: `'${getItemName(item)}' 영구 삭제`,
      description: '영구 삭제하면 복원할 수 없어요.',
    })) return
    await permanentDeleteItem(item.id)
    setDeleted(prev => prev.filter(i => i.id !== item.id))
  }

  async function handleEmptyTrash() {
    if (!await showConfirm({
      title: '휴지통 비우기',
      description: `${deleted.length}개 항목이 영구 삭제됩니다. 되돌릴 수 없어요.`,
    })) return
    await emptyAll()
    setDeleted([])
  }

  return (
    <>
      {confirmDialog}
      <Drawer open={open} onClose={onClose} width={320} panelClass="border-l shadow-xl">
        <div className="h-12 flex items-center gap-2.5 px-4 border-b shrink-0">
          <Trash2 size={14} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground flex-1">휴지통</span>
          {deleted.length > 0 && (
            <button
              onClick={handleEmptyTrash}
              className="text-sm text-status-late hover:text-status-late/80 px-2 py-0.5 rounded hover:bg-status-late/10 transition-colors"
            >
              전체 비우기
            </button>
          )}
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground shrink-0">
            <X size={15} />
          </button>
        </div>
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 border-b bg-muted shrink-0">
          삭제된 {label} — {deleted.length}개
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">로딩 중...</div>
          ) : deleted.length === 0 ? (
            <EmptyState icon={<Trash2 size={20} />} title="휴지통이 비어 있습니다" className="h-28" />
          ) : (
            deleted.map(item => (
              <div key={item.id} className="px-4 py-3 border-b last:border-0 hover:bg-muted transition-colors group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {renderItem(item)}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRestore(item)}
                      className="p-1 text-muted-foreground hover:text-lilac-500 rounded"
                      title="복원"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item)}
                      className="p-1 text-muted-foreground hover:text-status-late rounded"
                      title="영구 삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Drawer>
    </>
  )
}
