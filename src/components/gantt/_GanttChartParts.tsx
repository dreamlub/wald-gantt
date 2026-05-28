'use client'

import { DragOverlay } from '@dnd-kit/core'
import { Undo2, Redo2, GripVertical } from 'lucide-react'
import type { GanttCategory, GanttProject } from '@/types'
import { CAT_ROW_H, PROJ_ROW_H, STATUS_META } from './_GanttRows'

// ── 왼쪽 패널 헤더 액션 (실행취소/다시실행 + 지연/시작지연 필터 뱃지) ──
interface LeftHeaderActionsProps {
  onUndo?: () => void
  undoCount: number
  onRedo?: () => void
  redoCount: number
  overdueCount: number
  overdueFilter: boolean
  onToggleOverdueFilter: () => void
  startDelayedCount: number
  startDelayedFilter: boolean
  onToggleStartDelayedFilter: () => void
}

export function GanttLeftHeaderActions({
  onUndo, undoCount, onRedo, redoCount,
  overdueCount, overdueFilter, onToggleOverdueFilter,
  startDelayedCount, startDelayedFilter, onToggleStartDelayedFilter,
}: LeftHeaderActionsProps) {
  return (
    <div className="flex items-center gap-1.5 pt-1.5">
      {onUndo && (
        <button
          onClick={onUndo}
          disabled={undoCount === 0}
          title={`실행 취소 (Ctrl+Z)${undoCount > 0 ? ` — ${undoCount}단계` : ''}`}
          className="flex items-center gap-0.5 text-2xs px-1 py-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Undo2 size={11} />
          {undoCount > 0 && <span className="tabular-nums">{undoCount}</span>}
        </button>
      )}
      {onRedo && (
        <button
          onClick={onRedo}
          disabled={redoCount === 0}
          title={`다시 실행 (Ctrl+Y)${redoCount > 0 ? ` — ${redoCount}단계` : ''}`}
          className="flex items-center gap-0.5 text-2xs px-1 py-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Redo2 size={11} />
          {redoCount > 0 && <span className="tabular-nums">{redoCount}</span>}
        </button>
      )}
      {overdueCount > 0 && (
        <button
          onClick={onToggleOverdueFilter}
          className={`flex items-center gap-0.5 text-2xs font-medium px-1.5 py-0.5 rounded-full border transition-colors ${
            overdueFilter
              ? 'bg-status-late text-white border-status-late'
              : 'bg-status-late/10 text-status-late border-status-late/15 hover:bg-status-late/20'
          }`}
        >
          <span className="w-1 h-1 rounded-full bg-current" />
          지연 {overdueCount}
        </button>
      )}
      {startDelayedCount > 0 && (
        <button
          onClick={onToggleStartDelayedFilter}
          className={`flex items-center gap-0.5 text-2xs font-medium px-1.5 py-0.5 rounded-full border transition-colors ${
            startDelayedFilter
              ? 'bg-status-warn text-white border-status-warn'
              : 'bg-status-warn/10 text-status-warn border-status-warn/15 hover:bg-status-warn/20'
          }`}
        >
          <span className="w-1 h-1 rounded-full bg-current" />
          시작지연 {startDelayedCount}
        </button>
      )}
    </div>
  )
}

// ── 드래그 오버레이 (카테고리/프로젝트 행) — DndContext 내부에서 렌더 ──
interface GanttDragOverlayProps {
  activeCat: GanttCategory | null | undefined
  activeProj: GanttProject | null | undefined
  leftWidth: number
}

export function GanttDragOverlay({ activeCat, activeProj, leftWidth }: GanttDragOverlayProps) {
  return (
    <DragOverlay dropAnimation={null}>
      {activeCat ? (
        <div
          className="flex items-center gap-1.5 border border-lilac-300 bg-muted shadow-xl rounded px-2 cursor-grabbing"
          style={{ height: CAT_ROW_H, width: leftWidth - 4, opacity: 0.95, borderLeft: `3px solid ${activeCat.color}` }}
        >
          <GripVertical size={13} className="text-ink-400 shrink-0" />
          <span className="text-xs font-bold text-foreground truncate flex-1">
            {activeCat.name}
          </span>
        </div>
      ) : activeProj ? (() => {
        const sm = STATUS_META[activeProj.status]
        return (
          <div
            className="flex items-center gap-1.5 border border-lilac-300 bg-card shadow-xl rounded px-2 cursor-grabbing"
            style={{ height: PROJ_ROW_H, width: leftWidth - 4, opacity: 0.95 }}
          >
            <GripVertical size={13} className="text-ink-400 shrink-0" />
            <span
              className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-5xs font-bold text-white"
              style={{ backgroundColor: sm.dot }}
              aria-label={sm.label}
            >
              {sm.abbr}
            </span>
            <span className="text-xs font-medium text-foreground truncate flex-1">
              {activeProj.name}
            </span>
          </div>
        )
      })() : null}
    </DragOverlay>
  )
}
