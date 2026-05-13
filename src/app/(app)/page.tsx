'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Link2, PanelLeftOpen } from 'lucide-react'
import { toast } from 'sonner'
import { GanttChart } from '@/components/gantt/GanttChart'
import { BoardSidebar } from '@/components/gantt/BoardSidebar'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { ProjectHistoryPanel } from '@/components/gantt/ProjectHistoryPanel'
import { TrashPanel } from '@/components/gantt/TrashPanel'
import { MemoPanel } from '@/components/gantt/MemoPanel'
import { ShareDialog } from '@/components/gantt/ShareDialog'
import { createClient } from '@/lib/supabase/client'
import {
  getOrCreateWorkspace,
  getBoards, addBoard, updateBoard, deleteBoard,
  getCategories, getProjects, getDeletedProjectsCount,
  addCategory, updateCategory, deleteCategory,
  addProject, updateProject, softDeleteProject,
  getProjectsGhostDates,
} from '@/lib/gantt-service'
import type { GhostDates } from '@/lib/gantt-service'
import type { GanttBoard, GanttCategory, GanttProject, GanttStatus, Workspace } from '@/types'

type DialogState =
  | { type: 'addProject'; categoryId: string }
  | { type: 'editProject'; project: GanttProject }
  | { type: 'share' }
  | null

type UndoEntry =
  | { type: 'project'; prev: GanttProject }
  | { type: 'projects'; prevList: GanttProject[] }

const now = new Date()
const CUR_YEAR   = now.getFullYear()
const VIEW_START = `${CUR_YEAR - 1}-01`
const VIEW_END   = `${CUR_YEAR + 2}-12`

const CAT_COLORS = ['#a5b4fc', '#fdba74', '#86efac', '#93c5fd', '#f9a8d4', '#fde047', '#c4b5fd', '#7dd3fc']
const MAX_UNDO = 20

