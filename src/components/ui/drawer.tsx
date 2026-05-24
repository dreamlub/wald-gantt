'use client'

import { type ReactNode } from 'react'

// ─── Drawer ────────────────────────────────────────────────
interface DrawerProps {
  open: boolean
  onClose: () => void
  width?: number | string   // px 숫자 또는 CSS 값 (기본 480)
  backdrop?: boolean        // true (기본): bg-black/20 배경
  closeOnBackdrop?: boolean // true (기본): backdrop 클릭 시 닫기
  panelClass?: string       // 없으면 shadow-2xl 적용
  children: ReactNode
}

export function Drawer({
  open,
  onClose,
  width = 480,
  backdrop = true,
  closeOnBackdrop = true,
  panelClass,
  children,
}: DrawerProps) {
  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${
          backdrop ? 'bg-black/20' : ''
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
    </div>
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
    <div className={`flex-1 ${scrollable ? 'overflow-y-auto' : 'overflow-hidden'} ${className}`}>
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
