import { toast } from 'sonner'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  addBoard,
  addCategory,
  addProject,
  deleteBoard,
  deleteCategory,
  restoreProject,
  softDeleteProject,
  updateBoard,
  updateCategory,
  updateProject,
} from '@/lib/gantt-service'
import type { GanttBoard, GanttCategory, GanttProject, GanttStatus, Workspace } from '@/types'
import { contextualErr } from './project-errors'
import type { DialogState, ProjectFormFields } from './project-types'
import { includeChildProjectMoves, type ProjectMoveUpdate } from './project-move'

interface Params {
  workspace: Workspace | null
  boards: GanttBoard[]
  setBoards: Dispatch<SetStateAction<GanttBoard[]>>
  selectedBoardId: string | null
  setSelectedBoardId: Dispatch<SetStateAction<string | null>>
  categories: GanttCategory[]
  setCategories: Dispatch<SetStateAction<GanttCategory[]>>
  projects: GanttProject[]
  setProjects: Dispatch<SetStateAction<GanttProject[]>>
  setTrashCount: Dispatch<SetStateAction<number>>
  dialog: DialogState
  showConfirm: (options: { title: string; description: string }) => Promise<boolean>
  pushUndo: (entry:
    | { type: 'project'; prev: GanttProject }
    | { type: 'projects'; prevList: GanttProject[] }
    | { type: 'categories'; prevList: GanttCategory[] }
  ) => void
  projectsRef: MutableRefObject<GanttProject[]>
  categoriesRef: MutableRefObject<GanttCategory[]>
}

export function useProjectMutations({
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
}: Params) {
  const toastActionError = (label: string, e: unknown) => toast.error(contextualErr(label, e))

  async function handleAddBoard(name: string) {
    if (!workspace) return
    try {
      const board = await addBoard(workspace.id, name)
      setBoards(prev => [...prev, board])
      setSelectedBoardId(board.id)
    } catch (e) { toastActionError('보드를 추가하지 못했습니다', e) }
  }

  async function handleRenameBoard(id: string, name: string) {
    try {
      const updated = await updateBoard(id, { name })
      setBoards(prev => prev.map(b => b.id === id ? updated : b))
    } catch (e) { toastActionError('보드 이름을 바꾸지 못했습니다', e) }
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
    } catch (e) { toastActionError('보드를 삭제하지 못했습니다', e) }
  }

  async function handleReorderBoards(reordered: GanttBoard[]) {
    const prevBoards = boards
    setBoards(reordered)
    try {
      await Promise.all(reordered.map((b, i) => updateBoard(b.id, { sort_order: i })))
    } catch (e) {
      setBoards(prevBoards)
      toastActionError('보드 순서를 저장하지 못했습니다', e)
    }
  }

  async function handleAddCategory(name: string, color: string) {
    if (!workspace || !selectedBoardId) return
    try {
      const cat = await addCategory(selectedBoardId, workspace.id, name, color)
      setCategories(prev => [...prev, cat])
    } catch (e) { toastActionError('카테고리를 추가하지 못했습니다', e) }
  }

  async function handleUpdateCategory(id: string, updates: { name?: string; color?: string }) {
    try {
      const updated = await updateCategory(id, updates)
      setCategories(prev => prev.map(c => c.id === id ? updated : c))
    } catch (e) { toastActionError('카테고리를 수정하지 못했습니다', e) }
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
    } catch (e) { toastActionError('카테고리를 삭제하지 못했습니다', e) }
  }

  async function handleSaveProject(fields: ProjectFormFields) {
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
    } catch (e) {
      // 저장 실패 시 toast + 재throw → 폼(ProjectFormDialog)이 실패를 인지해 드로어를 닫지 않음
      toastActionError('프로젝트를 저장하지 못했습니다', e)
      throw e
    }
  }

  async function handleDeleteProject(id: string) {
    const project = projects.find(p => p.id === id)
    const children = projects.filter(p => p.parent_id === id)
    try {
      await softDeleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id && p.parent_id !== id))
      setTrashCount(c => c + 1 + children.length)
      toast('휴지통으로 이동했어요', {
        action: {
          label: '되돌리기',
          onClick: async () => {
            try {
              const restored = await restoreProject(id)
              setProjects(prev => [...prev, ...restored].sort((a, b) => a.sort_order - b.sort_order))
              setTrashCount(c => Math.max(0, c - restored.length))
            } catch (e) { toastActionError('프로젝트를 복원하지 못했습니다', e) }
          },
        },
        description: project?.name,
      })
    } catch (e) { toastActionError('프로젝트를 휴지통으로 이동하지 못했습니다', e) }
  }

  function handleRestoreProject(project: GanttProject) {
    setProjects(prev => [...prev, project])
    setTrashCount(c => Math.max(0, c - 1))
  }

  async function handleUpdateProjectDates(id: string, startDate: string | null, endDate: string) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    try {
      const statusUpdate = prev?.status === 'backlog' ? { status: 'to-do' as GanttStatus } : {}
      const updated = await updateProject(id, { start_date: startDate, end_date: endDate, ...statusUpdate })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    } catch (e) { toastActionError('프로젝트 일정을 저장하지 못했습니다', e) }
  }

  async function handleUpdateProjectName(id: string, name: string) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    try {
      const updated = await updateProject(id, { name })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    } catch (e) { toastActionError('프로젝트 이름을 저장하지 못했습니다', e) }
  }

  async function handleUpdateProjectStatus(id: string, status: GanttStatus) {
    const prev = projectsRef.current.find(p => p.id === id)
    if (prev) pushUndo({ type: 'project', prev })
    try {
      const updated = await updateProject(id, { status })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    } catch (e) { toastActionError('프로젝트 상태를 저장하지 못했습니다', e) }
  }

  async function handleMoveProject(updates: ProjectMoveUpdate[]) {
    const affected = projectsRef.current.filter(p => updates.some(u => u.id === p.id))
    if (affected.length > 0) pushUndo({ type: 'projects', prevList: affected })
    const withChildren = includeChildProjectMoves(projectsRef.current, updates)
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
      toastActionError('프로젝트 이동을 저장하지 못했습니다', e)
      setProjects(prev => prev.map(p => affected.find(a => a.id === p.id) ?? p))
    }
  }

  async function handleMoveCategory(updates: { id: string; sort_order: number }[]) {
    const affected = categoriesRef.current.filter(c => updates.some(u => u.id === c.id))
    if (affected.length > 0) pushUndo({ type: 'categories', prevList: affected })
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
      toastActionError('카테고리 순서를 저장하지 못했습니다', e)
      setCategories(prev => prev.map(c => affected.find(a => a.id === c.id) ?? c))
    }
  }

  return {
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
  }
}
