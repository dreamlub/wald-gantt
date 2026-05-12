'use client'

import { useEffect, useState } from 'react'
import { X, Trash2, RotateCcw } from 'lucide-react'
import { getDeletedProjects, restoreProject, permanentDeleteProject, emptyTrash } from '@/lib/gantt-service'
import type { GanttProject, GanttCategory } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  boardId: string
  categories: GanttCategory[]
  onRestore: (project: GanttProject) => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

export function TrashPanel({ open, onClose, boardId, categories, onRestore }: Props) {
  const [deleted, setDeleted] = useState<GanttProject[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getDeletedProjects(boardId)
      .then(setDeleted)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [open, boardId])

  async function handleRestore(project: GanttProject) {
    const restored = await restoreProject(project.id)
    setDeleted(prev => prev.filter(p => p.id !== project.id))
    onRestore(restored)
  }

  async function handlePermanentDelete(id: string) {
    if (!confirm('영구 삭제하면 복원할 수 없습니다. 계속할까요?')) return
    await permanentDeleteProject(id)
    setDeleted(prev => prev.filter(p => p.id !== id))
  }

  async function handleEmptyTrash() {
    if (!confirm(`휴지통을 비우면 ${deleted.length}개 항목이 영구 삭제됩니다. 계속할까요?`)) return
    await emptyTrash(boardId)
    setDeleted([])
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-80 bg-white border-l shadow-xl z-50 flex flex-col">
        {/* 헤더 */}
        <div className="h-12 flex items-center gap-2.5 px-4 border-b shrink-0">
          <Trash2 size={14} className="text-gray-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-800 flex-1">휴지통</span>
          {deleted.length > 0 && (
            <button
              onClick={handleEmptyTrash}
              className="text-[11px] text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
            >
              전체 비우기
            </button>
          )}
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
            <X size={15} />
          </button>
        </div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2 border-b bg-gray-50 shrink-0">
          삭제된 프로젝트 — {deleted.length}개
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-gray-400 text-xs">로딩 중...</div>
          ) : deleted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-gray-400 text-xs gap-1">
              <Trash2 size={20} className="opacity-30" />
              휴지통이 비어 있습니다
            </div>
          ) : (
            deleted.map(project => {
              const cat = categories.find(c => c.id === project.category_id)
              return (
                <div key={project.id} className="px-4 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-700 truncate">{project.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {cat && (
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: cat.color }} />
                            {cat.name}
                          </span>
                        )}
                        {project.deleted_at && (
                          <span className="text-[10px] text-gray-300">{formatDate(project.deleted_at)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRestore(project)}
                        className="p-1 text-gray-400 hover:text-indigo-500 rounded"
                        title="복원"
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(project.id)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded"
                        title="영구 삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
