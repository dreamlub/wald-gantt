'use client'

import { useEffect, useState, useCallback } from 'react'
import { LogOut, Users } from 'lucide-react'
import { GanttChart } from '@/components/gantt/GanttChart'
import { ProjectFormDialog } from '@/components/gantt/ProjectFormDialog'
import { InviteDialog } from '@/components/gantt/InviteDialog'
import { createClient } from '@/lib/supabase/client'
import {
  getOrCreateWorkspace, getCategories, getProjects,
  addCategory, addProject, updateProject, deleteProject,
} from '@/lib/gantt-service'
import type { GanttCategory, GanttProject, GanttStatus, Workspace } from '@/types'

type DialogState =
  | { type: 'addProject'; parentId?: string }
  | { type: 'editProject'; project: GanttProject }
  | { type: 'invite' }
  | null

const now = new Date()
const CUR_YEAR = now.getFullYear()
const VIEW_START = `${CUR_YEAR - 1}-01`
const VIEW_END   = `${CUR_YEAR + 2}-12`

export default function HomePage() {
  const [workspace, setWorkspace]         = useState<Workspace | null>(null)
  const [defaultCategory, setDefaultCategory] = useState<GanttCategory | null>(null)
  const [projects, setProjects]           = useState<GanttProject[]>([])
  const [dialog, setDialog]               = useState<DialogState>(null)
  const [loading, setLoading]             = useState(true)

  const supabase = createClient()

  const load = useCallback(async () => {
    try {
      const ws = await getOrCreateWorkspace()
      setWorkspace(ws)

      const [cats, projs] = await Promise.all([
        getCategories(ws.id),
        getProjects(ws.id),
      ])

      // ensure default category exists (hidden from UI)
      let cat = cats[0]
      if (!cat) {
        cat = await addCategory(ws.id, 'default', '#6366f1')
      }
      setDefaultCategory(cat)
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

  async function handleSaveProject(fields: {
    categoryId: string
    parentId: string | null
    name: string
    status: GanttStatus
    start_month: string | null
    end_month: string | null
    team: string | null
    pm: string | null
  }) {
    if (!workspace || !defaultCategory) return
    if (dialog?.type === 'editProject') {
      const updated = await updateProject(dialog.project.id, {
        name: fields.name,
        status: fields.status,
        start_month: fields.start_month,
        end_month: fields.end_month,
        team: fields.team,
        pm: fields.pm,
      })
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
    } else {
      const created = await addProject(workspace.id, defaultCategory.id, fields.parentId, {
        name: fields.name,
        status: fields.status,
        start_month: fields.start_month,
        end_month: fields.end_month,
        team: fields.team,
        pm: fields.pm,
      })
      setProjects(prev => [...prev, created])
    }
  }

  async function handleDeleteProject(id: string) {
    if (!confirm('삭제할까요?')) return
    await deleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id && p.parent_id !== id))
  }

  async function handleUpdateProjectDates(id: string, startMonth: string, endMonth: string) {
    const updated = await updateProject(id, { start_month: startMonth, end_month: endMonth })
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  async function handleUpdateProjectName(id: string, name: string) {
    const updated = await updateProject(id, { name })
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  async function handleUpdateProjectStatus(id: string, status: GanttStatus) {
    const updated = await updateProject(id, { status })
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  async function handleReorderProjects(orderedIds: string[]) {
    const updated = await Promise.all(
      orderedIds.map((id, index) => updateProject(id, { sort_order: index }))
    )
    setProjects(prev => prev.map(p => {
      const u = updated.find(u => u.id === p.id)
      return u ?? p
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-12 bg-white border-b flex items-center px-4 gap-3 shrink-0">
        <span className="font-semibold text-gray-900 text-sm">Wald Gantt</span>
        {workspace && <span className="text-xs text-gray-400">{workspace.name}</span>}
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

      <main className="flex-1 overflow-hidden">
        <div className="h-[calc(100vh-3rem)] bg-white">
          <GanttChart
            projects={projects}
            viewStart={VIEW_START}
            viewEnd={VIEW_END}
            onAddProject={parentId => setDialog({ type: 'addProject', parentId })}
            onEditProject={project => setDialog({ type: 'editProject', project })}
            onDeleteProject={handleDeleteProject}
            onUpdateProjectDates={handleUpdateProjectDates}
            onUpdateProjectName={handleUpdateProjectName}
            onUpdateProjectStatus={handleUpdateProjectStatus}
            onReorderProjects={handleReorderProjects}
          />
        </div>
      </main>

      <ProjectFormDialog
        open={dialog?.type === 'addProject' || dialog?.type === 'editProject'}
        onClose={() => setDialog(null)}
        onSave={handleSaveProject}
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