export default function GanttPage() {
  const [workspace, setWorkspace]             = useState<Workspace | null>(null)
  const [boards, setBoards]                   = useState<GanttBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [categories, setCategories]           = useState<GanttCategory[]>([])
  const [projects, setProjects]               = useState<GanttProject[]>([])
  const [dialog, setDialog]                   = useState<DialogState>(null)
  const [sidebarOpen, setSidebarOpen]         = useState(true)
  const [historyProject, setHistoryProject]   = useState<GanttProject | null>(null)
  const [memoProject, setMemoProject]         = useState<GanttProject | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [ghostDates, setGhostDates]           = useState<GhostDates | null>(null)
  const [undoStack, setUndoStack]             = useState<UndoEntry[]>([])
  const [trashOpen, setTrashOpen]             = useState(false)
  const [trashCount, setTrashCount]           = useState(0)

  const undoStackRef = useRef<UndoEntry[]>([])
  undoStackRef.current = undoStack

  const projectsRef = useRef<GanttProject[]>([])
  projectsRef.current = projects

  function pushUndo(entry: UndoEntry) {
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), entry])
  }

  // ── Undo ─────────────────────────────────────────────────
  const handleUndo = useCallback(async () => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const top = stack[stack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))

    if (top.type === 'project') {
      const p = top.prev
      const restored = await updateProject(p.id, {
        name: p.name, status: p.status,
        start_date: p.start_date, end_date: p.end_date,
        category_id: p.category_id, team: p.team, pm: p.pm,
      })
      setProjects(prev => prev.map(x => x.id === restored.id ? restored : x))
    } else {
      const restored = await Promise.all(
        top.prevList.map(p => updateProject(p.id, { category_id: p.category_id, sort_order: p.sort_order }))
      )
      setProjects(prev => prev.map(p => restored.find(r => r.id === p.id) ?? p))
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])

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
    setGhostDates(null)
    setUndoStack([])
    setTrashOpen(false)
    Promise.all([getCategories(selectedBoardId), getProjects(selectedBoardId), getDeletedProjectsCount(selectedBoardId)])
      .then(([cats, projs, count]) => { setCategories(cats); setProjects(projs); setTrashCount(count) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedBoardId])

  async function handleToggleGhost(enabled: boolean) {
    if (!enabled) { setGhostDates(null); return }
    const ids = projects.map(p => p.id)
    const dates = await getProjectsGhostDates(ids)
    setGhostDates(dates)
  }

  const errMsg = (e: unknown) => e instanceof Error ? e.message : '오류가 발생했습니다.'

  // ── 보드 핸들러 ──────────────────────────────────────────

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
    if (!confirm('보드를 삭제하면 모든 카테고리와 프로젝트가 삭제됩니다. 계속할까요?')) return
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

  async function handleSelectBoard(id: string) {
    if (id === selectedBoardId) return
    setSelectedBoardId(id)
  }

  // ── 카테고리 핸들러 ───────────────────────────────────────

  async function handleAddCategory(name: string) {
    if (!workspace || !selectedBoardId) return
    try {
      const color = CAT_COLORS[categories.length % CAT_COLORS.length]
      const cat = await addCategory(selectedBoardId, workspace.id, name, color)
      setCategories(prev => [...prev, cat])
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleUpdateCategory(id: string, name: string) {
    try {
      const updated = await updateCategory(id, { name })
      setCategories(prev => prev.map(c => c.id === id ? updated : c))
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('카테고리와 포함된 프로젝트를 모두 삭제할까요?')) return
    try {
      await deleteCategory(id)
      setCategories(prev => prev.filter(c => c.id !== id))
      setProjects(prev => prev.filter(p => p.category_id !== id))
    } catch (e) { toast.error(errMsg(e)) }
  }

  // ── 프로젝트 핸들러 ───────────────────────────────────────

  async function handleSaveProject(fields: {
    categoryId: string
    parentId: string | null
    name: string
    status: GanttStatus
    start_date: string | null
    end_date: string | null
    team: string | null
    pm: string | null
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
        })
        setProjects(prev => [...prev, created])
      }
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleDeleteProject(id: string) {
    try {
      await softDeleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      setTrashCount(c => c + 1)
    } catch (e) { toast.error(errMsg(e)) }
  }

  async function handleSaveMemo(projectId: string, memo: string) {
    try {
      const updated = await updateProject(projectId, { memo: memo || null })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
      setMemoProject(updated)
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

  const selectedBoard = boards.find(b => b.id === selectedBoardId)

  if (loading && boards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <BoardSidebar
        open={sidebarOpen}
        boards={boards}
        selectedId={selectedBoardId}
        onSelect={handleSelectBoard}
        onAdd={handleAddBoard}
        onRename={handleRenameBoard}
        onDelete={handleDeleteBoard}
        onReorder={handleReorderBoards}
        onToggle={() => setSidebarOpen(v => !v)}
        trashCount={trashCount}
        onOpenTrash={() => setTrashOpen(v => !v)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 간트 전용 thin toolbar */}
        <div className="h-10 border-b bg-white flex items-center px-3 gap-2 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="사이드바 열기"
            >
              <PanelLeftOpen size={15} />
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setDialog({ type: 'share' })}
            disabled={!selectedBoardId}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Link2 size={13} />
            공유
          </button>
        </div>

        <main className="flex-1 overflow-hidden bg-white">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-gray-400 text-sm">로딩 중...</div>
            </div>
          ) : selectedBoardId ? (
            <GanttChart
              categories={categories}
              projects={projects}
              viewStart={VIEW_START}
              viewEnd={VIEW_END}
              boardName={selectedBoard?.name}
              ghostDates={ghostDates}
              onToggleGhost={handleToggleGhost}
              undoCount={undoStack.length}
              onUndo={handleUndo}
              onAddCategory={handleAddCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onAddProject={categoryId => setDialog({ type: 'addProject', categoryId })}
              onEditProject={project => setDialog({ type: 'editProject', project })}
              onDeleteProject={handleDeleteProject}
              onShowHistory={setHistoryProject}
              onOpenMemo={setMemoProject}
              onUpdateProjectDates={handleUpdateProjectDates}
              onUpdateProjectName={handleUpdateProjectName}
              onUpdateProjectStatus={handleUpdateProjectStatus}
              onMoveProject={handleMoveProject}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
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
      />

      <ShareDialog
        open={dialog?.type === 'share'}
        onClose={() => setDialog(null)}
        boardId={selectedBoardId ?? ''}
        boardName={selectedBoard?.name ?? ''}
      />

      <ProjectHistoryPanel
        project={historyProject}
        onClose={() => setHistoryProject(null)}
      />

      <MemoPanel
        project={memoProject}
        onClose={() => setMemoProject(null)}
        onSave={handleSaveMemo}
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
