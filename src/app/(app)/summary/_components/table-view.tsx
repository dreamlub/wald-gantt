'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ExternalLink, ListTodo, CalendarRange, ChevronUp, ChevronDown, MessageSquare, History, ChevronRight } from 'lucide-react'

import type { Client, HistoryItem, Tag, Priority, ThreadReply, SummaryVersion } from '../_lib/types'
import { createClient } from '@/lib/supabase/client'
import { fetchThreadRepliesForItem, fetchSummaryVersions } from '../_lib/thread-replies'
import { TAG_META, PRIORITY_META } from '../_lib/mock-data'
import { PriorityBars } from './badges'
import { SlackText } from './slack-text'


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

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtReplyTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getDateLabel(iso: string): string {
  const todayMs = new Date().setHours(0, 0, 0, 0)
  const itemMs = new Date(iso.slice(0, 10) + 'T00:00:00').getTime()
  const diff = Math.round((todayMs - itemMs) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  return format(new Date(iso), 'M월 d일 (eee)', { locale: ko })
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

// ── 오른쪽 패널 ────────────────────────────────────────────────

interface DetailPanelProps {
  item: HistoryItem
  client?: Client
  selectedIdx: number
  totalCount: number
  summaryVersions: SummaryVersion[]
  onPrev: () => void
  onNext: () => void
  onToggleTag: (t: Tag) => void
  onSelectBrand: (id: string) => void
  onSelectAuthor: (a: string) => void
  onCreateTask?: (item: HistoryItem) => void
  onCreateProject?: (item: HistoryItem) => void
}

function DetailPanel({
  item, client, selectedIdx, totalCount, summaryVersions,
  onPrev, onNext, onToggleTag, onSelectBrand, onSelectAuthor,
  onCreateTask, onCreateProject,
}: DetailPanelProps) {
  const [versionsOpen, setVersionsOpen] = useState(false)

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* 헤더 바 */}
      <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 border-b bg-muted flex-wrap">
        {item.priority && (
          <span
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-medium"
            style={{ background: PRIORITY_META[item.priority].bg, color: PRIORITY_META[item.priority].color }}
          >
            <PriorityBars priority={item.priority} />
            {PRIORITY_META[item.priority].label}
          </span>
        )}
        {client && (
          <button
            onClick={() => onSelectBrand(item.brand_name ?? '')}
            className="inline-flex items-center gap-1.5 text-[11px] text-ink-500 hover:text-foreground transition-colors"
            title={`${client.name}로 필터`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: client.color }} />
            {client.name}
          </button>
        )}
        <span className="ml-auto text-[11px] text-ink-400 tabular-nums">
          {format(new Date(item.occurred_at), 'M/d HH:mm', { locale: ko })}
        </span>
        <span className="text-[10px] text-ink-400 shrink-0">{selectedIdx + 1}/{totalCount}</span>
        <button
          onClick={onPrev}
          disabled={selectedIdx <= 0}
          className="p-0.5 text-ink-400 hover:text-foreground disabled:opacity-25 transition-colors"
          title="이전 항목 (↑/K)"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={onNext}
          disabled={selectedIdx >= totalCount - 1}
          className="p-0.5 text-ink-400 hover:text-foreground disabled:opacity-25 transition-colors"
          title="다음 항목 (↓/J)"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* 본문 스크롤 */}
      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">
        {/* 제목 */}
        <h2 className="text-base leading-[1.4] font-semibold text-foreground">
          {item.title}
        </h2>

        {/* 태그 */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map(t => {
              const meta = TAG_META[t]
              if (!meta) return null
              return (
                <button
                  key={t}
                  onClick={() => onToggleTag(t)}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-[3px] rounded font-medium transition-opacity hover:opacity-70"
                  style={{ background: meta.bg, color: meta.color }}
                  title={`${meta.label} 필터`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                  {meta.label}
                </button>
              )
            })}
          </div>
        )}

        {/* 본문 텍스트 */}
        {item.body && (
          <MarkdownBody text={item.body} className="text-[13px] text-ink-700 leading-[1.75] break-words" />
        )}

        {/* 요약 이력 */}
        {summaryVersions.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setVersionsOpen(v => !v)}
              className="w-full px-4 py-2.5 bg-muted border-b border-border flex items-center justify-between hover:bg-accent/20 transition-colors"
            >
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-600">
                <History size={11} />
                이전 요약 이력 {summaryVersions.length}건
              </span>
              <ChevronRight
                size={12}
                className={`text-ink-400 transition-transform ${versionsOpen ? 'rotate-90' : ''}`}
              />
            </button>
            {versionsOpen && (
              <div className="divide-y divide-border">
                {summaryVersions.map(v => (
                  <div key={v.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-ink-400 tabular-nums">
                        {format(new Date(v.archived_at), 'M/d HH:mm', { locale: ko })} 기준 (스레드 {v.thread_count}개)
                      </span>
                    </div>
                    <p className="text-[12px] font-medium text-ink-600">{v.title}</p>
                    {v.body && (
                      <MarkdownBody text={v.body} className="text-[12px] text-ink-500 leading-[1.6] break-words" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 스레드 답변 */}
        {item.thread_replies && item.thread_replies.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-muted border-b border-border flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-600">
                <MessageSquare size={11} />
                스레드 답변 {item.thread_replies.length}
              </span>
              <span className="text-[10px] text-ink-400 tabular-nums">
                마지막 활동 {fmtReplyTime(item.thread_replies[item.thread_replies.length - 1].occurred_at)}
              </span>
            </div>
            <div className="divide-y divide-border">
              {item.thread_replies.map((reply, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-foreground">{reply.author}</span>
                    <span className="text-[10px] text-ink-400 tabular-nums">{fmtReplyTime(reply.occurred_at)}</span>
                  </div>
                  {reply.ai_body ? (
                    <p className="text-[13px] text-foreground leading-[1.75] whitespace-pre-wrap break-words">
                      {reply.ai_body}
                    </p>
                  ) : (
                    <SlackText text={reply.text} className="text-[13px] text-foreground leading-[1.6] break-words" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}


        {/* 메타 푸터 */}
        <div className="grid grid-cols-3 gap-4 py-4 border-t border-ink-150">
          <div>
            <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">작성자</div>
            {item.author ? (
              <button
                onClick={() => onSelectAuthor(item.author!)}
                className="text-xs text-foreground hover:text-lilac-500 transition-colors truncate block max-w-full text-left"
                title={`${item.author}로 필터`}
              >
                {item.author}
              </button>
            ) : <span className="text-xs text-ink-300">—</span>}
          </div>
          <div>
            <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">브랜드</div>
            {client ? (
              <button
                onClick={() => onSelectBrand(item.brand_name ?? '')}
                className="inline-flex items-center gap-1.5 text-xs text-foreground hover:text-lilac-500 transition-colors"
                title={`${client.name}로 필터`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: client.color }} />
                {client.name}
              </button>
            ) : <span className="text-xs text-ink-300">—</span>}
          </div>
          <div>
            <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">채널</div>
            <span className="text-xs text-foreground">#{item.channel}</span>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex flex-wrap gap-2 pb-2">
          {item.source_ref && (
            <a
              href={item.source_ref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-muted text-xs font-medium text-ink-500 hover:bg-card hover:text-foreground border border-border hover:border-ink-300 transition-colors"
            >
              <ExternalLink size={12} />
              Slack에서 열기
            </a>
          )}
          {onCreateTask && (
            <button
              onClick={() => onCreateTask(item)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-muted text-xs font-medium text-ink-500 hover:bg-card hover:text-foreground border border-border hover:border-ink-300 transition-colors"
            >
              <ListTodo size={12} />
              할 일로 등록
            </button>
          )}
          {onCreateProject && (
            <button
              onClick={() => onCreateProject(item)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-muted text-xs font-medium text-ink-500 hover:bg-card hover:text-foreground border border-border hover:border-ink-300 transition-colors"
            >
              <CalendarRange size={12} />
              일정 만들기
            </button>
          )}
        </div>
      </div>

      {/* 키보드 힌트 */}
      <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-2 border-t bg-muted">
        <span className="text-[10px] text-ink-400">↑↓ 또는 J/K로 이동</span>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────

export function TableView({
  items, clients, searchQuery, hasFilters,
  onToggleTag, onSelectBrand, onSelectAuthor, onClearFilters,
  onCreateTask, onCreateProject,
}: Props) {
  const brandMap = useMemo(() => new Map(clients.map(c => [c.name, c])), [clients])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [threadReplies, setThreadReplies] = useState<ThreadReply[]>([])
  const [summaryVersions, setSummaryVersions] = useState<SummaryVersion[]>([])
  const selectedRowRef = useRef<HTMLDivElement>(null)

  // 날짜별 그룹 — items는 이미 날짜 내림차순 정렬, 모든 본문(parent) 표시
  const dateGroups = useMemo(() => {
    const groups: { dateKey: string; label: string; items: HistoryItem[] }[] = []
    const seen = new Map<string, (typeof groups)[0]>()
    for (const item of items) {
      const dateKey = item.occurred_at.slice(0, 10)
      if (!seen.has(dateKey)) {
        const g = { dateKey, label: getDateLabel(item.occurred_at), items: [] as HistoryItem[] }
        seen.set(dateKey, g)
        groups.push(g)
      }
      seen.get(dateKey)!.items.push(item)
    }
    return groups
  }, [items])

  // 평탄화된 리스트 (키보드 nav용)
  const flatItems = useMemo(() => dateGroups.flatMap(g => g.items), [dateGroups])

  const selectedItem = useMemo<HistoryItem | null>(() => {
    if (selectedId) {
      const found = flatItems.find(i => i.id === selectedId)
      if (found) return found
    }
    return flatItems[0] ?? null
  }, [flatItems, selectedId])

  const selectedIdx = useMemo(
    () => selectedItem ? flatItems.findIndex(i => i.id === selectedItem.id) : -1,
    [flatItems, selectedItem]
  )

  const selectByIndex = useCallback((idx: number) => {
    if (idx < 0 || idx >= flatItems.length) return
    setSelectedId(flatItems[idx].id)
  }, [flatItems])

  // 선택된 아이템의 스레드 replies + 요약 이력 lazy-fetch
  useEffect(() => {
    if (!selectedItem) return
    let cancelled = false
    const sb = createClient()
    Promise.all([
      fetchThreadRepliesForItem(sb, selectedItem),
      selectedItem.id ? fetchSummaryVersions(sb, selectedItem.id) : Promise.resolve([]),
    ]).then(([replies, versions]) => {
      if (!cancelled) {
        setThreadReplies(replies)
        setSummaryVersions(versions)
      }
    }).catch(error => {
      console.error('[summary/table] fetch failed:', error)
      if (!cancelled) { setThreadReplies([]); setSummaryVersions([]) }
    })
    return () => { cancelled = true }
  }, [selectedItem])

  // 선택 아이템 변경 시 목록에서 스크롤
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedItem?.id])

  // 키보드 내비게이션
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).matches('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        selectByIndex(selectedIdx - 1)
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        selectByIndex(selectedIdx + 1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedIdx, selectByIndex])

  if (items.length === 0) {
    return (
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
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 왼쪽 패널 — 스레드 목록 */}
      <div className="w-[380px] shrink-0 border-r flex flex-col overflow-hidden">
        <div data-scrolltop className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {dateGroups.map(group => (
            <div key={group.dateKey}>
              {/* 날짜 그룹 헤더 */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-muted border-b border-ink-150">
                <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">
                  {group.label}
                </span>
                <span className="text-[10px] text-ink-400">{group.items.length}</span>
              </div>
              {/* 아이템 카드 */}
              {group.items.map(item => {
                const client = brandMap.get(item.brand_name ?? '')
                const isSelected = selectedItem?.id === item.id
                return (
                  <div
                    key={item.id}
                    ref={isSelected ? selectedRowRef : undefined}
                    onClick={() => setSelectedId(item.id)}
                    className={`flex flex-col gap-1 px-4 py-3 border-b border-ink-150 border-l-[3px] cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-accent/30 border-l-lilac-400'
                        : 'hover:bg-muted border-l-transparent'
                    }`}
                  >
                    {/* 브랜드 + 채널 + 시간 */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {client && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: client.color }} />
                      )}
                      <span className="text-[11px] font-medium text-ink-500 truncate flex-1 min-w-0">
                        {client?.name ?? '—'}
                      </span>
                      <span className="text-[10px] text-ink-400 shrink-0">#{item.channel}</span>
                      <span className="text-[10px] text-ink-400 shrink-0 tabular-nums ml-1">
                        {fmtTime(item.occurred_at)}
                      </span>
                      {item.thread_count > 0 && (
                        <span
                          className="ml-1 w-1.5 h-1.5 rounded-full bg-lilac-500 shrink-0"
                          title={`스레드 답변 ${item.thread_count}건`}
                        />
                      )}
                      {item.reclassified_at && (
                        <span
                          className="ml-0.5 text-[9px] px-1 py-px rounded font-medium bg-amber-100 text-amber-700 shrink-0"
                          title={`요약 업데이트됨: ${format(new Date(item.reclassified_at), 'M/d HH:mm', { locale: ko })}`}
                        >
                          업데이트
                        </span>
                      )}
                    </div>
                    {/* 제목 */}
                    <div className="text-sm leading-[1.4] font-medium text-foreground">
                      <Highlight text={item.title} query={searchQuery} />
                    </div>
                    {/* 태그 */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        {item.tags.map(t => {
                          const meta = TAG_META[t]
                          if (!meta) return null
                          return (
                            <span
                              key={t}
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-[2px] rounded font-medium"
                              style={{ background: meta.bg, color: meta.color }}
                            >
                              <span className="w-1 h-1 rounded-full" style={{ background: meta.dot }} />
                              {meta.label}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 오른쪽 패널 — 인라인 디테일 */}
      {selectedItem ? (
        <DetailPanel
          item={{ ...selectedItem, thread_replies: threadReplies }}
          client={brandMap.get(selectedItem.brand_name ?? '')}
          selectedIdx={selectedIdx}
          totalCount={flatItems.length}
          summaryVersions={summaryVersions}
          onPrev={() => selectByIndex(selectedIdx - 1)}
          onNext={() => selectByIndex(selectedIdx + 1)}
          onToggleTag={onToggleTag}
          onSelectBrand={onSelectBrand}
          onSelectAuthor={onSelectAuthor}
          onCreateTask={onCreateTask}
          onCreateProject={onCreateProject}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-ink-400">항목을 선택하세요</p>
        </div>
      )}
    </div>
  )
}
