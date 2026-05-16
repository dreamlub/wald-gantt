'use client'

import type { Client, Tag, Priority } from '../_lib/types'
import { TAG_META, PRIORITY_META } from '../_lib/mock-data'

const PRIORITY_LEVEL: Record<Priority, number> = { low: 1, medium: 2, high: 3 }

export function PriorityBars({ priority, showLabel }: { priority: Priority | null; showLabel?: boolean }) {
  if (!priority) return showLabel ? <span className="text-[10px] text-ink-300">—</span> : null
  const p = PRIORITY_LEVEL[priority]
  const meta = PRIORITY_META[priority]
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-end gap-[1px]">
        {[1, 2, 3].map(i => (
          <span
            key={i}
            className="w-[2px] rounded-sm"
            style={{
              height: `${3 + i * 2}px`,
              backgroundColor: i <= p ? meta.color : 'var(--color-ink-150)',
            }}
          />
        ))}
      </span>
      {showLabel && (
        <span className="text-[10px] font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
      )}
    </span>
  )
}

export function TagBadge({ tag }: { tag: Tag }) {
  const meta = TAG_META[tag]
  return (
    <span
      className="text-[10px] px-2 py-[3px] rounded font-semibold inline-flex items-center gap-1 whitespace-nowrap"
      style={{ background: meta.bg, color: meta.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  )
}

export function TagList({ tags }: { tags: Tag[] }) {
  if (!tags || tags.length === 0) {
    return <span className="text-[11px] text-ink-300">—</span>
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tags.map(t => <TagBadge key={t} tag={t} />)}
    </span>
  )
}

export function BrandBadge({ client }: { client: Client }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-[3px] rounded font-medium whitespace-nowrap"
      style={{ background: `${client.color}1a`, color: client.color }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: client.color }} />
      {client.name}
    </span>
  )
}

export function ChannelBadge({ channel, href }: { channel: string; href?: string | null }) {
  const className = 'inline-flex items-center gap-1 text-[10.5px] font-mono px-[7px] py-[3px] rounded bg-muted border border-border text-muted-foreground hover:border-ink-300 transition-colors'
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {channel}
        <span className="text-[9px] opacity-60">↗</span>
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
  if (!name) return <span className="text-[11.5px] text-ink-400">—</span>
  return <span className="text-xs text-ink-700 whitespace-nowrap">{name}</span>
}
