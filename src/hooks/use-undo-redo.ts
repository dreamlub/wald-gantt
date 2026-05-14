import { useCallback, useEffect, useRef, useState } from 'react'
import { updateProject } from '@/lib/gantt-service'
import type { GanttProject } from '@/types'

type UndoEntry =
  | { type: 'project';  prev: GanttProject }
  | { type: 'projects'; prevList: GanttProject[] }

const MAX_UNDO = 20

interface Params {
  projects: GanttProject[]
  onProjectsChange: (updater: (prev: GanttProject[]) => GanttProject[]) => void
}

export function useUndoRedo({ projects, onProjectsChange }: Params) {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([])

  const undoStackRef = useRef<UndoEntry[]>([])
  undoStackRef.current = undoStack
  const redoStackRef = useRef<UndoEntry[]>([])
  redoStackRef.current = redoStack
  const projectsRef = useRef<GanttProject[]>([])
  projectsRef.current = projects

  function pushUndo(entry: UndoEntry) {
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), entry])
    setRedoStack([])
  }

  function resetStacks() {
    setUndoStack([])
    setRedoStack([])
  }

  const applyEntry = useCallback(async (entry: UndoEntry) => {
    if (entry.type === 'project') {
      const p = entry.prev
      const restored = await updateProject(p.id, {
        name: p.name, status: p.status,
        start_date: p.start_date, end_date: p.end_date,
        category_id: p.category_id, team: p.team, pm: p.pm,
      })
      onProjectsChange(prev => prev.map(x => x.id === restored.id ? restored : x))
    } else {
      const restored = await Promise.all(
        entry.prevList.map(p => updateProject(p.id, { category_id: p.category_id, sort_order: p.sort_order }))
      )
      onProjectsChange(prev => prev.map(p => restored.find(r => r.id === p.id) ?? p))
    }
  }, [onProjectsChange])

  const handleUndo = useCallback(async () => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const top = stack[stack.length - 1]
    const cur = projectsRef.current
    const redoEntry: UndoEntry = top.type === 'project'
      ? { type: 'project',  prev: cur.find(p => p.id === top.prev.id) ?? top.prev }
      : { type: 'projects', prevList: cur.filter(p => top.prevList.some(x => x.id === p.id)) }
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), redoEntry])
    await applyEntry(top)
  }, [applyEntry])

  const handleRedo = useCallback(async () => {
    const stack = redoStackRef.current
    if (stack.length === 0) return
    const top = stack[stack.length - 1]
    const cur = projectsRef.current
    const undoEntry: UndoEntry = top.type === 'project'
      ? { type: 'project',  prev: cur.find(p => p.id === top.prev.id) ?? top.prev }
      : { type: 'projects', prevList: cur.filter(p => top.prevList.some(x => x.id === p.id)) }
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), undoEntry])
    await applyEntry(top)
  }, [applyEntry])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); handleUndo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault(); handleRedo()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

  return {
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    pushUndo,
    resetStacks,
    handleUndo,
    handleRedo,
    projectsRef,
  }
}
