import { useSyncExternalStore } from 'react'

const MOBILE_QUERY = '(max-width: 639px)'

function subscribe(cb: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
