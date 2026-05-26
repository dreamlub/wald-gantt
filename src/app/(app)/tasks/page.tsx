'use client'

import React, { Suspense, useState } from 'react'
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog'
import { TaskTrashPanel } from '@/components/tasks/TaskTrashPanel'
import { TaskArchivePanel } from '@/components/tasks/TaskArchivePanel'
import type { GanttTask, TaskStatus } from '@/types'
import type { ViewType } from './_constants'

import { useTasksData } from './_hooks/use-tasks-data'
import { useTaskFilters } from './_hooks/use-task-filters'
import { useTaskDrag } from './_hooks/use-task-drag'
import { useTaskSelection } from './_hooks/use-task-selection'
import { useQuickAdd } from './_hooks/use-quick-add'

import { TasksSidebar } from './_components/tasks-sidebar'
import { TasksActionBar } from './_components/tasks-action-bar'
import { NormalView } from './_components/normal-view'
import { BulkActionBar } from './_components/bulk-action-bar'
import { ListView } from './_components/list-view'
import { CalendarView } from './_components/calendar-view'
import { GanttView } from './_components/gantt-view'
import { KanbanView } from './_components/kanban-view'
import { TaskDetailDrawer } from './_components/task-detail-drawer'

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-ink-400 text-xs">로딩 중...</div>}>
      <TasksPageContent />
    </Suspense>
  )
}

