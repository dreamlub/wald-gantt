'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchProjects } from '@/lib/gantt-service'
import { todayStrKST } from '@/lib/gantt-utils'
import type { GanttTask, Workspace } from '@/types'
import { ASSIGNEE_COLORS } from '../_constants'
import { isOverdue, isStartDelayed, isDueThisWeek, isDueNextWeek, overdueDays, daysDiff } from '../_utils'

export type QuickFilterKey = 'all' | 'overdue' | 'start-delayed' | 'due-today' | 'due-this-week' | 'due-next-week' | 'done'

export function useTaskFilters(workspace: Workspace | null, tasks: GanttTask[]) {
  const [filterProject,  setFilterProject]  = useState<string | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterLabel,    setFilterLabel]    = useState<string | null>(null)
  const [quickFilter,    setQuickFilter]    = useState<QuickFilterKey>('all')
  const [searchQuery,    setSearchQuery]    = useState('')
  const [searchOpen,     setSearchOpen]     = useState(false)
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const [assigneesExpanded, setAssigneesExpanded] = useState(false)
  const [hideDone, setHideDone] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('tasks:hideDone') === 'true'
  })

  const searchRef      = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem('tasks:hideDone', String(hideDone))
  }, [hideDone])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!searchRef.current?.contains(e.target as Node)) {
        if (!searchQuery) setSearchOpen(false)
      }
    }
    if (searchOpen) document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [searchOpen, searchQuery])

  // ── 통계 (tasks 변경 시만 재계산) ─────────────────────────
  const todayStr = todayStrKST()

  const stats = useMemo(() => {
    const overdueCount       = tasks.filter(t => isOverdue(t.due_date, t.status)).length
    const startDelayedCount  = tasks.filter(t => isStartDelayed(t.start_date, t.status) && !isOverdue(t.due_date, t.status)).length
    const dueTodayCount      = tasks.filter(t => t.due_date === todayStr && t.status !== 'done').length
    const dueThisWeekCount   = tasks.filter(t => isDueThisWeek(t.due_date) && t.status !== 'done').length
    const dueNextWeekCount   = tasks.filter(t => isDueNextWeek(t.due_date) && t.status !== 'done').length
    const doneCount          = tasks.filter(t => t.status === 'done').length
    return { overdueCount, startDelayedCount, dueTodayCount, dueThisWeekCount, dueNextWeekCount, doneCount }
  }, [tasks, todayStr])

  // ── 사이드바 데이터 (tasks 변경 시만 재계산) ───────────────
  const sidebarData = useMemo(() => {
    const projectMap = new Map<string, { name: string; count: number; colorIdx: number }>()
    tasks.forEach(t => t.projects?.forEach(p => {
      if (!projectMap.has(p.id)) projectMap.set(p.id, { name: p.name, count: 0, colorIdx: projectMap.size })
      projectMap.get(p.id)!.count++
    }))
    const sidebarProjects = [...projectMap.entries()].map(([id, v]) => ({ id, ...v }))

    const assigneeMap = new Map<string, { label: string; count: number }>()
    tasks.forEach(t => {
      const key = t.type === 'mine' ? '__mine__' : (t.assignee ?? '')
      if (!key) return
      const label = t.type === 'mine' ? '내 할일' : t.assignee!
      const cur = assigneeMap.get(key) ?? { label, count: 0 }
      assigneeMap.set(key, { ...cur, count: cur.count + 1 })
    })
    const allAssignees = [...assigneeMap.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count)

    const allLabels = [...new Set(tasks.flatMap(t => t.labels ?? []))].sort()

    const assigneeColorMap = new Map<string, string>()
    allAssignees.forEach(({ key }, i) => {
      assigneeColorMap.set(key, ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length])
    })

    const labelMap = new Map<string, number>()
    tasks.forEach(t => (t.labels ?? []).forEach(l => labelMap.set(l, (labelMap.get(l) ?? 0) + 1)))
    const sidebarLabels = [...labelMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

    return { sidebarProjects, allAssignees, allLabels, assigneeColorMap, sidebarLabels }
  }, [tasks])

  const ASSIGNEE_VISIBLE_LIMIT = 7
  const sidebarAssigneesFull = sidebarData.allAssignees
    .filter(a => !assigneeSearch || a.label.toLowerCase().includes(assigneeSearch.toLowerCase()))
  const isSearching = !!assigneeSearch.trim()
  const sidebarAssignees = (isSearching || assigneesExpanded)
    ? sidebarAssigneesFull
    : sidebarAssigneesFull.slice(0, ASSIGNEE_VISIBLE_LIMIT)
  const assigneesHidden = sidebarAssigneesFull.length - sidebarAssignees.length

  // ── 필터링 (필터 조건 + tasks 변경 시만 재계산) ────────────
  const filtered = useMemo(() => {
    let result = tasks
    // 완료 숨김 (단, '완료' 퀵필터 활성 시에는 무시)
    if (hideDone && quickFilter !== 'done') result = result.filter(t => t.status !== 'done')
    if (filterProject)   result = result.filter(t => t.projects?.some(p => p.id === filterProject))
    if (filterAssignee) {
      if (filterAssignee === '__mine__') result = result.filter(t => t.type === 'mine')
      else result = result.filter(t => t.assignee === filterAssignee)
    }
    const preLabel = result
    if (filterLabel) {
      const withLabel = result.filter(t => (t.labels ?? []).includes(filterLabel))
      const withLabelIds = new Set(withLabel.map(t => t.id))
      const subsOfMatched = result.filter(t => t.parent_id && withLabelIds.has(t.parent_id) && !withLabelIds.has(t.id))
      result = [...withLabel, ...subsOfMatched]
    }
    const baseFiltered = result
    if (quickFilter === 'overdue')       result = result.filter(t => isOverdue(t.due_date, t.status))
    if (quickFilter === 'start-delayed') result = result.filter(t => isStartDelayed(t.start_date, t.status) && !isOverdue(t.due_date, t.status))
    if (quickFilter === 'due-today')     result = result.filter(t => t.due_date === todayStr && t.status !== 'done')
    if (quickFilter === 'due-this-week') result = result.filter(t => isDueThisWeek(t.due_date) && t.status !== 'done')
    if (quickFilter === 'due-next-week') result = result.filter(t => isDueNextWeek(t.due_date) && t.status !== 'done')
    if (quickFilter === 'done')          result = result.filter(t => t.status === 'done')
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.assignee ?? '').toLowerCase().includes(q) ||
        (t.memo ?? '').toLowerCase().includes(q) ||
        (t.labels ?? []).some(l => l.toLowerCase().includes(q))
      )
    }
    // 필터로 하위 태스크만 남고 부모가 걸러진 경우: 부모도 포함
    if (quickFilter !== 'all' || searchQuery.trim() || !!filterLabel) {
      const filteredIds = new Set(result.map(t => t.id))
      const parentPool = filterLabel ? preLabel : baseFiltered
      const parentPoolIds = new Set(parentPool.map(t => t.id))
      const missingParentIds = new Set<string>()
      for (const t of result) {
        if (t.parent_id && !filteredIds.has(t.parent_id) && parentPoolIds.has(t.parent_id)) {
          missingParentIds.add(t.parent_id)
        }
      }
      if (missingParentIds.size > 0) {
        result = [...result, ...parentPool.filter(t => missingParentIds.has(t.id))]
      }
    }
    return result
  }, [tasks, filterProject, filterAssignee, filterLabel, quickFilter, searchQuery, todayStr, hideDone])

  // ── 파생 그룹 (filtered 변경 시만 재계산) ──────────────────
  const derivedGroups = useMemo(() => {
    const taskIdSet = new Set(tasks.map(t => t.id))
    const overdueGroup = filtered.filter(t => isOverdue(t.due_date, t.status) && (!t.parent_id || !taskIdSet.has(t.parent_id)))
    const overdueIds   = new Set(overdueGroup.map(t => t.id))
    const avgOverdueDays = overdueGroup.length
      ? Math.round(overdueGroup.reduce((s, t) => s + overdueDays(t.due_date), 0) / overdueGroup.length * 10) / 10
      : 0

    const ipGroup = filtered.filter(t => t.status === 'in-progress' && !overdueIds.has(t.id) && (!t.parent_id || !taskIdSet.has(t.parent_id)))
    const avgIPDays = ipGroup.length
      ? Math.round(ipGroup.reduce((s, t) => s + daysDiff(t.start_date), 0) / ipGroup.length * 10) / 10
      : 0

    return { overdueGroup, overdueIds, avgOverdueDays, avgIPDays, taskIdSet }
  }, [tasks, filtered])

  const getAssigneeKey = useCallback((t: GanttTask) => {
    return t.type === 'mine' ? '__mine__' : (t.assignee ?? '')
  }, [])

  const getGroup = useCallback((status: GanttTask['status']) => {
    return filtered.filter(t => t.status === status && !derivedGroups.overdueIds.has(t.id) && (!t.parent_id || !derivedGroups.taskIdSet.has(t.parent_id)))
  }, [filtered, derivedGroups])

  const getSubTasks = useCallback((parentId: string) => {
    return filtered.filter(t => t.parent_id === parentId)
  }, [filtered])

  const handleSearch = useCallback(
    async (query: string) => workspace ? searchProjects(workspace.id, query) : [],
    [workspace]
  )

  const hasFilter = quickFilter !== 'all' || !!filterProject || !!filterAssignee || !!filterLabel || !!searchQuery.trim()

  return {
    // 필터 상태
    filterProject, setFilterProject,
    filterAssignee, setFilterAssignee,
    filterLabel, setFilterLabel,
    quickFilter, setQuickFilter,
    searchQuery, setSearchQuery,
    searchOpen, setSearchOpen,
    searchRef, searchInputRef,
    assigneeSearch, setAssigneeSearch,
    assigneesExpanded, setAssigneesExpanded,
    hideDone, setHideDone,
    // 통계
    ...stats,
    // 사이드바 데이터
    sidebarProjects: sidebarData.sidebarProjects,
    sidebarAssignees, assigneesHidden, isSearching,
    assigneeColorMap: sidebarData.assigneeColorMap,
    allAssignees: sidebarData.allAssignees,
    allLabels: sidebarData.allLabels,
    sidebarLabels: sidebarData.sidebarLabels,
    // 필터링 결과
    filtered,
    overdueGroup: derivedGroups.overdueGroup,
    overdueIds: derivedGroups.overdueIds,
    avgOverdueDays: derivedGroups.avgOverdueDays,
    avgIPDays: derivedGroups.avgIPDays,
    hasFilter,
    // 헬퍼
    getAssigneeKey, getGroup, getSubTasks, handleSearch,
  }
}
