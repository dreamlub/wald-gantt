'use client'

import { useState, useCallback } from 'react'

export function useCollapsibleSet(initial?: Iterable<string>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(initial))

  const toggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isCollapsed = useCallback((id: string) => collapsed.has(id), [collapsed])

  const reset = useCallback((next: Iterable<string>) => {
    setCollapsed(new Set(next))
  }, [])

  return { collapsed, toggle, isCollapsed, reset }
}
