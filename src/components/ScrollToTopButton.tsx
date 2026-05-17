'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowUp } from 'lucide-react'

const THRESHOLD = 300

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)
  const activeEl = useRef<Element | null>(null)
  const pathname = usePathname()

  // 라우트 변경 시 버튼 숨김 + 스크롤 추적 대상 리셋 (외부 트리거 기반 → 의도된 setState)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(false)
    activeEl.current = null
  }, [pathname])

  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement
      if (!el?.dataset?.scrolltop) return
      const scrolled = el.scrollTop > THRESHOLD
      activeEl.current = scrolled ? el : null
      setVisible(scrolled)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [])

  return (
    <button
      onClick={() => activeEl.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="맨 위로"
      className={`fixed bottom-6 right-6 z-40 w-9 h-9 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
    >
      <ArrowUp size={16} />
    </button>
  )
}
