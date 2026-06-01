'use client'

import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDown, ChevronRight, Diamond, GripVertical, Palette, Plus, StickyNote, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { GanttCategory, GanttProject } from '@/types'
import { PRIORITY_META } from '@/app/(app)/tasks/_constants'
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
  collapsedParents: Set<string>
  onToggleCollapsed: (id: string) => void
  parentIds: Set<string>
  onAddSubProject?: (parentId: string, catId: string) => void
  onAddMilestone?: (catId: string, parentId?: string) => void
}

function ProjectRow({
  project, readOnly, isChild, todayStr,
  collapsedParents, onToggleCollapsed, hasChildren,
  onCycleStatus, onEditProject, onDeleteProject, onOpenMemo, onSetMemoHover,
  onAddSubProject, catId,
  listeners, isDragging,
}: {
  project: GanttProject
  readOnly: boolean
  isChild: boolean
  todayStr: string
  collapsedParents: Set<string>
  onToggleCollapsed: (id: string) => void
  hasChildren: boolean
  onCycleStatus: (p: GanttProject) => void
  onEditProject: (p: GanttProject) => void
  onDeleteProject: (id: string) => void
  onOpenMemo: (p: GanttProject) => void
  onSetMemoHover: (h: { text: string; x: number; y: number } | null) => void
  onAddSubProject?: (parentId: string, catId: string) => void
  catId: string
  listeners: ReturnType<typeof import('@dnd-kit/sortable').useSortable>['listeners']
  isDragging: boolean
}) {
  const isMilestone = project.is_milestone
  const isBacklog  = !isMilestone && project.status === 'backlog'
  const sm         = STATUS_META[project.status]
  const isCollapsed = collapsedParents.has(project.id)
  const indent     = isChild ? (readOnly ? 28 : 44) : 0

  return (
    <div className="relative" style={{ opacity: isDragging ? 0 : 1 }}>
      <div
        className={`flex items-center gap-1 group border-b pr-2 relative hover:bg-muted transition-colors ${isBacklog ? 'bg-ink-100' : 'bg-card'}`}
        style={{ height: PROJ_ROW_H, paddingLeft: isChild ? indent : 12 }}
      >
        {(project.priority ?? 0) > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 w-[3px]"
            style={{ backgroundColor: PRIORITY_META[project.priority!].color }}
          />
        )}
        {/* 드래그 핸들 (부모만, 읽기 전용 아닐 때) */}
        {!readOnly && !isChild && (
          <button
            {...listeners}
            className="shrink-0 cursor-grab touch-none p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => e.stopPropagation()}
            tabIndex={-1}
          >
            <GripVertical size={13} className="text-ink-300" />
          </button>
        )}

        {/* 마일스톤 다이아몬드 or 상태 점 */}
        {isMilestone ? (
          <Diamond size={13} className="shrink-0 text-lilac-500" fill="currentColor" />
        ) : (
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
        )}

        <span
          className="text-sm truncate min-w-0 cursor-pointer text-foreground"
          onClick={readOnly ? undefined : () => onEditProject(project)}
          title={project.name}
        >
          {project.name}
        </span>

        {!isChild && (
          hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleCollapsed(project.id)}
              className="shrink-0 w-5 h-5 flex items-center justify-center text-foreground/60 hover:text-foreground rounded"
              title={isCollapsed ? '펼치기' : '접기'}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span className="shrink-0 w-5" />
          )
        )}

        {!isMilestone && isProjectOverdue(project, todayStr) ? (
          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-status-late/10 text-status-late font-medium border border-status-late/15 whitespace-nowrap">
            지연 {daysBetween(project.end_date!, todayStr)}일
          </span>
        ) : !isMilestone && isStartDelayed(project, todayStr) ? (
          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-status-warn/10 text-status-warn font-medium border border-status-warn/15 whitespace-nowrap">
            시작 지연 {daysBetween(project.start_date!, todayStr)}일
          </span>
        ) : null}

        <span className="flex-1 min-w-0" />

        {!readOnly && (
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pl-8 pr-2">
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ background: 'linear-gradient(to left, var(--color-muted) 55%, transparent 100%)' }}
            />
            {/* 서브프로젝트 추가 (부모 프로젝트에만, 다이얼로그에서 마일스톤 전환 가능) */}
            {!isChild && onAddSubProject && (
              <button
                onClick={e => { e.stopPropagation(); onAddSubProject(project.id, catId) }}
                className="relative shrink-0 px-1.5 py-2.5 rounded text-ink-300 hover:text-lilac-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="서브프로젝트 추가"
              >
                <Plus size={11} />
              </button>
            )}
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
  )
}

