'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type IssueRow, ST_BG, ST_SYMBOL, nodeStatus, ageTxt } from './_tracker-shared'

// ── 계층 행 (테이블 row + 색상 띠) ───────────────────────────
export function NodeRow({
  row, selected, relCount, childCount, open, onToggle, onSelect, isChild,
}: {
  row: IssueRow; selected: boolean; relCount: number
  childCount?: number; open?: boolean; onToggle?: () => void
  onSelect: (id: string) => void; isChild?: boolean
}) {
  const st = nodeStatus(row)
  const hasChildren = (childCount ?? 0) > 0
  const band = ST_BG[st]
  return (
    <div
      onClick={() => onSelect(row.id)}
      style={{ borderLeft: `3px solid ${band}` }}
      className={cn(
        'flex items-center h-9 gap-2 cursor-pointer select-none border-b transition-colors',
        isChild ? 'pl-10' : 'pl-2',
        selected
          ? 'bg-status-future/10'
          : isChild
            ? 'bg-card hover:bg-muted'
            : 'bg-muted/40 hover:bg-muted',
      )}
    >
      {!isChild && (
        <button
          onClick={e => { e.stopPropagation(); onToggle?.() }}
          className={cn(
            'shrink-0 w-4 h-4 flex items-center justify-center rounded text-ink-300 hover:text-ink hover:bg-ink-100',
            !hasChildren && 'invisible',
          )}
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      )}
      {isChild ? (
        <span className="shrink-0 text-ink-300 text-sm leading-none select-none">└</span>
      ) : (
        <span
          className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white font-bold text-5xs"
          style={{ background: band }}
        >
          {ST_SYMBOL[st]}
        </span>
      )}
      {isChild ? (
        <span className="flex-1 text-sm text-ink truncate">{row.title}</span>
      ) : (
        <span className="flex-1 flex items-baseline gap-1.5 min-w-0 truncate">
          <span className="text-sm font-bold text-foreground truncate">{row.title}</span>
          {hasChildren && (
            <span className="text-sm text-muted-foreground shrink-0 tabular-nums">{childCount}</span>
          )}
        </span>
      )}
      <div className="flex items-center gap-2 shrink-0 pr-3 text-3xs">
        {relCount > 0 && <span className="flex items-center gap-0.5 text-ink-200"><Link2 size={9} />{relCount}</span>}
        <span className="text-ink-300 tabular-nums text-right whitespace-nowrap">{ageTxt(row.last_seen)}</span>
      </div>
    </div>
  )
}

// ── 클러스터 그룹 (parent + 자식들) ─────────────────────────
export function ClusterGroup({
  root, childRows, selectedId, relCountOf, onSelect,
}: {
  root: IssueRow; childRows: IssueRow[]
  selectedId: string | null
  relCountOf: (id: string) => number; onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <NodeRow
        row={root} selected={selectedId === root.id}
        relCount={relCountOf(root.id)} childCount={childRows.length}
        open={open} onToggle={() => setOpen(v => !v)} onSelect={onSelect}
      />
      {open && childRows.map((c) => (
        <NodeRow
          key={c.id} row={c} selected={selectedId === c.id}
          relCount={relCountOf(c.id)} onSelect={onSelect}
          isChild
        />
      ))}
    </>
  )
}
