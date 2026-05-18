'use client'

import type { ReactNode } from 'react'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Palette, Plus, StickyNote, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { GanttCategory, GanttProject, GanttStatus } from '@/types'
import { MS_PER_DAY } from '@/lib/gantt-utils'

// ── Layout constants ──────────────────────────────────────────
export const CAT_ROW_H  = 32
export const PROJ_ROW_H = 36

// hex strings required — stored to DB and compared against stored category.color values
export const CAT_COLORS = [
  '#818cf8', '#60a5fa', '#4ade80', '#facc15',  // --color-cat-{indigo,blue,green,yellow}
  '#fb923c', '#f87171', '#f472b6', '#c084fc',  // --color-cat-{orange,red,pink,purple}
  '#c7d2fe', '#bfdbfe', '#bbf7d0', '#fef08a',  // --color-cat-{indigo,blue,green,yellow}-light
  '#fed7aa', '#fecaca', '#fbcfe8', '#ddd6fe',  // --color-cat-{orange,red,pink,purple}-light
]

export const STATUS_META: Record<GanttStatus, { label: string; abbr: string; dot: string }> = {
  'to-do':       { label: 'To-Do',       abbr: 'T', dot: 'var(--task-status-todo)' },
  'in-progress': { label: 'In Progress', abbr: 'I', dot: 'var(--task-status-in-progress)' },
  'pending':     { label: 'Pending',     abbr: 'P', dot: 'var(--task-status-pending)' },
  'backlog':     { label: 'Backlog',     abbr: 'B', dot: 'var(--task-status-backlog)' },
  'done':        { label: 'Done',        abbr: 'D', dot: 'var(--task-status-done)' },
}

export const STATUS_ORDER: GanttStatus[] = ['backlog', 'to-do', 'in-progress', 'done', 'pending']

// ── Pure helpers ──────────────────────────────────────────────
export function randomCatColor(usedColors: Set<string>): string {
  const available = CAT_COLORS.filter(c => !usedColors.has(c))
  const pool = available.length > 0 ? available : CAT_COLORS
  return pool[Math.floor(Math.random() * pool.length)]
}

export function isProjectOverdue(p: GanttProject, todayStr: string): boolean {
  return !!p.end_date && p.status !== 'done' && p.end_date < todayStr
}

export function isStartDelayed(p: GanttProject, todayStr: string): boolean {
  return !!p.start_date && (p.status === 'to-do' || p.status === 'backlog') && p.start_date < todayStr
}

export function formatBarDate(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-')
  const [ey, em, ed] = end.split('-')
  const sLabel = `${parseInt(sm)}/${parseInt(sd)}`
  const eLabel = `${parseInt(em)}/${parseInt(ed)}`
  if (sy === ey) {
    if (sm === em) return `${sLabel} ~ ${parseInt(ed)}`
    return `${sLabel} ~ ${eLabel}`
  }
  return `${sy.slice(2)}.${sLabel} ~ ${ey.slice(2)}.${eLabel}`
}

function daysBetween(fromDate: string, toDateStr: string): number {
  const from = new Date(fromDate + 'T00:00:00')
  const to   = new Date(toDateStr + 'T00:00:00')
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY))
}

// ── Sortable row shells ───────────────────────────────────────
function SortableProjRow({ id, disabled, children }: {
  id: string
  disabled?: boolean
  children: (props: { listeners: ReturnType<typeof useSortable>['listeners']; isDragging: boolean }) => ReactNode
}) {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
    >
      {children({ listeners, isDragging })}
    </div>
  )
}

