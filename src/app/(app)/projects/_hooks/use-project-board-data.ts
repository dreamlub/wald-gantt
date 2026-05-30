import { useCallback, useEffect, useState } from 'react'
import {
  getCategories,
  getDeletedProjectsCount,
  getProjects,
} from '@/lib/gantt-service'
import type { GanttCategory, GanttProject } from '@/types'
import { contextualErr } from './project-errors'

interface Params {
  selectedBoardId: string | null
  onCloseTrash: () => void
}

export function useProjectBoardData({ selectedBoardId, onCloseTrash }: Params) {
  const [categories, setCategories] = useState<GanttCategory[]>([])
  const [projects, setProjects] = useState<GanttProject[]>([])
  const [trashCount, setTrashCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [boardLoadError, setBoardLoadError] = useState<string | null>(null)

  const clearBoardData = useCallback(() => {
    setBoardLoadError(null)
    setCategories([])
    setProjects([])
    setTrashCount(0)
  }, [])

  const loadBoardData = useCallback(async (boardId: string) => {
    setLoading(true)
    setBoardLoadError(null)
    onCloseTrash()
    try {
      const [cats, projs, count] = await Promise.all([
        getCategories(boardId),
        getProjects(boardId),
        getDeletedProjectsCount(boardId),
      ])
      setCategories(cats)
      setProjects(projs)
      setTrashCount(count)
    } catch (e) {
      setCategories([])
      setProjects([])
      setTrashCount(0)
      setBoardLoadError(contextualErr('보드 데이터를 불러오지 못했습니다', e))
    } finally {
      setLoading(false)
    }
  }, [onCloseTrash])

  // 선택된 보드가 바뀔 때 해당 보드 데이터 로드
  useEffect(() => {
    if (!selectedBoardId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false)
      clearBoardData()
      return
    }
    loadBoardData(selectedBoardId)
  }, [clearBoardData, loadBoardData, selectedBoardId])

  return {
    categories,
    setCategories,
    projects,
    setProjects,
    trashCount,
    setTrashCount,
    loading,
    boardLoadError,
    loadBoardData,
  }
}
