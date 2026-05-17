'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ListTodo, CalendarRange } from 'lucide-react'

import type { Client, HistoryItem, Tag, Priority } from '../_lib/types'
import { TAG_META } from '../_lib/mock-data'

type SortKey = 'brand' | 'author' | 'date'
type SortDir = 'asc' | 'desc'

interface Props {
  items: HistoryItem[]
  clients: Client[]
  selectedTags:     Set<Tag>
  searchQuery?:     string
  hasFilters:       boolean
  onToggleTag:      (t: Tag) => void
  onSelectBrand:    (id: string) => void
  onSelectAuthor:   (a: string) => void
  onOpenItem:       (item: HistoryItem) => void
  onClearFilters:   () => void
  onCreateTask?:    (item: HistoryItem) => void
  onCreateProject?: (item: HistoryItem) => void
}

const PRIORITY_TITLE_CLASS: Record<Priority, string> = {
  high:   'font-semibold text-rose-500',
  medium: 'font-medium text-foreground',
  low:    'font-medium text-muted-foreground',
}
const TAG_ORDER: Tag[] = ['issue', 'mention', 'in_progress', 'decision', 'schedule', 'done']

function SortBtn({
  col, label, align = 'left', sortKey, sortDir, onToggle,
}: {
  col: SortKey
  label: string
  align?: 'left' | 'right'
  sortKey: SortKey
  sortDir: SortDir
  onToggle: (k: SortKey) => void
}) {
  const active = sortKey === col
  return (
    <button
      onClick={() => onToggle(col)}
      className={`flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-wider hover:text-muted-foreground transition-colors
        ${align === 'right' ? 'justify-end w-full' : ''}
        ${active ? 'text-accent-foreground' : 'text-ink-400'}`}
    >
      {label}
      <span className={`text-[8px] ${active ? '' : 'opacity-30'}`}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )
}

