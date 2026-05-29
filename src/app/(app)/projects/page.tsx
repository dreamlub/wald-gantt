'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { GanttChart } from '@/components/gantt/GanttChart'
import { BoardSidebar } from '@/components/gantt/BoardSidebar'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { TrashPanel } from '@/components/gantt/TrashPanel'
import { ShareDialog } from '@/components/gantt/ShareDialog'
import { CategoryAddDialog } from '@/components/gantt/_CategoryAddDialog'
import { CAT_COLORS, randomCatColor } from '@/components/gantt/_GanttRows'
import {
  getOrCreateWorkspace,
  getBoards, addBoard, updateBoard, deleteBoard,
  getCategories, getProjects, getDeletedProjectsCount,
  addCategory, updateCategory, deleteCategory,
  addProject, updateProject, softDeleteProject, restoreProject,
} from '@/lib/gantt-service'
import type { GanttBoard, GanttCategory, GanttProject, GanttStatus, Priority, Workspace } from '@/types'
import { kstYear } from '@/lib/kst'
import { useConfirm } from '@/hooks/use-confirm'
import { useUndoRedo } from '@/hooks/use-undo-redo'

type DialogState =
  | { type: 'addProject'; categoryId: string; parentId?: string | null; isMilestone?: boolean }
  | { type: 'editProject'; project: GanttProject; initialTab?: 'info' | 'memo' | 'history' }
  | { type: 'share' }
  | null

