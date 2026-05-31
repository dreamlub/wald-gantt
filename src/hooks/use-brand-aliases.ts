'use client'

import { useEffect, useState } from 'react'

let _cache: Map<string, string> | null = null
let _promise: Promise<Map<string, string>> | null = null

function fetchAliases(): Promise<Map<string, string>> {
  if (_cache) return Promise.resolve(_cache)
  if (_promise) return _promise
  _promise = fetch('/api/slack/brand-aliases')
    .then(r => r.ok ? r.json() : { aliases: [] })
    .then(({ aliases }: { aliases: Array<{ alias_name: string; canonical_name: string }> }) => {
      const map = new Map<string, string>()
      for (const a of aliases ?? []) map.set(a.alias_name, a.canonical_name)
      _cache = map
      return map
    })
    .catch(() => new Map<string, string>())
  return _promise
}

export function useBrandAliases() {
  const [aliasMap, setAliasMap] = useState<Map<string, string>>(_cache ?? new Map())
  useEffect(() => {
    let cancelled = false
    fetchAliases().then(map => { if (!cancelled) setAliasMap(map) })
    return () => { cancelled = true }
  }, [])
  return aliasMap
}
