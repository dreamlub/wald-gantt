import { useState } from 'react'
import type { HistoryItem } from '../_lib/types'
import type { GanttCategory, GanttStatus, Priority } from '@/types'
import { getOrCreateWorkspace, getBoards, getCategories, addProject } from '@/lib/gantt-service'
import { addTask, searchProjects } from '@/lib/task-service'

export function useCreateDialogs() {
  const [createTaskOpen,    setCreateTaskOpen]    = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createSource,      setCreateSource]      = useState<HistoryItem | null>(null)
  const [workspaceId,       setWorkspaceId]       = useState<string | null>(null)
  const [allCategories,     setAllCategories]     = useState<GanttCategory[]>([])

  async function loadWorkspace() {
    if (workspaceId) return workspaceId
    const ws = await getOrCreateWorkspace()
    setWorkspaceId(ws.id)
    return ws.id
  }

  async function handleOpenCreateTask(item: HistoryItem) {
    setCreateSource(item)
    await loadWorkspace()
    setCreateTaskOpen(true)
  }

  async function handleOpenCreateProject(item: HistoryItem) {
    setCreateSource(item)
    const wsId = await loadWorkspace()
    const boards = await getBoards(wsId)
    const cats = (await Promise.all(boards.map(b => getCategories(b.id)))).flat()
    setAllCategories(cats)
    setCreateProjectOpen(true)
  }

  function closeTask() { setCreateTaskOpen(false); setCreateSource(null) }
  function closeProject() { setCreateProjectOpen(false); setCreateSource(null) }

  async function saveTask(fields: Parameters<typeof addTask>[1], projectIds: string[]) {
    if (!workspaceId) return
    await addTask(workspaceId, { ...fields, type: 'mine' }, projectIds)
    closeTask()
  }

  async function saveProject(fields: {
    name: string; status: GanttStatus; start_date: string | null; end_date: string | null
    team: string | null; pm: string | null; memo: string | null; priority: Priority
    categoryId: string; parentId: string | null
  }) {
    if (!workspaceId) return
    const cat = allCategories.find(c => c.id === fields.categoryId)
    if (!cat) return
    await addProject(cat.board_id, workspaceId, fields.categoryId, fields.parentId, {
      name: fields.name, status: fields.status,
      start_date: fields.start_date, end_date: fields.end_date,
      team: fields.team, pm: fields.pm, priority: fields.priority,
    })
    closeProject()
  }

  return {
    workspaceId,
    allCategories,
    createTaskOpen, createProjectOpen,
    createSource,
    handleOpenCreateTask, handleOpenCreateProject,
    closeTask, closeProject, saveTask, saveProject,
    onSearchProjects: (q: string) => workspaceId ? searchProjects(workspaceId, q) : Promise.resolve([]),
  }
}
