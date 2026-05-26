'use client'

import type { Tag, Priority } from '../_lib/types'
import { TAG_META, PRIORITY_META } from '../_lib/constants'
import { brandColor } from '@/lib/history-service'

const PRIORITY_LEVEL: Record<Priority, number> = { low: 1, medium: 2, high: 3 }

export function PriorityBars({ priority, showLabel, onDark }: { priority: Priority | null; showLabel?: boolean; onDark?: boolean }) {
  if (!priority) return showLabel ? <span className="text-3xs text-ink-300">—</span> : null
  const p = PRIORITY_LEVEL[priority]
  const meta = PRIORITY_META[priority]
  return (
    <span className="inline-flex items-center gap-1" title={meta.label}>
      <span className="inline-flex items-end gap-[1px]">
        {[1, 2, 3].map(i => (
          <span
            key={i}
            className="w-0.5 rounded-sm"
            style={{
              height: `${3 + i * 2}px`,
              backgroundColor: i <= p
                ? (onDark ? 'white' : meta.color)
                : (onDark ? 'rgba(255,255,255,0.35)' : 'var(--color-ink-150)'),
            }}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-xs font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
      )}
    </span>
  )
}

export function TagBadge({ tag, variant = 'outline', showDot, children }: {
  tag: Tag
  variant?: 'outline' | 'solid'
  showDot?: boolean
  children?: React.ReactNode
}) {
  const meta = TAG_META[tag]
  if (!meta) return null
  const style = variant === 'solid'
    ? { background: meta.bg, color: meta.color }
    : { backgroundColor: 'transparent', color: meta.bg, borderColor: meta.bg }
  return (
    <span
      className={`text-3xs px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 whitespace-nowrap${variant === 'outline' ? ' border' : ''}`}
      style={style}
    >
      {showDot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.dot }} />}
      {children ?? meta.label}
    </span>
  )
}

export function TagFilterBadge({ tag, active, onClick, dimmed }: {
  tag: Tag
  active: boolean
  onClick: () => void
  dimmed?: boolean
}) {
  const meta = TAG_META[tag]
  if (!meta) return null
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center text-3xs font-medium px-2 py-0.5 rounded-full border transition-all ${
        dimmed ? 'opacity-40 hover:opacity-70' : 'hover:opacity-80'
      }`}
      style={active
        ? { backgroundColor: meta.bg, color: meta.color, borderColor: meta.bg }
        : { backgroundColor: 'transparent', color: meta.bg, borderColor: meta.bg }
      }
    >
      {meta.label}
    </button>
  )
}

export function PriorityFilterBadge({ priority, active, onClick, dimmed }: {
  priority: Priority
  active: boolean
  onClick: () => void
  dimmed?: boolean
}) {
  const meta = PRIORITY_META[priority]
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-3xs font-medium px-2 py-0.5 rounded-full border transition-all ${
        dimmed ? 'opacity-40 hover:opacity-70' : 'hover:opacity-80'
      }`}
      style={active
        ? { backgroundColor: meta.color, color: 'white', borderColor: meta.color }
        : { backgroundColor: 'transparent', color: meta.color, borderColor: meta.color }
      }
    >
      <PriorityBars priority={priority} onDark={active} />
      {meta.label}
    </button>
  )
}

export function TagList({ tags }: { tags: Tag[] }) {
  if (!tags || tags.length === 0) {
    return <span className="text-2xs text-ink-300">—</span>
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tags.map(t => <TagBadge key={t} tag={t} />)}
    </span>
  )
}

export function BrandBadge({ brandName }: { brandName: string }) {
  const color = brandColor(brandName)
  return (
    <span
      className="inline-flex items-center gap-1.5 text-2xs px-2 py-0.5 rounded-full bg-ink-100 text-ink-700 font-medium whitespace-nowrap"
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {brandName}
    </span>
  )
}

export function ChannelBadge({ channel, href }: { channel: string; href?: string | null }) {
  const className = 'inline-flex items-center gap-1 text-xs px-[7px] py-[3px] rounded bg-muted border border-border text-muted-foreground hover:border-ink-300 transition-colors'
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {channel}
        <span className="text-4xs opacity-60">↗</span>
      </a>
    )
  }
  return <span className={className}>{channel}</span>
}

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  return <PriorityBars priority={priority} />
}

export function Avatar({ name, color, size = 22 }: { name: string; color?: string; size?: number }) {
  const initial = name?.[0] ?? '?'
  return (
    <span
      className="rounded-full inline-flex items-center justify-center text-white font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size <= 18 ? 9 : 10,
        background: color ?? 'var(--color-ink-400)',
      }}
    >
      {initial}
    </span>
  )
}

export function AuthorCell({ name }: { name: string | null }) {
  if (!name) return <span className="text-2xs text-ink-400">—</span>
  return <span className="text-xs text-ink-700 whitespace-nowrap">{name}</span>
}
