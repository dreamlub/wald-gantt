'use client'

import { useEffect, useState } from 'react'

export interface BrandProfile {
  name: string
  logo_url: string | null
  lucide_icon: string | null
}

let _cache: Map<string, BrandProfile> | null = null
let _promise: Promise<Map<string, BrandProfile>> | null = null

function fetchProfiles(): Promise<Map<string, BrandProfile>> {
  if (_cache) return Promise.resolve(_cache)
  if (_promise) return _promise
  _promise = fetch('/api/settings/brand-profiles')
    .then(r => r.ok ? r.json() : { profiles: [] })
    .then(({ profiles }: { profiles: BrandProfile[] }) => {
      const map = new Map<string, BrandProfile>()
      for (const p of profiles ?? []) map.set(p.name, p)
      _cache = map
      return map
    })
    .catch(() => new Map<string, BrandProfile>())
  return _promise
}

export function invalidateBrandProfiles() {
  _cache = null
  _promise = null
}

export function useBrandProfiles() {
  const [profiles, setProfiles] = useState<Map<string, BrandProfile>>(_cache ?? new Map())

  useEffect(() => {
    let cancelled = false
    fetchProfiles().then(map => { if (!cancelled) setProfiles(map) })
    return () => { cancelled = true }
  }, [])

  return profiles
}
