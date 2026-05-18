'use client'

import { useCallback, useState } from 'react'
import type { TaskStatus } from '@/types'

export function useTaskSelection(
  handleBulkDelete: (ids: string[]) => Promise<void>,
  handleBulkStatusChange: (ids: string[], status: TaskStatus) => Promise<void>,
) {
  const [selectionMode,  setSelectionMode]  = useState(false)
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set())
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)

  const handleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setBulkStatusOpen(false)
  }, [])

  const doBulkDelete = useCallback(async () => {
    const ids = [...selectedIds]
    await handleBulkDelete(ids)
    exitSelectionMode()
  }, [selectedIds, handleBulkDelete, exitSelectionMode])

  const doBulkStatusChange = useCallback(async (status: TaskStatus) => {
    const ids = [...selectedIds]
    await handleBulkStatusChange(ids, status)
    exitSelectionMode()
  }, [selectedIds, handleBulkStatusChange, exitSelectionMode])

  return {
    selectionMode, setSelectionMode,
    selectedIds, handleSelect,
    bulkStatusOpen, setBulkStatusOpen,
    exitSelectionMode,
    doBulkDelete, doBulkStatusChange,
  }
}
