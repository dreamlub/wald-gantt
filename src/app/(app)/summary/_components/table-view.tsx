'use client'

import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'

import type { Client, HistoryItem, Tag, Priority } from '../_lib/types'
import { TAG_META, fmtMonthDay } from '../_lib/mock-data'
import { PriorityBadge, AuthorCell } from './badges'

type SortKey = 'brand' | 'priority' | 'author' | 'date'
type SortDir = 'asc' | 'desc'

interface Props {
  items: HistoryItem[]
  clients: Client[]
}

const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 }

export function TableView({ items, clients }: Props) {
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

  // 기본: 등록일 내림차순
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'asc')
    }
  }

  const sorted = useMemo(() => {
    const arr = [...items]
    const mult = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'brand') {
        const an = clientMap.get(a.client_id)?.name ?? ''
        const bn = clientMap.get(b.client_id)?.name ?? ''
        cmp = an.localeCompare(bn, 'ko')
      } else if (sortKey === 'priority') {
        const ar = a.priority ? PRIORITY_RANK[a.priority] : 0
        const br = b.priority ? PRIORITY_RANK[b.priority] : 0
        cmp = ar - br
      } else if (sortKey === 'author') {
        cmp = (a.author ?? '').localeCompare(b.author ?? '', 'ko')
      } else if (sortKey === 'date') {
        cmp = a.occurred_at.localeCompare(b.occurred_at)
      }
      if (cmp === 0) cmp = a.occurred_at.localeCompare(b.occurred_at)
      return cmp * mult
    })
    return arr
  }, [items, sortKey, sortDir, clientMap])

  if (items.length === 0) {
    return <div className="text-center py-12 text-ink-400 text-sm">필터에 해당하는 항목이 없어요</div>
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <Th>내용</Th>
            <Th className="w-[120px]" sortable sortDir={sortKey === 'brand'    ? sortDir : null} onClick={() => toggleSort('brand')}>브랜드</Th>
            <Th className="w-[180px]">태그</Th>
            <Th className="w-[80px]"  sortable sortDir={sortKey === 'priority' ? sortDir : null} onClick={() => toggleSort('priority')}>중요도</Th>
            <Th className="w-[100px]" sortable sortDir={sortKey === 'author'   ? sortDir : null} onClick={() => toggleSort('author')}>작성자</Th>
            <Th className="w-[80px] text-right" sortable sortDir={sortKey === 'date' ? sortDir : null} onClick={() => toggleSort('date')} align="right">등록일</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, idx) => {
            const client = clientMap.get(item.client_id)
            const isLast = idx === sorted.length - 1
            return (
              <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                <Td last={isLast}>
                  <div className="text-[13px] font-medium text-foreground mb-[3px]">{item.title}</div>
                  {item.body && (
                    <div className="text-[11.5px] text-ink-700 leading-[1.5] line-clamp-2">{item.body}</div>
                  )}
                </Td>
                <Td last={isLast}>{client && <BrandPlain client={client} />}</Td>
                <Td last={isLast}><TagPlain tags={item.tags} /></Td>
                <Td last={isLast}><PriorityBadge priority={item.priority} /></Td>
                <Td last={isLast}>
                  <AuthorCell name={item.author} />
                </Td>
                <Td last={isLast} className="text-right text-[12px] text-ink-400">
                  {fmtMonthDay(item.occurred_at)}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BrandPlain({ client }: { client: Client }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-700 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: client.color }} />
      {client.name}
    </span>
  )
}

function TagPlain({ tags }: { tags: Tag[] }) {
  if (!tags || tags.length === 0) {
    return <span className="text-[12px] text-ink-300">—</span>
  }
  return (
    <div className="flex flex-col gap-0.5 text-[12px]">
      {tags.map(t => {
        const meta = TAG_META[t]
        return (
          <span key={t} className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: meta.color }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.dot }} />
            {meta.label}
          </span>
        )
      })}
    </div>
  )
}

function Th({
  children, className = '', sortable, sortDir, onClick, align = 'left',
}: {
  children: React.ReactNode
  className?: string
  sortable?: boolean
  sortDir?: SortDir | null
  onClick?: () => void
  align?: 'left' | 'right'
}) {
  const base = `px-3 py-2.5 text-[11px] font-semibold text-ink-400 uppercase tracking-wider bg-muted border-b border-border whitespace-nowrap ${className}`
  if (!sortable) {
    return <th className={`${base} text-left`}>{children}</th>
  }
  return (
    <th className={base}>
      <button
        type="button"
        onClick={onClick}
        className={`w-full inline-flex items-center gap-1 hover:text-ink-700 transition-colors ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      >
        {children}
        {sortDir === 'asc'  ? <ArrowUp size={11} className="text-ink-700" />
         : sortDir === 'desc' ? <ArrowDown size={11} className="text-ink-700" />
         : <ChevronsUpDown size={11} className="text-ink-300" />}
      </button>
    </th>
  )
}

function Td({ children, className = '', last = false }: { children: React.ReactNode; className?: string; last?: boolean }) {
  return (
    <td className={`px-3 py-3 align-top ${last ? '' : 'border-b border-border'} ${className}`}>
      {children}
    </td>
  )
}
