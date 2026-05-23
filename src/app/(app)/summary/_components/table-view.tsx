'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ExternalLink, ListTodo, Hash } from 'lucide-react'

import type { Client, HistoryItem, Tag, Priority } from '../_lib/types'
import { TAG_META, PRIORITY_META } from '../_lib/mock-data'
import { PriorityBars } from './badges'

interface Props {
  items: HistoryItem[]
  clients: Client[]
  selectedTags:     Set<Tag>
  searchQuery?:     string
  hasFilters:       boolean
  onToggleTag:      (t: Tag) => void
  onSelectBrand:    (id: string) => void
  onSelectAuthor:   (a: string) => void
  onOpenItem?:      (item: HistoryItem) => void
  onClearFilters:   () => void
  onCreateTask?:    (item: HistoryItem) => void
  onCreateProject?: (item: HistoryItem) => void
}

function fmtDate(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd (eee)', { locale: ko })
}

function fmtDateTime(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd HH:mm', { locale: ko })
}

function MarkdownBody({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
            : <span key={j}>{part}</span>
        )
        return <div key={i}>{parts}</div>
      })}
    </div>
  )
}

function Highlight({ text, query }: { text: string; query?: string }) {
  const q = query?.trim()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx < 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let last = 0, pos = idx, k = 0
  while (pos >= 0) {
    if (pos > last) parts.push(text.slice(last, pos))
    parts.push(<mark key={k++} className="bg-amber-100 text-foreground rounded-sm px-0.5">{text.slice(pos, pos + needle.length)}</mark>)
    last = pos + needle.length
    pos = lower.indexOf(needle, last)
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function TableView({
  items, clients, searchQuery, hasFilters,
  onToggleTag, onSelectBrand, onSelectAuthor, onClearFilters,
  onCreateTask, onCreateProject,
}: Props) {
  const brandMap = useMemo(() => new Map(clients.map(c => [c.name, c])), [clients])
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <div className="text-xs text-muted-foreground mb-1">
          {hasFilters ? '조건에 맞는 항목이 없어요' : '수집된 히스토리가 없어요'}
        </div>
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors mt-3"
          >
            필터 초기화
          </button>
        )}
      </div>
    )
  }

  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      const b = item.brand_name ?? '미분류'
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count, client: brandMap.get(name) }))
      .sort((a, b) => b.count - a.count)
  }, [items, brandMap])

  const [activeBrand, setActiveBrand] = useState<string | null>(null)

  const filteredItems = useMemo(() => {
    if (!activeBrand) return items
    return items.filter(i => (i.brand_name ?? '미분류') === activeBrand)
  }, [items, activeBrand])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 브랜드 배지 */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-border bg-card">
        <button
          onClick={() => setActiveBrand(null)}
          className={`text-[11px] px-2.5 py-[3px] rounded-full border transition-colors ${
            !activeBrand
              ? 'bg-foreground text-white border-foreground'
              : 'bg-card text-muted-foreground border-border hover:border-ink-400'
          }`}
        >
          전체 {items.length}
        </button>
        {brandCounts.map(b => {
          const active = activeBrand === b.name
          return (
            <button
              key={b.name}
              onClick={() => setActiveBrand(active ? null : b.name)}
              className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-[3px] rounded-full border transition-colors ${
                active
                  ? 'text-white border-transparent'
                  : 'bg-card text-muted-foreground border-border hover:border-ink-400'
              }`}
              style={active && b.client ? { backgroundColor: b.client.color, borderColor: b.client.color } : undefined}
            >
              {b.client && <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'white' : b.client.color }} />}
              {b.name}
              <span className={`text-[10px] ${active ? 'text-white/70' : 'text-ink-400'}`}>{b.count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted border-b border-ink-150">
            <tr>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-ink-400 uppercase tracking-wider w-[110px]">날짜</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-ink-400 uppercase tracking-wider min-w-[300px]">내용</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-ink-400 uppercase tracking-wider w-[90px]">브랜드</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-ink-400 uppercase tracking-wider w-[120px]">태그</th>
              <th className="text-center px-3 py-2 text-[10px] font-semibold text-ink-400 uppercase tracking-wider w-[60px]">중요도</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-ink-400 uppercase tracking-wider w-[80px]">작성자</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold text-ink-400 uppercase tracking-wider w-[100px]">채널</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => {
              const client = brandMap.get(item.brand_name ?? '')
              const isHovered = hoveredId === item.id
              return (
                <tr
                  key={item.id}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="border-b border-border hover:bg-muted/50 transition-colors align-top"
                >
                  {/* 날짜 */}
                  <td className="px-3 py-2.5 text-[11px] text-ink-500 tabular-nums whitespace-nowrap">
                    {fmtDate(item.occurred_at)}
                  </td>

                  {/* 제목 + 내용 + 호버 메뉴 */}
                  <td className="px-3 py-2.5 relative">
                    <div className="text-sm font-semibold text-foreground leading-snug mb-1.5">
                      <Highlight text={item.title} query={searchQuery} />
                      {item.thread_count > 0 && (
                        <span className="ml-1.5 text-[10px] font-normal text-lilac-500">스레드 {item.thread_count}</span>
                      )}
                      {item.reclassified_at && (
                        <span className="ml-1 text-[9px] px-1 py-px rounded font-medium bg-amber-100 text-amber-700">업데이트</span>
                      )}
                    </div>
                    {item.body && (
                      <MarkdownBody text={item.body} className="text-[11px] text-ink-400 leading-[1.6]" />
                    )}
                    {/* 호버 액션 */}
                    {isHovered && (
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        {item.source_ref && (
                          <a
                            href={item.source_ref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-card border border-border text-ink-500 hover:text-foreground hover:border-ink-400 transition-colors"
                          >
                            <ExternalLink size={10} />
                            Slack
                          </a>
                        )}
                        {onCreateTask && (
                          <button
                            onClick={() => onCreateTask(item)}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-card border border-border text-ink-500 hover:text-foreground hover:border-ink-400 transition-colors"
                          >
                            <ListTodo size={10} />
                            태스크
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 브랜드 */}
                  <td className="px-3 py-2.5">
                    {client ? (
                      <button
                        onClick={() => onSelectBrand(client.name)}
                        className="inline-flex items-center gap-1.5 text-[11px] text-ink-700 hover:text-foreground transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: client.color }} />
                        <span className="truncate max-w-[70px]">{client.name}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-ink-300">—</span>
                    )}
                  </td>

                  {/* 태그 */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(item.tags ?? []).map(t => {
                        const meta = TAG_META[t]
                        if (!meta) return null
                        return (
                          <button
                            key={t}
                            onClick={() => onToggleTag(t)}
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-[1px] rounded font-medium"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            <span className="w-1 h-1 rounded-full" style={{ background: meta.dot }} />
                            {meta.label}
                          </button>
                        )
                      })}
                    </div>
                  </td>

                  {/* 우선순위 */}
                  <td className="px-3 py-2.5 text-center">
                    {item.priority && (
                      <PriorityBars priority={item.priority} />
                    )}
                  </td>

                  {/* 작성자 */}
                  <td className="px-3 py-2.5">
                    {item.author ? (
                      <button
                        onClick={() => onSelectAuthor(item.author!)}
                        className="text-[11px] text-ink-700 hover:text-foreground transition-colors truncate max-w-[70px] block"
                      >
                        {item.author}
                      </button>
                    ) : (
                      <span className="text-[11px] text-ink-300">—</span>
                    )}
                  </td>

                  {/* 채널 */}
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-500 truncate max-w-[90px]">
                      <Hash size={10} className="shrink-0 text-ink-300" />
                      {item.channel}
                    </span>
                  </td>

                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
