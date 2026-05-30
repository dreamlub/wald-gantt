'use client'

import { useCallback, useEffect, useState } from 'react'
import { GanttChart } from '@/components/gantt/GanttChart'
import { BoardSidebar } from '@/components/gantt/BoardSidebar'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { TrashPanel } from '@/components/gantt/TrashPanel'
import { ShareDialog } from '@/components/gantt/ShareDialog'
import { CategoryAddDialog } from '@/components/gantt/_CategoryAddDialog'
import { Button } from '@/components/ui/button'
import { CAT_COLORS, randomCatColor } from '@/components/gantt/_GanttRows'
import { kstYear } from '@/lib/kst'
import { useConfirm } from '@/hooks/use-confirm'
import { useUndoRedo } from '@/hooks/use-undo-redo'
import { useProjectWorkspace } from './_hooks/use-project-workspace'
import { useProjectBoardData } from './_hooks/use-project-board-data'
import { useProjectMutations } from './_hooks/use-project-mutations'
import type { DialogState } from './_hooks/project-types'

export default function GanttPage() {
  const { confirm: showConfirm, dialog: confirmDialog } = useConfirm()

  // 마운트 시 1회 계산 (현재 KST 연도 기준 뷰 범위). lazy init으로 render 중 시각 호출 회피.
  const [{ viewStart, viewEnd }] = useState(() => {
    const y = kstYear()
    return { viewStart: `${y - 1}-01`, viewEnd: `${y + 2}-12` }
  })

  const [dialog, setDialog]                   = useState<DialogState>(null)
  const [trashOpen, setTrashOpen]             = useState(false)
  const [addCatOpen, setAddCatOpen]           = useState(false)
  const [newCatName, setNewCatName]           = useState('')
  const [newCatColor, setNewCatColor]         = useState(CAT_COLORS[0])
  const closeTrash = useCallback(() => setTrashOpen(false), [])

  const {
    workspace,
    boards,
    setBoards,
    selectedBoardId,
    setSelectedBoardId,
    loading: workspaceLoading,
    loadError,
    loadWorkspace,
  } = useProjectWorkspace()

  const {
    categories,
    setCategories,
    projects,
    setProjects,
    trashCount,
    setTrashCount,
    loading: boardLoading,
    boardLoadError,
    loadBoardData,
  } = useProjectBoardData({
    selectedBoardId,
    onCloseTrash: closeTrash,
  })

  const { undoCount, redoCount, pushUndo, resetStacks, handleUndo, handleRedo, projectsRef, categoriesRef } = useUndoRedo({
    projects,
    categories,
    onProjectsChange: setProjects,
    onCategoriesChange: setCategories,
  })

  useEffect(() => {
    resetStacks()
  }, [resetStacks, selectedBoardId])

  const {
    handleAddBoard,
    handleRenameBoard,
    handleDeleteBoard,
    handleReorderBoards,
    handleAddCategory,
    handleUpdateCategory,
    handleDeleteCategory,
    handleSaveProject,
    handleDeleteProject,
    handleRestoreProject,
    handleUpdateProjectDates,
    handleUpdateProjectName,
    handleUpdateProjectStatus,
    handleMoveProject,
    handleMoveCategory,
  } = useProjectMutations({
    workspace,
    boards,
    setBoards,
    selectedBoardId,
    setSelectedBoardId,
    categories,
    setCategories,
    projects,
    setProjects,
    setTrashCount,
    dialog,
    showConfirm,
    pushUndo,
    projectsRef,
    categoriesRef,
  })

  const loading = workspaceLoading || boardLoading

  // 카테고리 추가 다이얼로그 열기 — 열 때 랜덤 색상 선택
  function openAddCategory() {
    setNewCatColor(randomCatColor(new Set(categories.map(c => c.color))))
    setAddCatOpen(true)
  }

  async function submitAddCat() {
    const name = newCatName.trim()
    if (name) await handleAddCategory(name, newCatColor)
    setNewCatName(''); setAddCatOpen(false)
  }

  const selectedBoard = boards.find(b => b.id === selectedBoardId)

  if (loading && boards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted">
        <div className="text-muted-foreground text-xs">로딩 중...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted p-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="text-sm font-medium text-foreground">프로젝트 보드를 불러오지 못했습니다</div>
          <div className="text-xs text-muted-foreground break-words">{loadError}</div>
          <Button size="sm" variant="outline" onClick={loadWorkspace}>
            다시 시도
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {confirmDialog}
      <BoardSidebar
        boards={boards}
        selectedId={selectedBoardId}
        onSelect={id => { if (id !== selectedBoardId) setSelectedBoardId(id) }}
        onAdd={handleAddBoard}
        onRename={handleRenameBoard}
        onDelete={handleDeleteBoard}
        onReorder={handleReorderBoards}
        trashCount={trashCount}
        onOpenTrash={() => setTrashOpen(v => !v)}
      />

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        <main className="flex-1 overflow-hidden bg-background">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-muted-foreground text-xs">로딩 중...</div>
            </div>
          ) : boardLoadError ? (
            <div className="h-full flex items-center justify-center p-6">
              <div className="max-w-sm text-center space-y-3">
                <div className="text-sm font-medium text-foreground">보드 데이터를 불러오지 못했습니다</div>
                <div className="text-xs text-muted-foreground break-words">{boardLoadError}</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (selectedBoardId) loadBoardData(selectedBoardId) }}
                >
                  다시 시도
                </Button>
              </div>
            </div>
          ) : selectedBoardId ? (
            <GanttChart
              categories={categories}
              projects={projects}
              viewStart={viewStart}
              viewEnd={viewEnd}
              boardName={selectedBoard?.name}
              undoCount={undoCount}
              onUndo={handleUndo}
              redoCount={redoCount}
              onRedo={handleRedo}
              onOpenAddCategory={openAddCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onAddProject={categoryId => setDialog({ type: 'addProject', categoryId })}
              onAddSubProject={(parentId, catId) => setDialog({ type: 'addProject', categoryId: catId, parentId })}
              onAddMilestone={catId => setDialog({ type: 'addProject', categoryId: catId, isMilestone: true })}
              onEditProject={project => setDialog({ type: 'editProject', project })}
              onDeleteProject={handleDeleteProject}
              onOpenMemo={project => setDialog({ type: 'editProject', project, initialTab: 'memo' })}
              onUpdateProjectDates={handleUpdateProjectDates}
              onUpdateProjectName={handleUpdateProjectName}
              onUpdateProjectStatus={handleUpdateProjectStatus}
              onMoveProject={handleMoveProject}
              onMoveCategory={handleMoveCategory}
              onShare={() => setDialog({ type: 'share' })}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
              사이드바에서 보드를 선택하거나 새로 만들어 보세요
            </div>
          )}
        </main>
      </div>

      {/* 프로젝트 폼 드로어 (portal overlay) */}
      <ProjectFormDialog
        open={dialog?.type === 'addProject' || dialog?.type === 'editProject'}
        onClose={() => setDialog(null)}
        onSave={handleSaveProject}
        categories={categories}
        defaultCategoryId={dialog?.type === 'addProject' ? dialog.categoryId : undefined}
        defaultParentId={dialog?.type === 'addProject' ? dialog.parentId : undefined}
        defaultIsMilestone={dialog?.type === 'addProject' ? dialog.isMilestone : undefined}
        editProject={dialog?.type === 'editProject' ? dialog.project : null}
        initialTab={dialog?.type === 'editProject' ? dialog.initialTab : undefined}
        onDelete={id => { handleDeleteProject(id); setDialog(null) }}
        allTeams={[...new Set(projects.map(p => p.team).filter(Boolean) as string[])].sort()}
        allPMs={[...new Set(projects.map(p => p.pm).filter(Boolean) as string[])].sort()}
        parentProjects={projects.filter(p => !p.parent_id && p.id !== (dialog?.type === 'editProject' ? dialog.project.id : ''))}
        subProjects={dialog?.type === 'editProject' ? projects.filter(p => p.parent_id === dialog.project.id) : []}
        onAddSubProject={dialog?.type === 'editProject' && !dialog.project.parent_id
          ? () => setDialog({ type: 'addProject', categoryId: dialog.project.category_id, parentId: dialog.project.id })
          : undefined}
      />

      <ShareDialog
        open={dialog?.type === 'share'}
        onClose={() => setDialog(null)}
        boardId={selectedBoardId ?? ''}
        boardName={selectedBoard?.name ?? ''}
      />

      <TrashPanel
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        boardId={selectedBoardId ?? ''}
        categories={categories}
        onRestore={handleRestoreProject}
      />

      <CategoryAddDialog
        open={addCatOpen}
        onOpenChange={open => { if (!open) { setAddCatOpen(false); setNewCatName('') } }}
        newCatName={newCatName}
        onNameChange={setNewCatName}
        newCatColor={newCatColor}
        onColorChange={setNewCatColor}
        onSubmit={submitAddCat}
      />
    </div>
  )
}
