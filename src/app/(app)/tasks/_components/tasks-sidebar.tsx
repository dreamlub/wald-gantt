'use client'

import {
  LayoutList, Search, Trash2, Archive,
} from 'lucide-react'
import { PROJECT_COLORS } from '../_constants'
import { LabelBadge } from './label-badge'
import type { QuickFilterKey } from '../_hooks/use-task-filters'

interface SidebarProject { id: string; name: string; count: number; colorIdx: number }
interface SidebarAssignee { key: string; label: string; count: number }
interface SidebarLabel { name: string; count: number }

interface TasksSidebarProps {
  // 퀵 필터
  quickFilter: QuickFilterKey
  onQuickFilterChange: (key: QuickFilterKey) => void
  overdueCount: number
  startDelayedCount: number
  dueTodayCount: number
  dueThisWeekCount: number
  dueNextWeekCount: number
  doneCount: number
  totalCount: number
  // 프로젝트
  projects: SidebarProject[]
  filterProject: string | null
  onFilterProjectChange: (id: string | null) => void
  // 담당자
  assignees: SidebarAssignee[]
  filterAssignee: string | null
  onFilterAssigneeChange: (key: string | null) => void
  assigneeSearch: string
  onAssigneeSearchChange: (v: string) => void
  assigneesExpanded: boolean
  onAssigneesExpandedChange: (v: boolean) => void
  assigneesHidden: number
  isSearching: boolean
  assigneeColorMap: Map<string, string>
  // 라벨
  labels: SidebarLabel[]
  filterLabel: string | null
  onFilterLabelChange: (name: string | null) => void
  // 완료 숨김
  hideDone: boolean
  onHideDoneChange: (v: boolean) => void
  // 아카이브
  archiveCount: number
  onArchiveOpen: () => void
  // 휴지통
  trashCount: number
  onTrashOpen: () => void
}