export function GanttCategoryLeft({
  cat, catProjs, readOnly,
  editCatId, editCatVal, onEditCatValChange, onCommitEditCat, onCancelEditCat, onStartEditCat,
  onDeleteCategory, onUpdateCategory, onAddProject, onDeleteProject, onEditProject,
  onOpenMemo, onSetMemoHover, onCycleStatus, todayStr,
  collapsedParents, onToggleCollapsed, parentIds, onAddSubProject, onAddMilestone,
}: GanttCategoryLeftProps) {
  const parents  = catProjs.filter(p => !p.parent_id)
  const childMap = new Map<string, GanttProject[]>()
  catProjs.filter(p => p.parent_id).forEach(p => {
    const arr = childMap.get(p.parent_id!) ?? []
    arr.push(p)
    childMap.set(p.parent_id!, arr)
  })

  return (
    <SortableCatRow id={cat.id} disabled={readOnly}>
      {({ listeners }) => (
        <div data-row>
          {/* 카테고리 헤더 */}
          <div
            className="flex items-center group border-b"
            style={{ height: CAT_ROW_H, backgroundColor: 'var(--muted)' }}
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

          {/* 프로젝트 행 */}
          <SortableContext items={parents.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {parents.map(parent => {
              const hasChildren = parentIds.has(parent.id)
              const children    = childMap.get(parent.id) ?? []
              return (
                <SortableProjRow key={parent.id} id={parent.id} disabled={readOnly}>
                  {({ listeners: projListeners, isDragging }) => (
                    <>
                      <ProjectRow
                        project={parent}
                        readOnly={readOnly}
                        isChild={false}
                        todayStr={todayStr}
                        collapsedParents={collapsedParents}
                        onToggleCollapsed={onToggleCollapsed}
                        hasChildren={hasChildren}
                        onCycleStatus={onCycleStatus}
                        onEditProject={onEditProject}
                        onDeleteProject={onDeleteProject}
                        onOpenMemo={onOpenMemo}
                        onSetMemoHover={onSetMemoHover}
                        onAddSubProject={onAddSubProject}
                        catId={cat.id}
                        listeners={projListeners}
                        isDragging={isDragging}
                      />
                      {!collapsedParents.has(parent.id) && children.map(child => (
                        <ProjectRow
                          key={child.id}
                          project={child}
                          readOnly={readOnly}
                          isChild
                          todayStr={todayStr}
                          collapsedParents={collapsedParents}
                          onToggleCollapsed={onToggleCollapsed}
                          hasChildren={false}
                          onCycleStatus={onCycleStatus}
                          onEditProject={onEditProject}
                          onDeleteProject={onDeleteProject}
                          onOpenMemo={onOpenMemo}
                          onSetMemoHover={onSetMemoHover}
                          onAddSubProject={undefined}
                          catId={cat.id}
                          listeners={undefined}
                          isDragging={false}
                        />
                      ))}
                    </>
                  )}
                </SortableProjRow>
              )
            })}
          </SortableContext>

          {!readOnly && (
            <div className="border-b border-border flex" style={{ height: PROJ_ROW_H }}>
              <button
                onClick={() => onAddProject(cat.id)}
                className="h-full flex items-center gap-0.5 pl-3 pr-3 text-sm text-ink-300 hover:text-muted-foreground"
              >
                <Plus size={10} /> 프로젝트
              </button>
              {onAddMilestone && (
                <button
                  onClick={() => onAddMilestone(cat.id)}
                  className="h-full flex items-center gap-0.5 pr-3 text-sm text-ink-300 hover:text-muted-foreground"
                >
                  <Diamond size={10} /> 마일스톤
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </SortableCatRow>
  )
}