function SortableCatRow({ id, disabled, children }: {
  id: string
  disabled?: boolean
  children: (props: { listeners: ReturnType<typeof useSortable>['listeners']; isDragging: boolean }) => ReactNode
}) {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
      {...attributes}
    >
      {children({ listeners, isDragging })}
    </div>
  )
}

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
                  className="text-xs font-bold text-foreground border-b border-lilac-400 outline-none bg-transparent flex-1 min-w-0"
                  value={editCatVal}
                  onChange={e => onEditCatValChange(e.target.value)}
                  onBlur={() => onCommitEditCat(cat.id)}
                  onKeyDown={e => { if (e.key === 'Enter') onCommitEditCat(cat.id); if (e.key === 'Escape') onCancelEditCat() }}
                />
              ) : (
                <span
                  className="text-xs font-bold text-foreground cursor-text hover:text-lilac-600 truncate"
                  onClick={readOnly ? undefined : e => onStartEditCat(cat, e)}
                >
                  {cat.name}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{catProjs.length}</span>
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
                        className={`flex items-center gap-1.5 group border-b pl-3 pr-2 relative hover:bg-muted transition-colors ${isBacklog ? 'bg-[#f3f4f6]' : 'bg-card'}`}
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
                          className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white hover:scale-110 transition-transform"
                          style={{ backgroundColor: sm.dot, cursor: readOnly ? 'default' : 'pointer' }}
                        >
                          {sm.abbr}
                        </button>
                        <span
                          className={`text-xs truncate min-w-0 cursor-pointer ${
                            project.priority === 3 ? 'font-semibold text-coral-500' :
                            project.priority === 2 ? 'font-medium text-foreground' :
                            project.priority === 1 ? 'font-normal text-muted-foreground' :
                            'font-normal text-muted-foreground'
                          }`}
                          onClick={readOnly ? undefined : () => onEditProject(project)}
                          title={project.name}
                        >
                          {project.name}
                        </span>
                        {isProjectOverdue(project, todayStr) ? (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-status-late/10 text-status-late font-medium border border-status-late/15 whitespace-nowrap">
                            지연 {daysBetween(project.end_date!, todayStr)}일
                          </span>
                        ) : isStartDelayed(project, todayStr) ? (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-status-warn/10 text-status-warn font-medium border border-status-warn/15 whitespace-nowrap">
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
                className="h-full flex items-center gap-0.5 pl-3 text-xs text-ink-300 hover:text-muted-foreground"
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

// ── GanttCategoryRight ────────────────────────────────────────
interface GanttCategoryRightProps {
  cat: GanttCategory
  catProjs: GanttProject[]
  readOnly: boolean
  colW: number
  barCols: (p: GanttProject) => { start: number; end: number } | null
  makeDragHandlers: (p: GanttProject, dragType: 'move' | 'resize-left' | 'resize-right') => (e: React.MouseEvent) => void
  pmColorMap: Map<string, string>
}

export function GanttCategoryRight({
  cat, catProjs, readOnly, colW, barCols, makeDragHandlers, pmColorMap,
}: GanttCategoryRightProps) {
  const barColor = cat.color

  return (
    <div>
      <div className="border-b" style={{ height: CAT_ROW_H, backgroundColor: 'var(--muted)' }} />

      {catProjs.map(project => {
        const cols      = barCols(project)
        const isBacklog = project.status === 'backlog'

        const BAR_H      = 20
        const curTop     = (PROJ_ROW_H - BAR_H) / 2
        const barWidth   = (cols ? cols.end - cols.start : 0) * colW - 8
        const dateText   = (project.start_date && project.end_date) ? formatBarDate(project.start_date, project.end_date) : ''
        const dateFitsInside = dateText.length > 0 && barWidth >= dateText.length * 5.5 + 14

        return (
          <div
            key={project.id}
            className="relative border-b"
            style={{ height: PROJ_ROW_H, backgroundColor: isBacklog ? '#f3f4f6' : 'transparent' }}
          >
            {cols && (
              <>
                <div
                  data-bar-id={project.id}
                  className="absolute rounded overflow-hidden flex items-center"
                  style={{
                    top: curTop,
                    left: cols.start * colW + 4,
                    width: barWidth,
                    height: BAR_H,
                    backgroundColor: barColor + 'bb',
                    border: `1.5px solid ${barColor}`,
                    paddingLeft: 5,
                    paddingRight: 4,
                    cursor: readOnly ? 'default' : 'grab',
                  }}
                  onMouseDown={readOnly ? undefined : makeDragHandlers(project, 'move')}
                >
                  {!readOnly && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 rounded-l cursor-ew-resize"
                      onMouseDown={e => { e.stopPropagation(); makeDragHandlers(project, 'resize-left')(e) }}
                    />
                  )}
                  {dateFitsInside && (
                    <span
                      className="text-[10px] font-medium tabular-nums whitespace-nowrap leading-none pointer-events-none select-none"
                      style={{ color: '#fff', textShadow: '0 0 3px rgba(0,0,0,0.3)' }}
                    >
                      {dateText}
                    </span>
                  )}
                  {!readOnly && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 rounded-r cursor-ew-resize"
                      onMouseDown={e => { e.stopPropagation(); makeDragHandlers(project, 'resize-right')(e) }}
                    />
                  )}
                </div>

                {((!dateFitsInside && dateText) || project.team || project.pm) && (
                  <div
                    data-bar-meta-id={project.id}
                    className="absolute flex items-center gap-3 pointer-events-none"
                    style={{
                      left: cols.end * colW + 12,
                      top: curTop + BAR_H / 2,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    {!dateFitsInside && dateText && (
                      <span className="text-[10px] font-medium tabular-nums whitespace-nowrap text-muted-foreground">
                        {dateText}
                      </span>
                    )}
                    {project.team && (
                      <span className="text-[10px] font-medium whitespace-nowrap flex items-center gap-1 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: barColor }} />
                        {project.team}
                      </span>
                    )}
                    {project.pm && (
                      <span className="text-[10px] font-medium whitespace-nowrap flex items-center gap-1 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pmColorMap.get(project.pm) ?? 'var(--color-ink-300)' }} />
                        {project.pm}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      <div className="border-b border-border" style={{ height: PROJ_ROW_H }} />
    </div>
  )
}
