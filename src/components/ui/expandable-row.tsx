import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  expanded: boolean
  onToggle: () => void
  header: ReactNode
  detail?: ReactNode
  detailClassName?: string
  className?: string
}

export function ExpandableRow({ expanded, onToggle, header, detail, detailClassName, className }: Props) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        'group border border-border bg-card cursor-pointer transition-colors hover:border-ink-300 hover:bg-muted/30',
        expanded ? 'rounded-md shadow-sm' : 'rounded-sm',
        className,
      )}
    >
      {header}
      {expanded && detail && (
        <div className={cn('border-t border-border', detailClassName)}>
          {detail}
        </div>
      )}
    </div>
  )
}
