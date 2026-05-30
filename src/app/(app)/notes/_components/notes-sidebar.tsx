'use client'

import { LayoutList, Pin, Trash2 } from 'lucide-react'
import { NOTE_COLORS } from './note-color-picker'
import type { NoteColor } from '@/types'

export type NoteQuickFilter = 'all' | 'pinned' | 'trash'

interface Props {
  quickFilter:          NoteQuickFilter
  onQuickFilterChange:  (key: NoteQuickFilter) => void
  totalCount:           number
  pinnedCount:          number
  colorFilter:          Set<NoteColor>
  onColorFilterChange:  (color: NoteColor) => void
  onColorFilterClear:   () => void
  trashCount:           number
  onTrashOpen:          () => void
}

export function NotesSidebar({
  quickFilter, onQuickFilterChange,
  totalCount, pinnedCount,
  colorFilter, onColorFilterChange, onColorFilterClear,
  trashCount, onTrashOpen,
}: Props) {
  const quickItems = [
    { key: 'all'    as const, label: '전체',  count: totalCount,  icon: <LayoutList size={12} className="shrink-0" /> },
    { key: 'pinned' as const, label: '고정됨', count: pinnedCount, icon: <Pin size={12} className="shrink-0" /> },
  ]

  return (
    <div
      className="shrink-0 border-r bg-muted flex flex-col overflow-hidden"
      style={{ width: 'var(--sidebar-w)' }}
    >
      {/* 헤더 */}
      <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
        <h1 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">메모장</h1>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">

        {/* 퀵 필터 */}
        {quickItems.map(item => (
          <button
            key={item.key}
            onClick={() => onQuickFilterChange(
              quickFilter === item.key && item.key !== 'all' ? 'all' : item.key
            )}
            className={`sidebar-btn ${quickFilter === item.key ? 'sidebar-btn-active' : ''}`}
          >
            {item.icon}
            <span className="flex-1 text-left truncate">{item.label}</span>
            <span className="text-sm text-ink-400">{item.count}</span>
          </button>
        ))}

        {/* 색상 필터 */}
        <div className="mt-3">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider">색상</span>
            {colorFilter.size > 0 && (
              <button
                onClick={onColorFilterClear}
                className="text-2xs text-ink-400 hover:text-lilac-500 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
          <div className="flex gap-1.5 px-2">
            {(Object.entries(NOTE_COLORS) as [NoteColor, (typeof NOTE_COLORS)[NoteColor]][]).map(([key, c]) => (
              <button
                key={key}
                title={c.label}
                onClick={() => onColorFilterChange(key)}
                className={`w-4 h-4 rounded-full border-2 transition-all hover:scale-110 ${c.dot} ${
                  colorFilter.has(key)
                    ? 'border-foreground scale-110'
                    : 'border-transparent opacity-40 hover:opacity-80'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 휴지통 버튼 — 드로워 열기 */}
      <div className="shrink-0 border-t px-1.5 py-1.5">
        <button
          onClick={onTrashOpen}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-ink-400 hover:text-muted-foreground hover:bg-muted rounded-md transition-colors"
        >
          <Trash2 size={13} className="shrink-0" />
          <span className="whitespace-nowrap">휴지통</span>
          {trashCount > 0 && (
            <span className="ml-auto text-3xs bg-status-late/15 text-status-late font-semibold px-1.5 py-0.5 rounded-full">
              {trashCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
