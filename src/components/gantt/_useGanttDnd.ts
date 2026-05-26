import { useState, useCallback } from 'react'
import {
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { findContainer } from '@/lib/dnd-utils'
import type { GanttCategory, GanttProject } from '@/types'

interface UseGanttDndOptions {
  categories: GanttCategory[]
  projects: GanttProject[]
  sortedCats: GanttCategory[]
  catIdSet: Set<string>
  onMoveProject: (updates: { id: string; category_id: string; sort_order: number }[]) => Promise<void>
  onMoveCategory?: (updates: { id: string; sort_order: number }[]) => Promise<void>
}

export function useGanttDnd({
  categories, projects, sortedCats, catIdSet,
  onMoveProject, onMoveCategory,
}: UseGanttDndOptions) {
  const [activeId, setActiveId]   = useState<string | null>(null)
  const [liveItems, setLiveItems] = useState<Record<string, string[]> | null>(null)
  const [liveCats, setLiveCats]   = useState<string[] | null>(null)

  const isCatDrag = useCallback((id: string) => catIdSet.has(id), [catIdSet])

  function handleDragStart({ active }: DragStartEvent) {
    const id = active.id as string
    if (isCatDrag(id)) {
      setActiveId(id)
      setLiveCats(sortedCats.map(c => c.id))
    } else {
      setActiveId(id)
      const initial: Record<string, string[]> = {}
      for (const cat of sortedCats) {
        initial[cat.id] = projects
          .filter(p => p.category_id === cat.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(p => p.id)
      }
      setLiveItems(initial)
    }
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const aid = active.id as string
    const oid = over.id as string

    if (isCatDrag(aid)) {
      setLiveCats(prev => {
        if (!prev) return prev
        const oldIdx = prev.indexOf(aid)
        const newIdx = prev.indexOf(oid)
        if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev
        return arrayMove(prev, oldIdx, newIdx)
      })
      return
    }

    setLiveItems(prev => {
      if (!prev) return prev
      const activeContainer = findContainer(prev, aid)
      const overContainer   = findContainer(prev, oid) ??
        (sortedCats.some(c => c.id === oid) ? oid : undefined)
      if (!activeContainer || !overContainer) return prev

      if (activeContainer === overContainer) {
        const list    = prev[activeContainer]
        const oldIdx  = list.indexOf(aid)
        const newIdx  = list.indexOf(oid)
        if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev
        return { ...prev, [activeContainer]: arrayMove(list, oldIdx, newIdx) }
      } else {
        const fromList  = prev[activeContainer].filter(id => id !== aid)
        const toList    = [...prev[overContainer]]
        const overIdx   = toList.indexOf(oid)
        const insertAt  = overIdx >= 0 ? overIdx : toList.length
        toList.splice(insertAt, 0, aid)
        return { ...prev, [activeContainer]: fromList, [overContainer]: toList }
      }
    })
  }

  async function handleDragEnd({ active }: DragEndEvent) {
    const id = active.id as string

    if (isCatDrag(id) && liveCats) {
      setActiveId(null)
      const updates = liveCats
        .map((catId, i) => ({ id: catId, sort_order: i }))
        .filter(u => {
          const cat = categories.find(c => c.id === u.id)
          return cat && cat.sort_order !== u.sort_order
        })
      setLiveCats(null)
      if (updates.length > 0) await onMoveCategory?.(updates)
      return
    }

    setActiveId(null)
    if (!liveItems) return

    const updates: { id: string; category_id: string; sort_order: number }[] = []
    for (const [catId, ids] of Object.entries(liveItems)) {
      ids.forEach((projId, i) => {
        const proj = projects.find(p => p.id === projId)
        if (proj && (proj.category_id !== catId || proj.sort_order !== i))
          updates.push({ id: projId, category_id: catId, sort_order: i })
      })
    }

    setLiveItems(null)
    if (updates.length > 0) await onMoveProject(updates)
  }

  function handleDragCancel() {
    setActiveId(null)
    setLiveItems(null)
    setLiveCats(null)
  }

  // DragOverlay 내용
  const activeCatForOverlay  = activeId && isCatDrag(activeId) ? categories.find(c => c.id === activeId) : null
  const activeProjForOverlay = activeId && !isCatDrag(activeId) ? projects.find(p => p.id === activeId) : null

  return {
    activeId, liveItems, liveCats, isCatDrag,
    activeCatForOverlay, activeProjForOverlay,
    handleDragStart, handleDragOver, handleDragEnd, handleDragCancel,
  }
}
