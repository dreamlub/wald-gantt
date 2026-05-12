'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { LogOut, Users, PanelLeft } from 'lucide-react'
import { GanttChart } from '@/components/gantt/GanttChart'
import { BoardSidebar } from '@/components/gantt/BoardSidebar'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { ProjectHistoryPanel } from '@/components/gantt/ProjectHistoryPanel'
import { TrashPanel } from '@/components/gantt/TrashPanel'
import { MemoPanel } from '@/components/gantt/MemoPanel'
import { InviteDialog } from '@/components/gantt/InviteDialog'
import { createClient } from '@/lib/supabase/client'
import {
  getOrCreateWorkspace,
  getBoards, addBoard, updateBoard, deleteBoard,
  getCategories, getProjects,
  addCategory, updateCategory, deleteCategory,
  addProject, updateProject, softDeleteProject,
  getProjectsGhostDates,
} from '@/lib/gantt-service'
import type { GhostDates } from '@/lib/gantt-service'
import type { GanttBoard, GanttCategory, GanttProject, GanttStatus, Workspace } from '@/types'

type DialogState =
  | { type: 'addProject'; categoryId: string }
  | { type: 'editProject'; project: GanttProject }
  | { type: 'invite' }
  | null

type UndoEntry =
  | { type: 'project'; prev: GanttProject }
  | { type: 'projects'; prevList: GanttProject[] }

const now = new Date()
const CUR_YEAR  = now.getFullYear()
const VIEW_START = `${CUR_YEAR - 1}-01`
const VIEW_END   = `${CUR_YEAR + 2}-12`

const CAT_COLORS = ['#a5b4fc', '#fdba74', '#86efac', '#93c5fd', '#f9a8d4', '#fde047', '#c4b5fd', '#7dd3fc']
const MAX_UNDO = 20

export default function HomePage() {
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

  // undoStack을 ref로도 유지 (keydown 클로저에서 최신값 참조)
  const undoStackRef = useRef<UndoEntry[]>([])
  undoStackRef.current = undoStack

  const projectsRef = useRef<GanttProject[]>([])
  projectsRef.current = projects

  const supabase = createClient()

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

  // Ctrl+Z / ⌘Z 단축키
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
    Promise.all([getCategories(selectedBoardId), getProjects(selectedBoardId)])
      .then(([cats, projs]) => { setCategories(cats); setProjects(projs) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedBoardId])

  async function handleToggleGhost(enabled: boolean) {
    if (!enabled) { setGhostDates(null); return }
    const ids = projects.map(p => p.id)
    const dates = await getProjectsGhostDates(ids)
    setGhostDates(dates)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // ── 보드 핸들러 ──────────────────────────────────────────

  async function handleAddBoard(name: string) {
    if (!workspace) return
    const board = await addBoard(workspace.id, name)
    setBoards(prev => [...prev, board])
    setSelectedBoardId(board.id)
  }

  async function handleRenameBoard(id: string, name: string) {
    const updated = await updateBoard(id, { name })
    setBoards(prev => prev.map(b => b.id === id ? updated : b))
  }

  async function handleDeleteBoard(id: string) {
    if (!confirm('보드를 삭제하면 모든 카테고리와 프로젝트가 삭제됩니다. 계속할까요?')) return
    await deleteBoard(id)
    setBoards(prev => {
      const next = prev.filter(b => b.id !== id)
      if (selectedBoardId === id) setSelectedBoardId(next[0]?.id ?? null)
      return next
    })
  }

  async function handleSelectBoard(id: string) {
    if (id === selectedBoardId) return
    setSelectedBoardId(id)
  }

  // ── 카테고리 핸들러 ───────────────────────────────────────

  async function handleAddCategory(name: string) {
    if (!workspace || !selectedBoardId) return
    const color = CAT_COLORS[categories.length % CAT_COLORS.length]
    const cat = await addCategory(selectedBoardId, workspace.id, name, color)
    setCategories(prev => [...prev, cat])
  }

  async function handleUpdateCategory(id: string, name: string) {
    const updated = await updateCategory(id, { name })
    setCategories(prev => prev.map(c => c.id === id ? updated : c))
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('카테고리와 포함된 프로젝트를 모두 삭제할까요?')) return
    await deleteCategory(id)
    setCategories(prev => prev.filter(c => c.id !== id))
    setProjects(prev => prev.filter(p => p.category_id !== id))
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
  }

  async function handleDeleteProject(id: string) {
    await softDeleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
    setTrashCount(c => c + 1)
  }

  async function handleSaveMemo(projectId: string, memo: string) {
    const updated = await updateProject(projectId, { memo: memo || null })
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    setMemoProject(updated)
  }

  function handleRestoreProject(project: GanttProject) {
    setProjects(prev => [...prev, project])
    setTrashCount(c => Math.max(0, c - 1))
  }

  async function handleUpdateProjectDates(id: string, startDate: string, endDate: string) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    const updated = await updateProject(id, { start_date: startDate, end_date: endDate })
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  async function handleUpdateProjectName(id: string, name: string) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    const updated = await updateProject(id, { name })
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  async function handleUpdateProjectStatus(id: string, status: GanttStatus) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    const updated = await updateProject(id, { status })
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  async function handleMoveProject(updates: { id: string; category_id: string; sort_order: number }[]) {
    const affected = projectsRef.current.filter(p => updates.some(u => u.id === p.id))
    if (affected.length > 0) pushUndo({ type: 'projects', prevList: affected })
    const updated = await Promise.all(
      updates.map(u => updateProject(u.id, { category_id: u.category_id, sort_order: u.sort_order }))
    )
    setProjects(prev => prev.map(p => updated.find(u => u.id === p.id) ?? p))
  }

  const selectedBoard = boards.find(b => b.id === selectedBoardId)

  if (loading && boards.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 헤더 */}
      <header className="h-12 bg-white border-b flex items-center px-4 gap-3 shrink-0 z-20">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
        >
          <PanelLeft size={16} />
        </button>
        <span className="font-semibold text-gray-900 text-sm">Wald Gantt</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setDialog({ type: 'invite' })}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
          >
            <Users size={14} />
            멤버 초대
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
          >
            <LogOut size={14} />
            로그아웃
          </button>
        </div>
      </header>

      {/* 바디: 사이드바 + 간트 */}
      <div className="flex flex-1 overflow-hidden">
        <BoardSidebar
          open={sidebarOpen}
          boards={boards}
          selectedId={selectedBoardId}
          onSelect={handleSelectBoard}
          onAdd={handleAddBoard}
          onRename={handleRenameBoard}
          onDelete={handleDeleteBoard}
          trashCount={trashCount}
          onOpenTrash={() => setTrashOpen(v => !v)}
        />

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
              사이드바에서 파일을 선택하거나 새로 만들어 보세요
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

      <InviteDialog
        open={dialog?.type === 'invite'}
        onClose={() => setDialog(null)}
        workspaceId={workspace?.id ?? ''}
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
