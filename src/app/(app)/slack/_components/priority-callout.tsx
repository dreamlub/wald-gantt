'use client'

import { ArrowRight } from 'lucide-react'

interface Props {
  color: string
  text: string
  className?: string
  iconSize?: number
  borderOpacity?: number
  textColor?: string
}

export function PriorityCallout({ color, text, className = '', iconSize = 12, borderOpacity = 30, textColor }: Props) {
  return (
    <div
      className={`flex items-center gap-2 font-medium px-3 rounded border border-dashed ${className}`}
      style={{
        borderColor: `color-mix(in srgb, ${color} ${borderOpacity}%, transparent)`,
        color: textColor ?? color,
        background: `color-mix(in srgb, ${color} 6%, transparent)`,
      }}
    >
      <ArrowRight size={iconSize} className="shrink-0" />
      <span>{text}</span>
    </div>
  )
}
