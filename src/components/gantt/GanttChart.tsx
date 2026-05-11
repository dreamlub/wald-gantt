'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { buildMonthRange, monthOffset, MONTH_LABELS } from '@/lib/gantt-utils'
import { StatusBadge } from './StatusBadge'
import type { GanttCategory, GanttProject } from '@/types'

interface Props {
  categories: GanttCategory[]
  projects: GanttProject[]
  viewStart: string
  viewEnd: string
  onAddCategory: () => void
  onEditCategory: (cat: GanttCategory) => void
  onDeleteCategory: (id: string) => void
  onAddProject: (categoryId: string, parentId?: string) => void
  onEditProject: (project: GanttProject) => void
  onDeleteProject: (id: string) => void
}

const COL_WIDTH = 56  // px per month column
const LABEL_WIDTH = 320 // px for left label column

export function GanttChart({
  categories, projects, viewStart, viewEnd,
  onAddCategory, onEditCategory, onDeleteCategory,
  onAddProject, onEditProject, onDeleteProject,
}: Props) {
  const months = buildMonthRange(viewStart, viewEnd)
  const totalCols = months.length
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Group projects by category and parent
  const topLevelByCategory = (catId: string) =>
    projects.filter(p => p.category_id === catId && !p.parent_id).sort((a, b) => a.sort_order - b.sort_order)

  const subtasksOf = (parentId: string) =>
    projects.filter(p => p.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order)

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function barCols(project: GanttProject) {
    if (!project.start_month || !project.end_month) return null
    const start = monthOffset(viewStart, project.start_month)
    const end = monthOffset(viewStart, project.end_month) + 1
    if (start >= totalCols || end <= 0) return null
    return { start: Math.max(0, start), end: Math.min(totalCols, end) }
  }

  function getCategoryColor(catId: string) {
    return categories.find(c => c.id === catId)?.color ?? '#6366f1'
  }

  // Group months by year for header
  const yearGroups: { year: number; count: number }[] = []
  for (const ym of months) {
    const year = parseInt(ym.split('-')[0])
    if (yearGroups.length === 0 || yearGroups[yearGroups.length - 1].year !== year) {
      yearGroups.push({ year, count: 1 })
    } else {
      yearGroups[yearGroups.length - 1].count++
    }
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `${LABEL_WIDTH}px repeat(${totalCols}, ${COL_WIDTH}px)`,
  }

  const today = new Date()
  const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const todayCol = monthOffset(viewStart, currentYM)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <h1 className="text-lg font-semibold text-gray-900">프로젝트 간트 차트</h1>
        <button
          onClick={onAddCategory}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          <Plus size={16} />
          카테고리 추가
        </button>
      </div>

      {/* Scrollable chart */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: LABEL_WIDTH + COL_WIDTH * totalCols }}>
          {/* Year header */}
          <div className="flex sticky top-0 z-20 bg-gray-50 border-b">
            <div
              className="shrink-0 border-r bg-gray-50 sticky left-0 z-30"
              style={{ width: LABEL_WIDTH }}
            />
            {yearGroups.map(({ year, count }) => (
              <div
                key={year}
                className="border-r text-center text-xs font-semibold text-gray-600 py-1.5"
                style={{ width: COL_WIDTH * count }}
              >
                {year}
              </div>
            ))}
          </div>

          {/* Month header */}
          <div className="flex sticky top-8 z-20 bg-gray-50 border-b">
            <div
              className="shrink-0 border-r bg-gray-50 sticky left-0 z-30 flex items-center px-3"
              style={{ width: LABEL_WIDTH }}
            >
              <span className="text-xs text-gray-400">프로젝트</span>
            </div>
            {months.map((ym, i) => {
              const isToday = ym === currentYM
              return (
                <div
                  key={ym}
                  className={`text-center text-xs py-1.5 border-r shrink-0 ${isToday ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-500'}`}
                  style={{ width: COL_WIDTH }}
                >
                  {MONTH_LABELS[parseInt(ym.split('-')[1]) - 1]}
                </div>
              )
            })}
          </div>

          {/* Rows */}
          {categories.map(cat => (
            <div key={cat.id}>
              {/* Category row */}
              <div className="flex border-b hover:bg-gray-50 group" style={{ minHeight: 36 }}>
                <div
                  className="shrink-0 sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-r flex items-center px-3 gap-1.5"
                  style={{ width: LABEL_WIDTH }}
                >
                  <button onClick={() => toggleCollapse(cat.id)} className="text-gray-400 hover:text-gray-600">
                    {collapsed.has(cat.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm font-bold text-gray-800 truncate">{cat.name}</span>
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onAddProject(cat.id)}
                      className="p-1 text-gray-400 hover:text-indigo-600"
                      title="프로젝트 추가"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => onEditCategory(cat)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => onDeleteCategory(cat.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {/* Empty grid cells */}
                {months.map((ym, i) => (
                  <div
                    key={ym}
                    className={`shrink-0 border-r ${ym === currentYM ? 'bg-indigo-50/40' : ''}`}
                    style={{ width: COL_WIDTH }}
                  />
                ))}
              </div>

              {/* Project rows */}
              {!collapsed.has(cat.id) && topLevelByCategory(cat.id).map(project => (
                <ProjectRows
                  key={project.id}
                  project={project}
                  subtasks={subtasksOf(project.id)}
                  months={months}
                  totalCols={totalCols}
                  viewStart={viewStart}
                  currentYM={currentYM}
                  color={getCategoryColor(project.category_id)}
                  collapsed={collapsed}
                  onToggle={toggleCollapse}
                  onAddSubtask={() => onAddProject(cat.id, project.id)}
                  onEdit={onEditProject}
                  onDelete={onDeleteProject}
                  barCols={barCols}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ProjectRowsProps {
  project: GanttProject
  subtasks: GanttProject[]
  months: string[]
  totalCols: number
  viewStart: string
  currentYM: string
  color: string
  collapsed: Set<string>
  onToggle: (id: string) => void
  onAddSubtask: () => void
  onEdit: (p: GanttProject) => void
  onDelete: (id: string) => void
  barCols: (p: GanttProject) => { start: number; end: number } | null
}

function ProjectRows({
  project, subtasks, months, totalCols, viewStart, currentYM,
  color, collapsed, onToggle, onAddSubtask, onEdit, onDelete, barCols
}: ProjectRowsProps) {
  const cols = barCols(project)
  const hasSubtasks = subtasks.length > 0

  return (
    <>
      {/* Project row */}
      <div
        className="flex border-b hover:bg-gray-50/80 group relative"
        style={{ minHeight: 36 }}
      >
        {/* Sticky label */}
        <div
          className="shrink-0 sticky left-0 z-10 bg-white group-hover:bg-gray-50/80 border-r flex items-center px-3 gap-1.5"
          style={{ width: 320 }}
        >
          <div className="w-4 shrink-0">
            {hasSubtasks && (
              <button onClick={() => onToggle(project.id)} className="text-gray-400 hover:text-gray-600">
                {collapsed.has(project.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
          </div>
          <span className="text-sm text-gray-700 truncate">{project.name}</span>
          <StatusBadge status={project.status} />
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onAddSubtask} className="p-1 text-gray-400 hover:text-indigo-600" title="서브태스크 추가">
              <Plus size={13} />
            </button>
            <button onClick={() => onEdit(project)} className="p-1 text-gray-400 hover:text-gray-600">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(project.id)} className="p-1 text-gray-400 hover:text-red-500">
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Grid cells + bar */}
        <div className="flex flex-1 relative items-center" style={{ minHeight: 36 }}>
          {months.map((ym) => (
            <div
              key={ym}
              className={`shrink-0 h-full border-r ${ym === currentYM ? 'bg-indigo-50/40' : ''}`}
              style={{ width: 56 }}
            />
          ))}
          {cols && (
            <div
              className="absolute top-1/2 -translate-y-1/2 flex items-center px-2 rounded text-white text-xs font-medium truncate h-6"
              style={{
                left: cols.start * 56,
                width: (cols.end - cols.start) * 56,
                backgroundColor: color,
              }}
              title={`${project.name} (${project.start_month} ~ ${project.end_month})`}
            >
              {(cols.end - cols.start) > 1 && project.name}
            </div>
          )}
        </div>
      </div>

      {/* Subtask rows */}
      {!collapsed.has(project.id) && subtasks.map(sub => {
        const subCols = barCols(sub)
        return (
          <div key={sub.id} className="flex border-b hover:bg-gray-50/50 group" style={{ minHeight: 32 }}>
            <div
              className="shrink-0 sticky left-0 z-10 bg-white group-hover:bg-gray-50/50 border-r flex items-center pl-8 pr-3 gap-1.5"
              style={{ width: 320 }}
            >
              <span className="text-gray-400 text-sm shrink-0">└</span>
              <span className="text-xs text-gray-600 truncate">{sub.name}</span>
              <StatusBadge status={sub.status} />
              <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onEdit(sub)} className="p-1 text-gray-400 hover:text-gray-600">
                  <Pencil size={12} />
                </button>
                <button onClick={() => onDelete(sub.id)} className="p-1 text-gray-400 hover:text-red-500">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <div className="flex flex-1 relative items-center" style={{ minHeight: 32 }}>
              {months.map((ym) => (
                <div
                  key={ym}
                  className={`shrink-0 h-full border-r ${ym === currentYM ? 'bg-indigo-50/40' : ''}`}
                  style={{ width: 56 }}
                />
              ))}
              {subCols && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 flex items-center px-2 rounded text-white text-xs truncate h-5"
                  style={{
                    left: subCols.start * 56,
                    width: (subCols.end - subCols.start) * 56,
                    backgroundColor: color,
                    opacity: 0.65,
                  }}
                  title={`${sub.name} (${sub.start_month} ~ ${sub.end_month})`}
                >
                  {(subCols.end - subCols.start) > 1 && sub.name}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
