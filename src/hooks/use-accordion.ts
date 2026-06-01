'use client'

import { useState, useCallback } from 'react'

export function useAccordion(defaultId: string | null = null) {
  const [expandedId, setExpandedId] = useState<string | null>(defaultId)

  const toggle = useCallback((id: string) => {
    setExpandedId(cur => (cur === id ? null : id))
  }, [])

  const isExpanded = useCallback((id: string) => expandedId === id, [expandedId])

  return { expandedId, setExpandedId, toggle, isExpanded }
}
