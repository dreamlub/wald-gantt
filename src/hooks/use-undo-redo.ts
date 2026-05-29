import { useCallback, useEffect, useRef, useState } from 'react'
import { updateProject, updateCategory } from '@/lib/gantt-service'
import type { GanttProject, GanttCategory } from '@/types'

type UndoEntry =
  | { type: 'project';    prev: GanttProject }
  | { type: 'projects';   prevList: GanttProject[] }
  | { type: 'categories'; prevList: GanttCategory[] }

const MAX_UNDO = 20

interface Params {
  projects: GanttProject[]
  categories: GanttCategory[]
  onProjectsChange: (updater: (prev: GanttProject[]) => GanttProject[]) => void
  onCategoriesChange: (updater: (prev: GanttCategory[]) => GanttCategory[]) => void
}

export function useUndoRedo({ projects, categories, onProjectsChange, onCategoriesChange }: Params) {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([])

  const undoStackRef = useRef<UndoEntry[]>([])
  const redoStackRef = useRef<UndoEntry[]>([])
  const projectsRef = useRef<GanttProject[]>([])
  const categoriesRef = useRef<GanttCategory[]>([])

  // render 중 ref.current 변경은 react-hooks/refs 위반 → effect로 동기화
  useEffect(() => { undoStackRef.current = undoStack }, [undoStack])
  useEffect(() => { redoStackRef.current = redoStack }, [redoStack])
  useEffect(() => { projectsRef.current = projects }, [projects])
  useEffect(() => { categoriesRef.current = categories }, [categories])

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
    } else if (entry.type === 'projects') {
      const restored = await Promise.all(
        entry.prevList.map(p => updateProject(p.id, { category_id: p.category_id, sort_order: p.sort_order }))
      )
      onProjectsChange(prev => prev.map(p => restored.find(r => r.id === p.id) ?? p))
    } else {
      const restored = await Promise.all(
        entry.prevList.map(c => updateCategory(c.id, { sort_order: c.sort_order }))
      )
      onCategoriesChange(prev => prev.map(c => restored.find(r => r.id === c.id) ?? c))
    }
  }, [onProjectsChange, onCategoriesChange])

  /** 현재 상태로부터 top 엔트리의 역(inverse) 엔트리 생성 (undo↔redo 전환용) */
  const inverseOf = useCallback((top: UndoEntry): UndoEntry => {
    if (top.type === 'project') {
      const cur = projectsRef.current
      return { type: 'project', prev: cur.find(p => p.id === top.prev.id) ?? top.prev }
    }
    if (top.type === 'projects') {
      const cur = projectsRef.current
      return { type: 'projects', prevList: cur.filter(p => top.prevList.some(x => x.id === p.id)) }
    }
    const cur = categoriesRef.current
    return { type: 'categories', prevList: cur.filter(c => top.prevList.some(x => x.id === c.id)) }
  }, [])

  const handleUndo = useCallback(async () => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const top = stack[stack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), inverseOf(top)])
    await applyEntry(top)
  }, [applyEntry, inverseOf])

  const handleRedo = useCallback(async () => {
    const stack = redoStackRef.current
    if (stack.length === 0) return
    const top = stack[stack.length - 1]
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), inverseOf(top)])
    await applyEntry(top)
  }, [applyEntry, inverseOf])

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
    categoriesRef,
  }
}
