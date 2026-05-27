'use client'

import { type ReactNode, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

// ─── Drawer ────────────────────────────────────────────────
interface DrawerProps {
  open: boolean
  onClose: () => void
  width?: number | string   // px 숫자 또는 CSS 값 (기본 480)
  backdrop?: boolean        // true (기본): bg-black/40 배경
  closeOnBackdrop?: boolean // true (기본): backdrop 클릭 시 닫기
  panelClass?: string       // 없으면 shadow-2xl 적용
  /** true: 포털 없이 부모 안에서 인라인 렌더링 (레이아웃이 직접 패널 크기를 제어) */
  noPortal?: boolean
  children: ReactNode
}

export function Drawer({
  open,
  onClose,
  width = 480,
  backdrop = true,
  closeOnBackdrop = true,
  panelClass,
  noPortal = false,
  children,
}: DrawerProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // 인라인 모드: 포털·backdrop 없이 children만 렌더링
  // 패널 크기·슬라이드 애니메이션은 부모 컨테이너가 직접 담당
  if (noPortal) {
    if (!open) return null
    return <>{children}</>
  }

  if (!mounted) return null

  return createPortal(
    <div className={`fixed inset-0 z-dialog ${open ? '' : 'pointer-events-none'}`} style={{ zIndex: 'var(--z-dialog)' }}>
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${
          backdrop ? 'bg-black/50' : ''
        } ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          boxShadow: open ? undefined : 'none',
          transition: 'transform 300ms ease-out, box-shadow 300ms ease-out',
        }}
        className={`absolute right-0 top-0 h-full bg-card flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        } ${panelClass ?? 'shadow-2xl'}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ─── DrawerHeader ──────────────────────────────────────────
// shrink-0 border-b 래퍼. 내부 구조(타이틀 행, 탭 행 등)는 직접 정의.
export function DrawerHeader({ children }: { children: ReactNode }) {
  return <div className="shrink-0 border-b">{children}</div>
}

// ─── DrawerBody ────────────────────────────────────────────
export function DrawerBody({
  children,
  className = '',
  scrollable = true,
}: {
  children: ReactNode
  className?: string
  scrollable?: boolean
}) {
  return (
    <div className={`flex-1 min-h-0 ${scrollable ? 'overflow-y-auto' : 'overflow-hidden'} ${className}`}>
      {children}
    </div>
  )
}

// ─── DrawerFooter ──────────────────────────────────────────
export function DrawerFooter({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`shrink-0 px-5 py-3 border-t flex justify-end gap-2 ${className}`}>
      {children}
    </div>
  )
}