export function TableView({
  items, clients, selectedTags, searchQuery, hasFilters,
  onToggleTag, onSelectBrand, onSelectAuthor, onOpenItem, onClearFilters,
  onCreateTask, onCreateProject,
}: Props) {
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])

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
        cmp = (clientMap.get(a.client_id)?.name ?? '').localeCompare(clientMap.get(b.client_id)?.name ?? '', 'ko')
      } else if (sortKey === 'author') {
        cmp = (a.author ?? '').localeCompare(b.author ?? '', 'ko')
      } else if (sortKey === 'date') {
        cmp = a.occurred_at.localeCompare(b.occurred_at)
      }
      if (sortKey !== 'date' && cmp === 0) cmp = b.occurred_at.localeCompare(a.occurred_at)
      return cmp * mult
    })
    return arr
  }, [items, sortKey, sortDir, clientMap])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 헤더 — 고정 */}
      <div className="flex items-center gap-4 px-6 py-2 border-b bg-muted shrink-0">
        <div className="flex-1 min-w-0 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">내용</div>
        <div className="w-24 shrink-0"><SortBtn col="brand" label="브랜드" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></div>
        <div className="w-20 shrink-0 text-[11px] font-semibold text-ink-400 uppercase tracking-wider">태그</div>
        <div className="w-20 shrink-0"><SortBtn col="author" label="작성자" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></div>
        <div className="w-28 shrink-0"><SortBtn col="date" label="등록일시" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></div>
      </div>

      {/* 행 — 스크롤 */}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
          <div className="text-xs text-muted-foreground mb-1">
            {hasFilters ? '조건에 맞는 항목이 없어요' : '수집된 히스토리가 없어요'}
          </div>
          <div className="text-[11px] text-ink-400 mb-4">
            {hasFilters ? '필터를 조정하거나 초기화해보세요' : 'MCP로 슬랙 메시지가 들어오면 여기 표시됩니다'}
          </div>
          {hasFilters && (
            <button
              onClick={onClearFilters}
              className="text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
            >
              필터 초기화
            </button>
          )}
        </div>
      ) : (
      <div data-scrolltop className="flex-1 overflow-y-auto [scrollbar-gutter:stable] bg-card">
      {sorted.map(item => {
        const client = clientMap.get(item.client_id)
        return (
          <div
            key={item.id}
            onClick={() => onOpenItem(item)}
            className="group flex items-start gap-4 px-6 py-3 border-b border-ink-150 hover:bg-muted transition-colors cursor-pointer"
          >
            <div className="flex-1 min-w-0 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className={`text-sm leading-[1.45] ${item.priority ? PRIORITY_TITLE_CLASS[item.priority] : 'font-medium text-muted-foreground'}`}>
                  <Highlight text={item.title} query={searchQuery} />
                </div>
                {item.body && (
                  <div className="text-xs text-muted-foreground leading-[1.5] mt-1.5">
                    {item.body.split('\n').filter(Boolean).map((line, i) => (
                      <div key={i}><Highlight text={line} query={searchQuery} /></div>
                    ))}
                  </div>
                )}
              </div>
              {(onCreateTask || onCreateProject) && (
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onCreateTask && (
                    <button
                      onClick={e => { e.stopPropagation(); onCreateTask(item) }}
                      className="p-1 rounded text-ink-400 hover:text-foreground hover:bg-card transition-colors"
                      title="태스크로 생성"
                    >
                      <ListTodo size={13} />
                    </button>
                  )}
                  {onCreateProject && (
                    <button
                      onClick={e => { e.stopPropagation(); onCreateProject(item) }}
                      className="p-1 rounded text-ink-400 hover:text-foreground hover:bg-card transition-colors"
                      title="스케줄 프로젝트로 생성"
                    >
                      <CalendarRange size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="w-24 shrink-0">
              {client ? (
                <button
                  onClick={e => { e.stopPropagation(); onSelectBrand(client.id) }}
                  className="flex items-center gap-1.5 max-w-full hover:opacity-70 transition-opacity"
                  title={`${client.name}로 필터`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: client.color }} />
                  <span className="text-xs text-muted-foreground truncate text-left">{client.name}</span>
                </button>
              ) : (
                <span className="text-xs text-ink-300">—</span>
              )}
            </div>
            <div className="w-20 shrink-0">
              {item.tags && item.tags.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {[...item.tags].sort((a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b)).map(t => {
                    const meta = TAG_META[t]
                    if (!meta) return null
                    const active = selectedTags.has(t)
                    return (
                      <button
                        key={t}
                        onClick={e => { e.stopPropagation(); onToggleTag(t) }}
                        className={`inline-flex items-center text-xs transition-opacity hover:opacity-70 ${active ? 'font-semibold' : 'font-normal'}`}
                        style={{ color: meta.color }}
                        title={`${meta.label}${active ? ' 필터 해제' : ' 필터 적용'}`}
                      >
                        #{meta.label}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <span className="text-xs text-ink-300">—</span>
              )}
            </div>
            <div className="w-20 shrink-0 min-w-0">
              {item.author ? (
                <button
                  onClick={e => { e.stopPropagation(); onSelectAuthor(item.author!) }}
                  className="block text-xs text-muted-foreground truncate text-left max-w-full hover:opacity-70 transition-opacity"
                  title={`${item.author}로 필터`}
                >
                  {item.author}
                </button>
              ) : (
                <span className="text-xs text-ink-300">—</span>
              )}
            </div>
            <div
              className="w-28 shrink-0 text-right text-xs tabular-nums text-ink-400"
              title={format(new Date(item.occurred_at), 'yyyy.MM.dd (eee) HH:mm', { locale: ko })}
            >
              {format(new Date(item.occurred_at), 'M/d HH:mm', { locale: ko })}
            </div>
          </div>
        )
      })}
      </div>
      )}
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
  let last = 0
  let pos = idx
  let k = 0
  while (pos >= 0) {
    if (pos > last) parts.push(text.slice(last, pos))
    parts.push(<mark key={k++} className="bg-amber-100 text-foreground rounded-sm px-0.5">{text.slice(pos, pos + needle.length)}</mark>)
    last = pos + needle.length
    pos = lower.indexOf(needle, last)
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
