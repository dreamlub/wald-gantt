import { useCallback, useEffect, useState } from 'react'
import { getBoards, getOrCreateWorkspace } from '@/lib/gantt-service'
import type { GanttBoard, Workspace } from '@/types'
import { contextualErr } from './project-errors'

export function useProjectWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [boards, setBoards] = useState<GanttBoard[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const ws = await getOrCreateWorkspace()
      const boardList = await getBoards(ws.id)
      setWorkspace(ws)
      setBoards(boardList)
      setSelectedBoardId(prev => {
        if (prev && boardList.some(b => b.id === prev)) return prev
        return boardList[0]?.id ?? null
      })
    } catch (e) {
      setWorkspace(null)
      setBoards([])
      setSelectedBoardId(null)
      setLoadError(contextualErr('프로젝트 보드를 불러오지 못했습니다', e))
    } finally {
      setLoading(false)
    }
  }, [])

  // 초기 1회: 워크스페이스/보드 로드 (외부 fetch -> setState 의도된 패턴)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWorkspace()
  }, [loadWorkspace])

  return {
    workspace,
    boards,
    setBoards,
    selectedBoardId,
    setSelectedBoardId,
    loading,
    loadError,
    loadWorkspace,
  }
}
