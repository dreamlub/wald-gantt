import { dayOffset, dayOffsetInWeeks, type DayInfo, type WeekInfo } from '@/lib/gantt-utils'
import type { GanttProject } from '@/types'
import type { ViewMode } from './_GanttConstants'
import { isProjectOverdue, isStartDelayed } from './_GanttRows'

export type GanttSortMode = 'default' | 'start-asc' | 'end-desc' | 'priority-desc'

interface FilterState {
  searchQuery: string
  excludedTeams: Set<string>
  excludedPMs: Set<string>
  overdueFilter: boolean
  startDelayedFilter: boolean
  todayStr: string
}

interface OrderedProjectsOptions {
  catId: string
  projects: GanttProject[]
  liveItems: Record<string, string[]> | null
  sortMode: GanttSortMode
  collapsedParents: Set<string>
  filters: FilterState
}

interface BarColsOptions {
  project: GanttProject
  viewMode: ViewMode
  viewStart: string
  weeks: WeekInfo[]
  days: DayInfo[]
  totalCols: number
}

export function hasActiveGanttFilter(filters: FilterState): boolean {
  return filters.searchQuery.trim() !== '' ||
    filters.excludedTeams.size > 0 ||
    filters.excludedPMs.size > 0 ||
    filters.overdueFilter ||
    filters.startDelayedFilter
}

export function matchesGanttFilters(p: GanttProject, filters: FilterState): boolean {
  if (filters.searchQuery.trim() && !p.name.toLowerCase().includes(filters.searchQuery.toLowerCase())) return false
  if (filters.excludedTeams.size > 0 && filters.excludedTeams.has(p.team || '')) return false
  if (filters.excludedPMs.size > 0 && filters.excludedPMs.has(p.pm || '')) return false
  if (filters.overdueFilter || filters.startDelayedFilter) {
    const ok =
      (filters.overdueFilter && isProjectOverdue(p, filters.todayStr)) ||
      (filters.startDelayedFilter && isStartDelayed(p, filters.todayStr) && !isProjectOverdue(p, filters.todayStr))
    if (!ok) return false
  }
  return true
}

function sortedCategoryProjects(
  catId: string,
  projects: GanttProject[],
  liveItems: Record<string, string[]> | null,
  sortMode: GanttSortMode,
): GanttProject[] {
  let base: GanttProject[]
  if (sortMode === 'default' && liveItems) {
    const ids = liveItems[catId] ?? []
    const projMap = new Map(projects.map(p => [p.id, p]))
    base = ids.map(id => projMap.get(id)).filter((p): p is GanttProject => !!p)
  } else {
    base = projects.filter(p => p.category_id === catId)
  }

  if (liveItems) return base
  if (sortMode === 'start-asc')
    return [...base].sort((a, b) => (a.start_date ?? 'zzzz') < (b.start_date ?? 'zzzz') ? -1 : 1)
  if (sortMode === 'end-desc')
    return [...base].sort((a, b) => (a.end_date ?? '') > (b.end_date ?? '') ? -1 : 1)
  if (sortMode === 'priority-desc')
    return [...base].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return [...base].sort((a, b) => a.sort_order - b.sort_order)
}

export function orderedProjectsForCategory({
  catId,
  projects,
  liveItems,
  sortMode,
  collapsedParents,
  filters,
}: OrderedProjectsOptions): GanttProject[] {
  const childrenOf = (pid: string) =>
    projects.filter(c => c.parent_id === pid).sort((a, b) => a.sort_order - b.sort_order)
  const tops = sortedCategoryProjects(catId, projects, liveItems, sortMode).filter(p => !p.parent_id)

  return tops.flatMap(top => {
    const kids = childrenOf(top.id)
    if (!hasActiveGanttFilter(filters))
      return collapsedParents.has(top.id) ? [top] : [top, ...kids]

    const topMatches = matchesGanttFilters(top, filters)
    const matchedKids = kids.filter(p => matchesGanttFilters(p, filters))
    if (!topMatches && matchedKids.length === 0) return []
    if (collapsedParents.has(top.id)) return [top]
    return [top, ...(topMatches ? kids : matchedKids)]
  })
}

export function projectBarCols({
  project,
  viewMode,
  viewStart,
  weeks,
  days,
  totalCols,
}: BarColsOptions): { start: number; end: number } | null {
  if (project.is_milestone) {
    if (!project.end_date) return null
    if (viewMode === 'month') {
      const col = dayOffset(viewStart, project.end_date, 'start')
      if (col >= totalCols || col < 0) return null
      return { start: Math.max(0, col), end: Math.max(0, col) + 1 }
    }
    if (viewMode === 'week') {
      const col = dayOffsetInWeeks(weeks, project.end_date, 'start')
      if (col >= totalCols || col < 0) return null
      return { start: Math.max(0, col), end: Math.max(0, col) + 1 }
    }
    const ci = days.findIndex(d => d.key === project.end_date)
    if (ci < 0 || ci >= totalCols) return null
    return { start: ci, end: ci + 1 }
  }

  if (!project.start_date || !project.end_date) return null
  if (viewMode === 'month') {
    const s = dayOffset(viewStart, project.start_date, 'start')
    const e = dayOffset(viewStart, project.end_date, 'end')
    if (s >= totalCols || e <= 0) return null
    return { start: Math.max(0, s), end: Math.min(totalCols, e) }
  }
  if (viewMode === 'week') {
    const s = dayOffsetInWeeks(weeks, project.start_date, 'start')
    const e = dayOffsetInWeeks(weeks, project.end_date, 'end')
    if (s >= totalCols || e <= 0) return null
    return { start: Math.max(0, s), end: Math.min(totalCols, e) }
  }

  const si = days.findIndex(d => d.key === project.start_date)
  const ei = days.findIndex(d => d.key === project.end_date)
  const s = si >= 0 ? si : 0
  const e = ei >= 0 ? ei + 1 : days.length
  if (s >= totalCols || e <= 0) return null
  return { start: Math.max(0, s), end: Math.min(totalCols, e) }
}
