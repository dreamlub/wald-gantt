import { clampTooltipPos } from '@/app/(app)/tasks/_utils'

interface Props {
  memo: string
  x: number
  y: number
}

export function MemoTooltip({ memo, x, y }: Props) {
  const pos = clampTooltipPos(x, y)
  return (
    <div
      className="fixed z-tooltip pointer-events-none max-w-xs"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
    >
      <div className="bg-foreground text-background text-2xs rounded-lg shadow-xl px-3 py-2 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-hidden">
        {memo}
      </div>
      <div className={`absolute ${pos.flipX ? '-right-1.5' : '-left-1.5'} ${pos.flipY ? 'bottom-3' : 'top-3'} w-3 h-3 bg-foreground rotate-45`} />
    </div>
  )
}