export default function GanttPage() {
  const { confirm: showConfirm, dialog: confirmDialog } = useConfirm()

  // 마운트 시 1회 계산 (현재 KST 연도 기준 뷰 범위). lazy init으로 render 중 시각 호출 회피.
  const [{ viewStart, viewEnd }] = useState(() => {
    const y = kstYear()
    return { viewStart: `${y - 1}-01`, viewEnd: `${y + 2}-12` }
  })

  const [workspace, setWorkspace]             = useState<Workspace | null>(null)
  const [boards, setBoards]                   = useState<GanttBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [categories, setCategories]           = useState<GanttCategory[]>([])
  const [projects, setProjects]               = useState<GanttProject[]>([])
  const [dialog, setDialog]                   = useState<DialogState>(null)
  const [loading, setLoading]                 = useState(true)
  const [trashOpen, setTrashOpen]             = useState(false)
  const [trashCount, setTrashCount]           = useState(0)
  const [addCatOpen, setAddCatOpen]           = useState(false)
  const [newCatName, setNewCatName]           = useState('')
  const [newCatColor, setNewCatColor]         = useState(CAT_COLORS[0])

  const { undoCount, redoCount, pushUndo, resetStacks, handleUndo, handleRedo, projectsRef, categoriesRef } = useUndoRedo({
    projects,
    categories,
    onProjectsChange: setProjects,
    onCategoriesChange: setCategories,
  })

  const errMsg = (e: unknown) => e instanceof Error ? e.message : '오류가 발생했습니다.'

  // 1단계: 워크스페이스 + 보드 목록 로드
  const loadWorkspace = useCallback(async () => {
    try {
      const ws = await getOrCreateWorkspace()
      setWorkspace(ws)
      const boardList = await getBoards(ws.id)
      setBoards(boardList)
      if (boardList.length > 0) setSelectedBoardId(boardList[0].id)
    } catch {
      // 워크스페이스 로드 실패 — 빈 상태 유지
    }
  }, [])

  // 초기 1회: 워크스페이스/보드 로드 (외부 fetch → setState 의도된 패턴)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWorkspace()
  }, [loadWorkspace])

  // 2단계: 선택된 보드의 카테고리 + 프로젝트 로드 (외부 fetch → setState 의도된 패턴)
  useEffect(() => {
    if (!selectedBoardId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false)
      return
    }
    setLoading(true)
    resetStacks()
    setTrashOpen(false)
    Promise.all([getCategories(selectedBoardId), getProjects(selectedBoardId), getDeletedProjectsCount(selectedBoardId)])
      .then(([cats, projs, count]) => { setCategories(cats); setProjects(projs); setTrashCount(count) })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoardId])

  // 카테고리 추가 다이얼로그 열기 — 열 때 랜덤 색상 선택
  function openAddCategory() {
    setNewCatColor(randomCatColor(new Set(categories.map(c => c.color))))
    setAddCatOpen(true)
  }

  // ── 보드 핸들러 ──────────────────────────────────────────────

  async function handleAddBoard(name: string) {
    if (!workspace) return
    try {
      const board = await addBoard(workspace.id, name)
      setBoards(prev => [...prev, board])
      setSelectedBoardId(board.id)
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleRenameBoard(id: string, name: string) {
    try {
      const updated = await updateBoard(id, { name })
      setBoards(prev => prev.map(b => b.id === id ? updated : b))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleDeleteBoard(id: string) {
    const board = boards.find(b => b.id === id)
    if (!await showConfirm({
      title: `'${board?.name ?? '보드'}' 삭제`,
      description: '보드를 삭제하면 모든 카테고리와 프로젝트가 영구 삭제됩니다. 되돌릴 수 없어요.',
    })) return
    try {
      await deleteBoard(id)
      setBoards(prev => {
        const next = prev.filter(b => b.id !== id)
        if (selectedBoardId === id) setSelectedBoardId(next[0]?.id ?? null)
        return next
      })
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleReorderBoards(reordered: GanttBoard[]) {
    setBoards(reordered)
    try {
      await Promise.all(reordered.map((b, i) => updateBoard(b.id, { sort_order: i })))
    } catch (e) { toast.error(errMsg(e)) }
  }

  // ── 카테고리 핸들러 ──────────────────────────────────────────

  async function handleAddCategory(name: string, color: string) {
    if (!workspace || !selectedBoardId) return
    try {
      const cat = await addCategory(selectedBoardId, workspace.id, name, color)
      setCategories(prev => [...prev, cat])
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function submitAddCat() {
    const name = newCatName.trim()
    if (name) await handleAddCategory(name, newCatColor)
    setNewCatName(''); setAddCatOpen(false)
  }

  async function handleUpdateCategory(id: string, updates: { name?: string; color?: string }) {
    try {
      const updated = await updateCategory(id, updates)
      setCategories(prev => prev.map(c => c.id === id ? updated : c))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleDeleteCategory(id: string) {
    const cat = categories.find(c => c.id === id)
    if (!await showConfirm({
      title: `'${cat?.name ?? '카테고리'}' 삭제`,
      description: '포함된 프로젝트도 모두 영구 삭제됩니다. 되돌릴 수 없어요.',
    })) return
    try {
      await deleteCategory(id)
      setCategories(prev => prev.filter(c => c.id !== id))
      setProjects(prev => prev.filter(p => p.category_id !== id))
    } catch (e) { toast.error(errMsg(e)) }
  }

  // ── 프로젝트 핸들러 ──────────────────────────────────────────

  async function handleSaveProject(fields: {
    categoryId: string
    parentId: string | null
    name: string
    status: GanttStatus
    start_date: string | null
    end_date: string | null
    team: string | null
    pm: string | null
    memo: string | null
    priority: Priority
    progress: number
    is_milestone: boolean
  }) {
    if (!workspace || !selectedBoardId) return
    try {
      if (dialog?.type === 'editProject') {
        pushUndo({ type: 'project', prev: dialog.project })
        const updated = await updateProject(dialog.project.id, {
          category_id: fields.categoryId,
          name: fields.name,
          status: fields.status,
          start_date: fields.start_date,
          end_date: fields.end_date,
          team: fields.team,
          pm: fields.pm,
          memo: fields.memo,
          priority: fields.priority,
          progress: fields.progress,
          is_milestone: fields.is_milestone,
        })
        setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
      } else {
        const created = await addProject(selectedBoardId, workspace.id, fields.categoryId, fields.parentId ?? null, {
          name: fields.name,
          status: fields.status,
          start_date: fields.start_date,
          end_date: fields.end_date,
          team: fields.team,
          pm: fields.pm,
          memo: fields.memo,
          priority: fields.priority,
          progress: fields.progress,
          is_milestone: fields.is_milestone,
        })
        setProjects(prev => [...prev, created])
      }
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleDeleteProject(id: string) {
    const project  = projects.find(p => p.id === id)
    const children = projects.filter(p => p.parent_id === id)
    try {
      await softDeleteProject(id)
      await Promise.all(children.map(c => softDeleteProject(c.id)))
      setProjects(prev => prev.filter(p => p.id !== id && p.parent_id !== id))
      setTrashCount(c => c + 1 + children.length)
      toast('휴지통으로 이동했어요', {
        action: {
          label: '되돌리기',
          onClick: async () => {
            try {
              const restored = await restoreProject(id)
              setProjects(prev => [...prev, restored].sort((a, b) => a.sort_order - b.sort_order))
              setTrashCount(c => Math.max(0, c - 1))
            } catch (e) { toast.error(errMsg(e)) }
          },
        },
        description: project?.name,
      })
    } catch (e) { toast.error(errMsg(e)) }
  }

  function handleRestoreProject(project: GanttProject) {
    setProjects(prev => [...prev, project])
    setTrashCount(c => Math.max(0, c - 1))
  }

  async function handleUpdateProjectDates(id: string, startDate: string | null, endDate: string) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    try {
      const updated = await updateProject(id, { start_date: startDate, end_date: endDate })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleUpdateProjectName(id: string, name: string) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    try {
      const updated = await updateProject(id, { name })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleUpdateProjectStatus(id: string, status: GanttStatus) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    try {
      const updated = await updateProject(id, { status })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleMoveProject(updates: { id: string; category_id: string; sort_order: number }[]) {
    const affected = projectsRef.current.filter(p => updates.some(u => u.id === p.id))
    if (affected.length > 0) pushUndo({ type: 'projects', prevList: affected })
    // 부모가 카테고리를 이동하면 자식도 함께 이동
    const withChildren = [...updates]
    for (const u of updates) {
      const proj = projectsRef.current.find(p => p.id === u.id)
      if (proj && proj.category_id !== u.category_id) {
        projectsRef.current.filter(p => p.parent_id === u.id).forEach(child => {
          if (!withChildren.some(x => x.id === child.id))
            withChildren.push({ id: child.id, category_id: u.category_id, sort_order: child.sort_order })
        })
      }
    }
    // 옵티미스틱 반영 — 서버 응답 전 원위치로 튀는 현상 방지
    setProjects(prev => prev.map(p => {
      const u = withChildren.find(u => u.id === p.id)
      return u ? { ...p, category_id: u.category_id, sort_order: u.sort_order } : p
    }))
    try {
      const updated = await Promise.all(
        withChildren.map(u => updateProject(u.id, { category_id: u.category_id, sort_order: u.sort_order }))
      )
      setProjects(prev => prev.map(p => updated.find(u => u.id === p.id) ?? p))
    } catch (e) {
      toast.error(errMsg(e))
      setProjects(prev => prev.map(p => affected.find(a => a.id === p.id) ?? p)) // 롤백
    }
  }

  async function handleMoveCategory(updates: { id: string; sort_order: number }[]) {
    const affected = categoriesRef.current.filter(c => updates.some(u => u.id === c.id))
    if (affected.length > 0) pushUndo({ type: 'categories', prevList: affected })
    // 옵티미스틱 반영 + 실패 시 롤백 (프로젝트 이동과 동일)
    setCategories(prev => prev.map(c => {
      const u = updates.find(u => u.id === c.id)
      return u ? { ...c, sort_order: u.sort_order } : c
    }))
    try {
      const updated = await Promise.all(
        updates.map(u => updateCategory(u.id, { sort_order: u.sort_order }))
      )
      setCategories(prev => prev.map(c => updated.find(u => u.id === c.id) ?? c))
    } catch (e) {
      toast.error(errMsg(e))
      setCategories(prev => prev.map(c => affected.find(a => a.id === c.id) ?? c)) // 롤백
    }
  }

  const selectedBoard = boards.find(b => b.id === selectedBoardId)

  if (loading && boards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted">
        <div className="text-muted-foreground text-xs">로딩 중...</div>
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