export function TasksSidebar({
  quickFilter, onQuickFilterChange,
  overdueCount, startDelayedCount, dueTodayCount, dueThisWeekCount, dueNextWeekCount, doneCount, totalCount,
  projects, filterProject, onFilterProjectChange,
  assignees, filterAssignee, onFilterAssigneeChange,
  assigneeSearch, onAssigneeSearchChange,
  assigneesExpanded, onAssigneesExpandedChange, assigneesHidden, isSearching,
  assigneeColorMap,
  labels, filterLabel, onFilterLabelChange,
  archiveCount, onArchiveOpen,
  trashCount, onTrashOpen,
}: TasksSidebarProps) {
  const quickItems = [
    { key: 'all' as const,           label: '전체',         count: totalCount,        icon: <LayoutList size={12} className="shrink-0" />,                             countColor: 'text-ink-400' },
    { key: 'overdue' as const,       label: '지연',          count: overdueCount,       icon: <span className="w-2 h-2 rounded-full bg-status-late shrink-0" />,        countColor: 'text-status-late font-medium' },
    { key: 'start-delayed' as const, label: '시작 지연',     count: startDelayedCount,  icon: <span className="w-2 h-2 rounded-full bg-status-warn shrink-0" />,     countColor: 'text-status-late font-medium' },
    { key: 'due-today' as const,     label: '오늘 마감',     count: dueTodayCount,      icon: <span className="w-2 h-2 rounded-full bg-coral-400 shrink-0" />,      countColor: 'text-status-late font-medium' },
    { key: 'due-this-week' as const, label: '이번 주 마감',  count: dueThisWeekCount,   icon: <span className="w-2 h-2 rounded-full bg-status-warn shrink-0" />,     countColor: 'text-status-late font-medium' },
    { key: 'due-next-week' as const, label: '다음 주 마감',  count: dueNextWeekCount,   icon: <span className="w-2 h-2 rounded-full bg-status-future shrink-0" />,         countColor: 'text-status-late font-medium' },
    { key: 'done' as const,          label: '완료',         count: doneCount,          icon: <span className="w-2 h-2 rounded-full bg-status-ok shrink-0" />,        countColor: 'text-status-ok font-medium' },
  ]

  return (
    <div
      className="shrink-0 border-r bg-muted flex flex-col overflow-hidden"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
        <h1 className="text-sm font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">Tasks</h1>
      </div>

      <div className="flex flex-col gap-0.5 p-2 overflow-y-auto flex-1 min-h-0">
        {/* 퀵 필터 */}
        {quickItems.map(item => (
          <button
            key={item.key}
            onClick={() => onQuickFilterChange(quickFilter === item.key && item.key !== 'all' ? 'all' : item.key)}
            className={`sidebar-btn w-full ${quickFilter === item.key ? 'sidebar-btn-active' : ''}`}
          >
            {item.icon}
            <span className="flex-1 text-left truncate text-sm">{item.label}</span>
            <span className={`text-sm ${item.count > 0 ? item.countColor : 'text-ink-400'}`}>
              {item.count}
            </span>
          </button>
        ))}

        {/* 프로젝트 */}
        {projects.length > 0 && (
          <div className="mt-3">
            <div className="px-2 mb-1 text-sm font-semibold text-foreground uppercase tracking-wider">프로젝트</div>
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => { onFilterProjectChange(filterProject === p.id ? null : p.id); onFilterAssigneeChange(null) }}
                className={`sidebar-btn ${filterProject === p.id ? 'sidebar-btn-active' : ''}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PROJECT_COLORS[p.colorIdx % PROJECT_COLORS.length] }} />
                <span className="flex-1 truncate text-left text-sm">{p.name}</span>
                <span className="text-sm text-ink-400">{p.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* 담당자 */}
        <div className="mt-3">
          <div className="px-2 mb-1 text-sm font-semibold text-foreground uppercase tracking-wider">담당자</div>
          <div className="relative mx-2 mb-1.5">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-300" />
            <input
              type="text"
              placeholder="이름 검색"
              value={assigneeSearch}
              onChange={e => onAssigneeSearchChange(e.target.value)}
              className="w-full text-sm pl-6 pr-2 py-1 border border-border rounded bg-card text-muted-foreground placeholder:text-ink-300 focus:outline-none focus:border-lilac-300"
            />
          </div>
          {assignees.map(a => (
            <button
              key={a.key}
              onClick={() => { onFilterAssigneeChange(filterAssignee === a.key ? null : a.key); onFilterProjectChange(null) }}
              className={`sidebar-btn ${filterAssignee === a.key ? 'sidebar-btn-active' : ''}`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: assigneeColorMap.get(a.key) ?? 'var(--color-ink-300)' }}
              />
              <span className="flex-1 truncate text-left text-sm">{a.label}</span>
              <span className="text-sm text-ink-400">{a.count}</span>
            </button>
          ))}
          {!isSearching && (assigneesHidden > 0 || assigneesExpanded) && (
            <button
              onClick={() => onAssigneesExpandedChange(!assigneesExpanded)}
              className="w-full text-left px-2 py-1 text-2xs text-ink-400 hover:text-lilac-500 transition-colors"
            >
              {assigneesExpanded ? '접기' : `+ ${assigneesHidden}명 더보기`}
            </button>
          )}
        </div>

        {/* 라벨 */}
        {labels.length > 0 && (
          <div className="mt-3">
            <div className="px-2 mb-1.5 text-sm font-semibold text-foreground uppercase tracking-wider">라벨</div>
            <div className="flex flex-wrap gap-1 px-2">
              {labels.map(l => (
                <LabelBadge
                  key={l.name}
                  variant="filter"
                  name={l.name}
                  count={l.count}
                  active={filterLabel === l.name}
                  onClick={() => { onFilterLabelChange(filterLabel === l.name ? null : l.name); onFilterProjectChange(null); onFilterAssigneeChange(null) }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 아카이브 + 휴지통 */}
      <div className="shrink-0 border-t px-1.5 py-1.5 flex flex-col gap-0.5">
        <button
          onClick={onArchiveOpen}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-ink-400 hover:text-muted-foreground hover:bg-muted rounded-md transition-colors"
        >
          <Archive size={13} className="shrink-0" />
          <span className="whitespace-nowrap">아카이브</span>
          {archiveCount > 0 && (
            <span className="ml-auto text-3xs bg-ink-300/15 text-ink-400 font-semibold px-1.5 py-0.5 rounded-full">
              {archiveCount}
            </span>
          )}
        </button>
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
