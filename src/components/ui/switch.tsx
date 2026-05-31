'use client'

import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** 토글 오른쪽 라벨 (선택) */
  label?: React.ReactNode
  /** 트랙 ON 색 클래스 (기본: bg-foreground) */
  onClassName?: string
  /** 트랙 OFF 색 클래스 (hover 유틸 포함 가능, 기본: bg-ink-200 group-hover:bg-ink-300) */
  offClassName?: string
  /** 래퍼 button 추가 클래스 (라벨 폰트 크기 등) */
  className?: string
  title?: string
  'aria-label'?: string
  disabled?: boolean
}

// 공용 on/off 스위치 — 보기 옵션 토글에 사용 (타임라인 "해결 포함", 할일 "완료 표시" 등)
export function Switch({
  checked,
  onCheckedChange,
  label,
  onClassName = 'bg-foreground',
  offClassName = 'bg-ink-200 group-hover:bg-ink-300',
  className,
  title,
  disabled,
  'aria-label': ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'group inline-flex items-center gap-1.5 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
    >
      <span
        className={cn(
          'relative inline-flex items-center h-3.5 w-6 rounded-full transition-colors',
          checked ? onClassName : offClassName,
        )}
      >
        <span
          className={cn(
            'inline-block h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0.5',
          )}
        />
      </span>
      {label}
    </button>
  )
}
