'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, LogOut, Users } from 'lucide-react'
import { GanttChart } from '@/components/gantt/GanttChart'
import { CategoryFormDialog } from '@/components/gantt/CategoryFormDialog'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { InviteDialog } from '@/components/gantt/InviteDialog'
import { createClient } from '@/lib/supabase/client'
import {
  getOrCreateWorkspace, getCategories, getProjects,
  addCategory, updateCategory, deleteCategory,
  addProject, updateProject, deleteProject,
} from '@/lib/gantt-service'
import type { GanttCategory, GanttProject, GanttStatus, Workspace } from '@/types'

type DialogState =
  | { type: 'addCategory' }
  | { type: 'editCategory'; category: GanttCategory }
  | { type: 'addProject'; categoryId: string; parentId?: string }
  | { type: 'editProject'; project: GanttProject }
  | { type: 'invite' }
  | null

export default function HomePage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [categories, setCategories] = useState<GanttCategory[]>([])
  const [projects, setProjects] = useState<GanttProject[]>([])
  const [dialog, setDialog] = useState<DialogState>(null)
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const viewStart = `${viewYear}-01`
  const viewEnd = `${viewYear}-12`

  const load = useCallback(async () => {
    try {
      const ws = await getOrCreateWorkspace()
      setWorkspace(ws)
      const [cats, projs] = await Promise.all([
        getCategories(ws.id),
        getProjects(ws.id),
      ])
      setCategories(cats)
      setProjects(projs)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleSaveCategory(name: string, color: string) {
    if (!workspace) return
    if (dialog?.type === 'editCategory') {
      const updated = await updateCategory(dialog.category.id, { name, color })
      setCategories(prev => prev.map(c => c.id === updated.id ? updated : c))
    } else {
      const created = await addCategory(workspace.id, name, color)
      setCategories(prev => [...prev, created])
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('카테고리와 모든 프로젝트를 삭제할까요?')) return
    await deleteCategory(id)
    setCategories(prev => prev.filter(c => c.id !== id))
    setProjects(prev => prev.filter(p => p.category_id !== id))
  }

  async function handleSaveProject(fields: {
    categoryId: string
    parentId: string | null
    name: string
    status: GanttStatus
    start_month: string | null
    end_month: string | null
  }) {
    if (!workspace) return
    if (dialog?.type === 'editProject') {
      const updated = await updateProject(dialog.project.id, {
        name: fields.name,
        status: fields.status,
        start_month: fields.start_month,
        end_month: fields.end_month,
        category_id: fields.categoryId,
      })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    } else {
      const created = await addProject(workspace.id, fields.categoryId, fields.parentId, {
        name: fields.name,
        status: fields.status,
        start_month: fields.start_month,
        end_month: fields.end_month,
      })
      setProjects(prev => [...prev, created])
    }
  }

  async function handleDeleteProject(id: string) {
    if (!confirm('프로젝트를 삭제할까요?')) return
    await deleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id && p.parent_id !== id))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="h-12 bg-white border-b flex items-center px-4 gap-3 shrink-0">
        <span className="font-semibold text-gray-900 text-sm">Wald Gantt</span>
        {workspace && (
          <span className="text-xs text-gray-400">{workspace.name}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1">
            <button
              onClick={() => setViewYear(y => y - 1)}
              className="p-1 text-gray-500 hover:text-gray-800"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-gray-700 w-10 text-center">{viewYear}</span>
            <button
              onClick={() => setViewYear(y => y + 1)}
              className="p-1 text-gray-500 hover:text-gray-800"
            >
              <ChevronRight size={16} />
            </button>
          </div>
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

      <main className="flex-1 overflow-hidden">
        <div className="h-[calc(100vh-3rem)] bg-white">
          <GanttChart
            categories={categories}
            projects={projects}
            viewStart={viewStart}
            viewEnd={viewEnd}
            onAddCategory={() => setDialog({ type: 'addCategory' })}
            onEditCategory={cat => setDialog({ type: 'editCategory', category: cat })}
            onDeleteCategory={handleDeleteCategory}
            onAddProject={(categoryId, parentId) =>
              setDialog({ type: 'addProject', categoryId, parentId })
            }
            onEditProject={project => setDialog({ type: 'editProject', project })}
            onDeleteProject={handleDeleteProject}
          />
        </div>
      </main>

      <CategoryFormDialog
        open={dialog?.type === 'addCategory' || dialog?.type === 'editCategory'}
        onClose={() => setDialog(null)}
        onSave={handleSaveCategory}
        editCategory={dialog?.type === 'editCategory' ? dialog.category : null}
      />

      <ProjectFormDialog
        open={dialog?.type === 'addProject' || dialog?.type === 'editProject'}
        onClose={() => setDialog(null)}
        onSave={handleSaveProject}
        categories={categories}
        defaultCategoryId={dialog?.type === 'addProject' ? dialog.categoryId : undefined}
        defaultParentId={dialog?.type === 'addProject' ? dialog.parentId : undefined}
        isSubtask={dialog?.type === 'addProject' && !!dialog.parentId}
        editProject={dialog?.type === 'editProject' ? dialog.project : null}
      />

      <InviteDialog
        open={dialog?.type === 'invite'}
        onClose={() => setDialog(null)}
        workspaceId={workspace?.id ?? ''}
      />
    </div>
  )
}
