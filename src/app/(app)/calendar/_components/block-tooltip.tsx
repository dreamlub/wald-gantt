'use client'

import { createPortal } from 'react-dom'

interface Props {
  x: number
  y: number
  children: React.ReactNode
}

/**
 * 캘린더 블록 전용 hover 툴팁.
 * base-ui Tooltip 대신 createPortal + position:fixed를 직접 사용해
 * 어떤 부모 stacking context에도 독립적으로 최상위에 표시된다.
 * x/y는 부모 컴포넌트의 mouseenter 핸들러에서 getBoundingClientRect()로 계산해 전달.
 */
export function BlockTooltip({ x, y, children }: Props) {
  if (typeof document === 'undefined') return null
  const clampedX = Math.max(8, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 8))

  return createPortal(
    <div
      className="pointer-events-none fixed"
      style={{
        left: clampedX,
        top: y,
        transform: 'translate(-50%, calc(-100% - 6px))',
        zIndex: 'var(--z-tooltip)',
      }}
    >
      <div className="bg-foreground text-background text-xs rounded-md shadow-xl px-3 py-1.5 whitespace-nowrap max-w-xs">
        {children}
      </div>
    </div>,
    document.body,
  )
}
