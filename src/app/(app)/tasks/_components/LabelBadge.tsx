'use client'

import { labelColor, isLightColor } from '../_utils'

interface DisplayProps {
  variant: 'display'
  name: string
}

interface FilterProps {
  variant: 'filter'
  name: string
  count: number
  active: boolean
  onClick: () => void
}

type LabelBadgeProps = DisplayProps | FilterProps

export function LabelBadge(props: LabelBadgeProps) {
  const bg = labelColor(props.name)
  const fg = isLightColor(bg) ? 'var(--color-ink-800)' : 'white'

  if (props.variant === 'filter') {
    const { name, count, active, onClick } = props
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-0.5 text-3xs font-medium px-2 py-0.5 rounded-full border transition-all ${
          active ? '' : 'hover:opacity-80'
        }`}
        style={active
          ? { backgroundColor: bg, color: fg, borderColor: bg }
          : { backgroundColor: 'transparent', color: bg, borderColor: bg }
        }
      >
        # {name}
        <span className="text-4xs opacity-70">{count}</span>
      </button>
    )
  }

  return (
    <span
      className="shrink-0 text-4xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: bg, color: fg }}
    >
      {props.name}
    </span>
  )
}