function TasksPageContent() {
  const data = useTasksData()
  const filters = useTaskFilters(data.workspace, data.tasks)
  const drag = useTaskDrag(data.tasks, data.setTasks, data.expandedParents, data.setExpandedParents, data.handleStatusChange, data.load)
  const selection = useTaskSelection(data.handleBulkDelete, data.handleBulkStatusChange)
  const quick = useQuickAdd(data.workspace, data.tasks, data.setExpandedParents, data.load)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [view,        setView]        = useState<ViewType>('basic')
  const [formOpen,    setFormOpen]    = useState(false)
  const [editTask,    setEditTask]    = useState<GanttTask | null>(null)
  const [trashOpen,   setTrashOpen]   = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('to-do')
  const [pendingParentId, setPendingParentId] = useState<string | null>(null)
  const [pendingDefaultProjects, setPendingDefaultProjects] = useState<{ id: string; name: string; board_name: string }[]>([])
  const [drawerTask,       setDrawerTask]       = useState<GanttTask | null>(null)
  const [drawerOpen,       setDrawerOpen]       = useState(false)
  const [drawerInitialTab, setDrawerInitialTab] = useState<'info' | 'memo' | 'history'>('info')

  function openAdd(status: TaskStatus) {
    setDefaultStatus(status); setEditTask(null); setPendingParentId(null); setFormOpen(true)
  }

  const editHandler     = (t: GanttTask) => { setDrawerTask(t); setDrawerInitialTab('info'); setDrawerOpen(true) }
  const editMemoHandler = (t: GanttTask) => { setDrawerTask(t); setDrawerInitialTab('memo'); setDrawerOpen(true) }

  if (data.loading) return (
    <div className="flex-1 flex items-center justify-center text-ink-400 text-xs">로딩 중...</div>
  )

  const listEmptyMsg = filters.quickFilter === 'overdue'       ? '지연된 태스크가 없어요 👍'
                     : filters.quickFilter === 'start-delayed' ? '시작 지연 태스크가 없어요 👍'
                     : filters.quickFilter === 'due-today'     ? '오늘 마감 태스크가 없어요'
                     : filters.quickFilter === 'due-this-week' ? '이번 주 마감 태스크가 없어요'
                     : filters.quickFilter === 'due-next-week' ? '다음 주 마감 태스크가 없어요'
                     : filters.quickFilter === 'done'          ? '완료된 태스크가 없어요'
                     : filters.hasFilter                       ? '조건에 맞는 태스크가 없어요'
                     : '태스크가 없어요'

  return (
    <div className="flex flex-1 overflow-hidden">
      <TasksSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        quickFilter={filters.quickFilter}
        onQuickFilterChange={filters.setQuickFilter}
        overdueCount={filters.overdueCount}
        startDelayedCount={filters.startDelayedCount}
        dueTodayCount={filters.dueTodayCount}
        dueThisWeekCount={filters.dueThisWeekCount}
        dueNextWeekCount={filters.dueNextWeekCount}
        doneCount={filters.doneCount}
        totalCount={data.tasks.length}
        projects={filters.sidebarProjects}
        filterProject={filters.filterProject}
        onFilterProjectChange={filters.setFilterProject}
        assignees={filters.sidebarAssignees}
        filterAssignee={filters.filterAssignee}
        onFilterAssigneeChange={filters.setFilterAssignee}
        assigneeSearch={filters.assigneeSearch}
        onAssigneeSearchChange={filters.setAssigneeSearch}
        assigneesExpanded={filters.assigneesExpanded}
        onAssigneesExpandedChange={filters.setAssigneesExpanded}
        assigneesHidden={filters.assigneesHidden}
        isSearching={filters.isSearching}
        assigneeColorMap={filters.assigneeColorMap}
        labels={filters.sidebarLabels}
        filterLabel={filters.filterLabel}
        onFilterLabelChange={filters.setFilterLabel}
        hideDone={filters.hideDone}
        onHideDoneChange={filters.setHideDone}
        archiveCount={data.archiveCount}
        onArchiveOpen={() => setArchiveOpen(true)}
        trashCount={data.trashCount}
        onTrashOpen={() => setTrashOpen(true)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TasksActionBar
          sidebarOpen={sidebarOpen}
          onSidebarOpen={() => setSidebarOpen(true)}
          view={view}
          onViewChange={(v) => { setView(v); if (v !== 'basic' && v !== 'listview') selection.exitSelectionMode() }}
          searchOpen={filters.searchOpen}
          onSearchOpenChange={filters.setSearchOpen}
          searchQuery={filters.searchQuery}
          onSearchQueryChange={filters.setSearchQuery}
          searchRef={filters.searchRef}
          searchInputRef={filters.searchInputRef}
          selectionMode={selection.selectionMode}
          onToggleSelection={() => { if (selection.selectionMode) selection.exitSelectionMode(); else selection.setSelectionMode(true) }}
          hideDone={filters.hideDone}
          onHideDoneChange={filters.setHideDone}
          onAdd={() => openAdd('to-do')}
          allAssignees={filters.allAssignees}
          filterAssignee={filters.filterAssignee}
          onFilterAssigneeChange={filters.setFilterAssignee}
        />

        {view === 'listview' ? (
          <ListView
            tasks={filters.filtered}
            assigneeColorMap={filters.assigneeColorMap}
            getAssigneeKey={filters.getAssigneeKey}
            onEdit={editHandler}
            onStatusChange={data.handleStatusChange}
            emptyMessage={listEmptyMsg}
            onQuickCreate={quick.listQuickCreate}
            onSubQuickCreate={quick.listSubQuickCreate}
            selectionMode={selection.selectionMode}
            selectedIds={selection.selectedIds}
            onSelect={selection.handleSelect}
          />
        ) : view === 'calendar' ? (
          <CalendarView tasks={filters.filtered} onEdit={editHandler} />
        ) : view === 'kanban' ? (
          <KanbanView
            tasks={filters.filtered}
            assigneeColorMap={filters.assigneeColorMap}
            getAssigneeKey={filters.getAssigneeKey}
            onEdit={editHandler}
            onStatusChange={data.handleStatusChange}
            onKanbanReorder={data.handleKanbanReorder}
            onQuickCreate={quick.listQuickCreate}
          />
        ) : view === 'gantt' ? (
          <GanttView tasks={filters.filtered} onEdit={editHandler} onDateChange={data.handleTaskDateChange} />
        ) : (
          <NormalView
            filtered={filters.filtered}
            hasFilter={filters.hasFilter}
            collapsed={data.collapsed}
            toggleCollapse={data.toggleCollapse}
            overdueGroup={filters.overdueGroup}
            avgOverdueDays={filters.avgOverdueDays}
            avgIPDays={filters.avgIPDays}
            getGroup={filters.getGroup}
            getSubTasks={filters.getSubTasks}
            draggingTask={drag.draggingTask}
            sensors={drag.sensors}
            collisionDetection={drag.collisionDetection}
            onDragStart={drag.handleDragStart}
            onDragOver={drag.handleDragOver}
            onDragEnd={drag.handleDragEnd}
            onDragCancel={drag.handleDragCancel}
            getSortableIds={drag.getSortableIds}
            onEdit={editHandler}
            onEditMemo={editMemoHandler}
            onDelete={data.handleDelete}
            onStatusChange={data.handleStatusChange}
            onAdd={openAdd}
            expandedParents={data.expandedParents}
            toggleExpanded={data.toggleExpanded}
            openAddSubTask={quick.openAddSubTask}
            quickAddStatus={quick.quickAddStatus}
            setQuickAddStatus={quick.setQuickAddStatus}
            quickAddParentId={quick.quickAddParentId}
            setQuickAddParentId={quick.setQuickAddParentId}
            quickAddTitle={quick.quickAddTitle}
            setQuickAddTitle={quick.setQuickAddTitle}
            commitQuickAdd={quick.commitQuickAdd}
            cancelQuickAdd={quick.cancelQuickAdd}
            commitQuickAddSub={quick.commitQuickAddSub}
            cancelQuickAddSub={quick.cancelQuickAddSub}
            selectionMode={selection.selectionMode}
            selectedIds={selection.selectedIds}
            onSelect={selection.handleSelect}
            assigneeColorMap={filters.assigneeColorMap}
            getAssigneeKey={filters.getAssigneeKey}
            quickFilter={filters.quickFilter}
          />
        )}
      </div>

      <TaskFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTask(null); setPendingDefaultProjects([]); setPendingParentId(null) }}
        onSave={async (fields, projectIds) => {
          await data.handleSave(fields, projectIds, pendingParentId)
          setPendingParentId(null)
          setPendingDefaultProjects([])
        }}
        editTask={editTask}
        parentTask={pendingParentId ? (data.tasks.find(t => t.id === pendingParentId) ?? null) : null}
        defaultStatus={defaultStatus}
        defaultProjects={pendingDefaultProjects}
        onSearchProjects={filters.handleSearch}
        assigneeSuggestions={filters.allAssignees.map(a => a.label).filter(Boolean)}
        labelSuggestions={filters.allLabels}
      />

      <TaskDetailDrawer
        open={drawerOpen}
        task={drawerTask}
        subTasks={drawerTask ? data.tasks.filter(t => t.parent_id === drawerTask.id) : []}
        parentTask={drawerTask?.parent_id ? (data.tasks.find(t => t.id === drawerTask.parent_id) ?? null) : null}
        initialTab={drawerInitialTab}
        onClose={() => setDrawerOpen(false)}
        onSave={data.handleDrawerSave}
        onDelete={data.handleDelete}
        onDuplicate={data.handleDuplicate}
        onAddSubTask={data.handleAddSubTask}
        onStatusChange={data.handleStatusChange}
        onSearchProjects={filters.handleSearch}
        assigneeSuggestions={filters.allAssignees.map(a => a.label).filter(Boolean)}
        labelSuggestions={filters.allLabels}
      />

      <TaskTrashPanel
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        workspaceId={data.workspace?.id ?? ''}
        onRestore={async () => { await data.load(); data.setTrashCount(prev => Math.max(0, prev - 1)) }}
      />

      <TaskArchivePanel
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        workspaceId={data.workspace?.id ?? ''}
        onUnarchive={async () => { await data.load(); data.setArchiveCount(prev => Math.max(0, prev - 1)) }}
      />

      {selection.selectionMode && (
        <BulkActionBar
          selectedCount={selection.selectedIds.size}
          bulkStatusOpen={selection.bulkStatusOpen}
          onBulkStatusOpenChange={selection.setBulkStatusOpen}
          onBulkStatusChange={selection.doBulkStatusChange}
          onBulkDelete={selection.doBulkDelete}
          onExit={selection.exitSelectionMode}
        />
      )}
    </div>
  )
}
