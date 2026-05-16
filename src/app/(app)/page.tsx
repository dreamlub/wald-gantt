'use client'

import { useEffect, useState, useCallback } from 'react'
import { Link2, PanelLeftOpen } from 'lucide-react'
import { toast } from 'sonner'
import { GanttChart } from '@/components/gantt/GanttChart'
import { BoardSidebar } from '@/components/gantt/BoardSidebar'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { TrashPanel } from '@/components/gantt/TrashPanel'
import { ShareDialog } from '@/components/gantt/ShareDialog'
import {
  getOrCreateWorkspace,
  getBoards, addBoard, updateBoard, deleteBoard,
  getCategories, getProjects, getDeletedProjectsCount,
  addCategory, updateCategory, deleteCategory,
  addProject, updateProject, softDeleteProject, restoreProject,
} from '@/lib/gantt-service'
import type { GanttBoard, GanttCategory, GanttProject, GanttStatus, Priority, Workspace } from '@/types'
import { useConfirm } from '@/hooks/use-confirm'
import { useUndoRedo } from '@/hooks/use-undo-redo'

type DialogState =
  | { type: 'addProject'; categoryId: string }
  | { type: 'editProject'; project: GanttProject; initialTab?: 'info' | 'memo' | 'history' }
  | { type: 'share' }
  | null

const CUR_YEAR   = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear()
const VIEW_START = `${CUR_YEAR - 1}-01`
const VIEW_END   = `${CUR_YEAR + 2}-12`

export default function GanttPage() {
  const { confirm: showConfirm, dialog: confirmDialog } = useConfirm()

  const [workspace, setWorkspace]             = useState<Workspace | null>(null)
  const [boards, setBoards]                   = useState<GanttBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [categories, setCategories]           = useState<GanttCategory[]>([])
  const [projects, setProjects]               = useState<GanttProject[]>([])
  const [dialog, setDialog]                   = useState<DialogState>(null)
  const [sidebarOpen, setSidebarOpen]         = useState(true)
  const [loading, setLoading]                 = useState(true)
  const [trashOpen, setTrashOpen]             = useState(false)
  const [trashCount, setTrashCount]           = useState(0)

  const { undoCount, redoCount, pushUndo, resetStacks, handleUndo, handleRedo, projectsRef } = useUndoRedo({
    projects,
    onProjectsChange: setProjects,
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
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { loadWorkspace() }, [loadWorkspace])

  // 2단계: 선택된 보드의 카테고리 + 프로젝트 로드
  useEffect(() => {
    if (!selectedBoardId) { setLoading(false); return }
    setLoading(true)
    resetStacks()
    setTrashOpen(false)
    Promise.all([getCategories(selectedBoardId), getProjects(selectedBoardId), getDeletedProjectsCount(selectedBoardId)])
      .then(([cats, projs, count]) => { setCategories(cats); setProjects(projs); setTrashCount(count) })
      .catch(console.error)
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoardId])

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
        })
        setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
      } else {
        const created = await addProject(selectedBoardId, workspace.id, fields.categoryId, null, {
          name: fields.name,
          status: fields.status,
          start_date: fields.start_date,
          end_date: fields.end_date,
          team: fields.team,
          pm: fields.pm,
          priority: fields.priority,
        })
        setProjects(prev => [...prev, created])
      }
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleDeleteProject(id: string) {
    const project = projects.find(p => p.id === id)
    try {
      await softDeleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      setTrashCount(c => c + 1)
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

  async function handleUpdateProjectDates(id: string, startDate: string, endDate: string) {
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
    try {
      const updated = await Promise.all(
        updates.map(u => updateProject(u.id, { category_id: u.category_id, sort_order: u.sort_order }))
      )
      setProjects(prev => prev.map(p => updated.find(u => u.id === p.id) ?? p))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleMoveCategory(updates: { id: string; sort_order: number }[]) {
    try {
      const updated = await Promise.all(
        updates.map(u => updateCategory(u.id, { sort_order: u.sort_order }))
      )
      setCategories(prev => prev.map(c => updated.find(u => u.id === c.id) ?? c))
    } catch (e) { toast.error(errMsg(e)) }
  }

  const selectedBoard = boards.find(b => b.id === selectedBoardId)

  if (loading && boards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted">
        <div className="text-muted-foreground text-sm">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {confirmDialog}
      <BoardSidebar
        open={sidebarOpen}
        boards={boards}
        selectedId={selectedBoardId}
        onSelect={id => { if (id !== selectedBoardId) setSelectedBoardId(id) }}
        onAdd={handleAddBoard}
        onRename={handleRenameBoard}
        onDelete={handleDeleteBoard}
        onReorder={handleReorderBoards}
        onToggle={() => setSidebarOpen(v => !v)}
        trashCount={trashCount}
        onOpenTrash={() => setTrashOpen(v => !v)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="h-12 border-b bg-card flex items-center px-3 gap-2 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="사이드바 열기"
            >
              <PanelLeftOpen size={15} />
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setDialog({ type: 'share' })}
            disabled={!selectedBoardId}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Link2 size={13} />
            공유
          </button>
        </div>

        <main className="flex-1 overflow-hidden bg-background">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-muted-foreground text-sm">로딩 중...</div>
            </div>
          ) : selectedBoardId ? (
            <GanttChart
              categories={categories}
              projects={projects}
              viewStart={VIEW_START}
              viewEnd={VIEW_END}
              boardName={selectedBoard?.name}
              undoCount={undoCount}
              onUndo={handleUndo}
              redoCount={redoCount}
              onRedo={handleRedo}
              onAddCategory={handleAddCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onAddProject={categoryId => setDialog({ type: 'addProject', categoryId })}
              onEditProject={project => setDialog({ type: 'editProject', project })}
              onDeleteProject={handleDeleteProject}
              onShowHistory={() => {}}
              onOpenMemo={project => setDialog({ type: 'editProject', project, initialTab: 'memo' })}
              onUpdateProjectDates={handleUpdateProjectDates}
              onUpdateProjectName={handleUpdateProjectName}
              onUpdateProjectStatus={handleUpdateProjectStatus}
              onMoveProject={handleMoveProject}
              onMoveCategory={handleMoveCategory}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              사이드바에서 보드를 선택하거나 새로 만들어 보세요
            </div>
          )}
        </main>
      </div>

      <ProjectFormDialog
        open={dialog?.type === 'addProject' || dialog?.type === 'editProject'}
        onClose={() => setDialog(null)}
        onSave={handleSaveProject}
        categories={categories}
        defaultCategoryId={dialog?.type === 'addProject' ? dialog.categoryId : undefined}
        editProject={dialog?.type === 'editProject' ? dialog.project : null}
        initialTab={dialog?.type === 'editProject' ? dialog.initialTab : undefined}
        onDelete={id => { handleDeleteProject(id); setDialog(null) }}
        allTeams={[...new Set(projects.map(p => p.team).filter(Boolean) as string[])].sort()}
        allPMs={[...new Set(projects.map(p => p.pm).filter(Boolean) as string[])].sort()}
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
    </div>
  )
}
