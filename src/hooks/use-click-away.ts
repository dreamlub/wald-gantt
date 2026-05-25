import { useEffect, useRef } from 'react'

export function useClickAway<T extends HTMLElement>(
  active: boolean,
  onClickAway: () => void,
) {
  const ref = useRef<T>(null)
  const callbackRef = useRef(onClickAway)

  useEffect(() => {
    callbackRef.current = onClickAway
  }, [onClickAway])

  useEffect(() => {
    if (!active) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callbackRef.current()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [active])

  return ref
}
