'use client'

import { ChevronDown, Trash2, X } from 'lucide-react'
import { STATUS_GROUPS } from '../_constants'
import type { TaskStatus } from '@/types'

interface BulkActionBarProps {
  selectedCount: number
  bulkStatusOpen: boolean
  onBulkStatusOpenChange: (v: boolean) => void
  onBulkStatusChange: (status: TaskStatus) => void
  onBulkDelete: () => void
  onExit: () => void
}

export function BulkActionBar({
  selectedCount,
  bulkStatusOpen, onBulkStatusOpenChange,
  onBulkStatusChange,
  onBulkDelete,
  onExit,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-dialog flex items-center gap-1.5 bg-sidebar text-sidebar-foreground px-3 py-2 rounded-xl shadow-xl border border-sidebar-border">
      <span className="text-xs font-medium px-1.5">{selectedCount}개 선택됨</span>
      <div className="w-px h-4 bg-sidebar-border mx-0.5" />
      <div className="relative">
        <button
          onClick={() => onBulkStatusOpenChange(!bulkStatusOpen)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-sidebar-accent hover:opacity-80 transition-opacity"
        >
          상태 변경 <ChevronDown size={11} />
        </button>
        {bulkStatusOpen && (
          <div className="absolute bottom-full mb-1.5 left-0 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[110px] z-above">
            {STATUS_GROUPS.map(({ status, label, color }) => (
              <button
                key={status}
                onClick={() => onBulkStatusChange(status)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onBulkDelete}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-status-late hover:bg-sidebar-accent transition-colors"
      >
        <Trash2 size={12} /> 삭제
      </button>
      <div className="w-px h-4 bg-sidebar-border mx-0.5" />
      <button
        onClick={onExit}
        className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground"
      >
        <X size={13} />
      </button>
    </div>
  )
}
