'use client'

import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { GripVertical, Palette, Plus, StickyNote, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { GanttCategory, GanttProject } from '@/types'
import { PriorityBars } from '@/app/(app)/tasks/_constants'
import {
  CAT_ROW_H, PROJ_ROW_H, CAT_COLORS, STATUS_META,
  SortableCatRow, SortableProjRow,
  isProjectOverdue, isStartDelayed, daysBetween,
} from './_GanttRows'

// ── GanttCategoryLeft ─────────────────────────────────────────
interface GanttCategoryLeftProps {
  cat: GanttCategory
  catProjs: GanttProject[]
  readOnly: boolean
  editCatId: string | null
  editCatVal: string
  onEditCatValChange: (v: string) => void
  onCommitEditCat: (id: string) => void
  onCancelEditCat: () => void
  onStartEditCat: (cat: GanttCategory, e: React.MouseEvent) => void
  onDeleteCategory: (id: string) => Promise<void>
  onUpdateCategory: (id: string, updates: { name?: string; color?: string }) => Promise<void>
  onAddProject: (catId: string) => void
  onDeleteProject: (id: string) => void
  onEditProject: (project: GanttProject) => void
  onOpenMemo: (project: GanttProject) => void
  onSetMemoHover: (hover: { text: string; x: number; y: number } | null) => void
  onCycleStatus: (project: GanttProject) => void
  todayStr: string
}

export function GanttCategoryLeft({
  cat, catProjs, readOnly,
  editCatId, editCatVal, onEditCatValChange, onCommitEditCat, onCancelEditCat, onStartEditCat,
  onDeleteCategory, onUpdateCategory, onAddProject, onDeleteProject, onEditProject,
  onOpenMemo, onSetMemoHover, onCycleStatus, todayStr,
}: GanttCategoryLeftProps) {
  return (
    <SortableCatRow id={cat.id} disabled={readOnly}>
      {({ listeners }) => (
        <div data-row>
          {/* 카테고리 헤더 — 왼쪽 */}
          <div
            className="flex items-center group border-b"
            style={{ height: CAT_ROW_H, backgroundColor: 'var(--muted)', borderLeft: `3px solid ${cat.color}` }}
          >
            {!readOnly && (
              <div
                {...listeners}
                className="pl-1.5 pr-0.5 flex items-center self-stretch cursor-grab text-ink-300 hover:text-muted-foreground shrink-0"
              >
                <GripVertical size={13} />
              </div>
            )}
            <div className={`flex items-center gap-2 ${readOnly ? 'pl-3' : 'pl-1'} pr-2 w-full min-w-0`}>
              {editCatId === cat.id ? (
                <input
                  autoFocus
                  className="text-sm font-bold text-foreground border-b border-lilac-400 outline-none bg-transparent flex-1 min-w-0"
                  value={editCatVal}
                  onChange={e => onEditCatValChange(e.target.value)}
                  onBlur={() => onCommitEditCat(cat.id)}
                  onKeyDown={e => { if (e.key === 'Enter') onCommitEditCat(cat.id); if (e.key === 'Escape') onCancelEditCat() }}
                />
              ) : (
                <span
                  className="text-sm font-bold text-foreground cursor-text hover:text-lilac-600 truncate"
                  onClick={readOnly ? undefined : e => onStartEditCat(cat, e)}
                >
                  {cat.name}
                </span>
              )}
              <span className="text-sm text-muted-foreground shrink-0 tabular-nums">{catProjs.length}</span>
              {!readOnly && (
                <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100">
                  <Popover>
                    <PopoverTrigger className="p-1 text-ink-300 hover:text-lilac-500 rounded" title="색상 변경">
                      <Palette size={12} />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <div className="grid grid-cols-8 gap-1.5">
                        {CAT_COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => onUpdateCategory(cat.id, { color: c })}
                            className={`w-5 h-5 rounded-full hover:scale-110 transition-transform border border-black/5 ${cat.color === c ? 'ring-2 ring-foreground ring-offset-1' : ''}`}
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <button
                    onClick={() => onDeleteCategory(cat.id)}
                    className="p-1 text-ink-300 hover:text-status-late rounded"
                    title="카테고리 삭제"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 프로젝트 행 — 왼쪽 */}
          <SortableContext items={catProjs.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {catProjs.map(project => {
              const isBacklog = project.status === 'backlog'
              const sm        = STATUS_META[project.status]
              return (
                <SortableProjRow key={project.id} id={project.id} disabled={readOnly}>
                  {({ listeners, isDragging }) => (
                    <div className="relative" style={{ opacity: isDragging ? 0 : 1 }}>
                      <div
                        className={`flex items-center gap-1.5 group border-b pl-3 pr-2 relative hover:bg-muted transition-colors ${isBacklog ? 'bg-ink-100' : 'bg-card'}`}
                        style={{
                          height: PROJ_ROW_H,
                          ...(readOnly && { paddingLeft: 14 }),
                        }}
                      >
                        {!readOnly && (
                          <button
                            {...listeners}
                            className="shrink-0 cursor-grab touch-none p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => e.stopPropagation()}
                            tabIndex={-1}
                          >
                            <GripVertical size={13} className="text-ink-300" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={readOnly ? undefined : () => onCycleStatus(project)}
                          aria-label={sm.label}
                          title={sm.label}
                          className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-5xs font-bold text-white hover:scale-110 transition-transform"
                          style={{ backgroundColor: sm.dot, cursor: readOnly ? 'default' : 'pointer' }}
                        >
                          {sm.abbr}
                        </button>
                        {(project.priority ?? 0) > 0 && (
                          <span className="shrink-0"><PriorityBars priority={project.priority} /></span>
                        )}
                        <span
                          className="text-sm truncate min-w-0 cursor-pointer text-foreground"
                          onClick={readOnly ? undefined : () => onEditProject(project)}
                          title={project.name}
                        >
                          {project.name}
                        </span>
                        {isProjectOverdue(project, todayStr) ? (
                          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-status-late/10 text-status-late font-medium border border-status-late/15 whitespace-nowrap">
                            지연 {daysBetween(project.end_date!, todayStr)}일
                          </span>
                        ) : isStartDelayed(project, todayStr) ? (
                          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-status-warn/10 text-status-warn font-medium border border-status-warn/15 whitespace-nowrap">
                            시작 지연 {daysBetween(project.start_date!, todayStr)}일
                          </span>
                        ) : null}
                        <span className="flex-1 min-w-0" />
                        {!readOnly && (
                          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pl-8 pr-2">
                            <div
                              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                              style={{
                                background: 'linear-gradient(to left, var(--color-muted) 55%, transparent 100%)',
                              }}
                            />
                            <button
                              onClick={e => { e.stopPropagation(); onDeleteProject(project.id) }}
                              className="relative shrink-0 p-1 rounded text-ink-300 hover:text-status-late opacity-0 group-hover:opacity-100 transition-opacity"
                              title="삭제 (휴지통으로 이동)"
                            >
                              <Trash2 size={11} />
                            </button>
                            <button
                              onClick={() => onOpenMemo(project)}
                              onMouseEnter={project.memo ? e => onSetMemoHover({ text: project.memo!, x: e.clientX, y: e.clientY }) : undefined}
                              onMouseLeave={project.memo ? () => onSetMemoHover(null) : undefined}
                              className={`relative shrink-0 p-1 rounded transition-opacity ${
                                project.memo
                                  ? 'text-lilac-500 hover:text-lilac-600'
                                  : 'text-ink-300 hover:text-lilac-400 opacity-0 group-hover:opacity-100'
                              }`}
                              title="메모"
                            >
                              <StickyNote size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </SortableProjRow>
              )
            })}
          </SortableContext>

          {!readOnly && (
            <div className="border-b border-border" style={{ height: PROJ_ROW_H }}>
              <button
                onClick={() => onAddProject(cat.id)}
                className="h-full flex items-center gap-0.5 pl-3 text-sm text-ink-300 hover:text-muted-foreground"
              >
                <Plus size={10} /> 프로젝트
              </button>
            </div>
          )}
        </div>
      )}
    </SortableCatRow>
  )
}
