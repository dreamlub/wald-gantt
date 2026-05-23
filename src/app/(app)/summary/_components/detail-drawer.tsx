'use client'

import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { X, ExternalLink, Copy, Check, Plus, Pencil, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Client, HistoryItem, Tag, Priority, ThreadReply } from '../_lib/types'
import { createClient } from '@/lib/supabase/client'
import { fetchThreadRepliesForItem } from '../_lib/thread-replies'
import { TAG_META, TAG_KEYS, PRIORITY_META } from '../_lib/mock-data'
import { PriorityBars } from './badges'
import { Drawer, DrawerHeader, DrawerBody } from '@/components/ui/drawer'

interface EditDraft {
  client_id: string
  author: string | null
  priority: Priority | null
  tags: Tag[]
}

interface Props {
  open: boolean
  item: HistoryItem | null
  clients: Client[]
  onClose: () => void
  onCreateTask?: (item: HistoryItem) => void
  onCreateProject?: (item: HistoryItem) => void
  onSaveItem?: (id: string, updates: Partial<EditDraft>) => Promise<void>
}

export function HistoryDetailDrawer({
  open, item, clients, onClose,
  onCreateTask, onCreateProject, onSaveItem,
}: Props) {
  const [copied,        setCopied]        = useState(false)
  const [isEditing,     setIsEditing]     = useState(false)
  const [draft,         setDraft]         = useState<EditDraft | null>(null)
  const [isSaving,      setIsSaving]      = useState(false)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [brandDropOpen, setBrandDropOpen] = useState(false)
  const [threadReplies, setThreadReplies] = useState<ThreadReply[]>([])
  const brandDropRef = useRef<HTMLDivElement>(null)

  // 슬랙 스레드 답글 lazy-fetch
  useEffect(() => {
    if (!item) return
    let cancelled = false
    const sb = createClient()
    fetchThreadRepliesForItem(sb, item)
      .then(replies => { if (!cancelled) setThreadReplies(replies) })
      .catch(error => {
        console.error('[summary/detail] thread replies fetch failed:', error)
        if (!cancelled) setThreadReplies([])
      })
    return () => { cancelled = true }
  }, [item])

  useEffect(() => {
    if (!brandDropOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!brandDropRef.current?.contains(e.target as Node)) setBrandDropOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [brandDropOpen])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (isEditing) cancelEdit()
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, isEditing])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      setCopied(false)
      setIsEditing(false)
      setDraft(null)
      setSaveError(null)
    })
  }, [open, item?.id])

  const client = clients.find(c => c.id === (isEditing && draft ? draft.client_id : item?.client_id))

  async function copyBody() {
    if (!item?.body) return
    try {
      await navigator.clipboard.writeText(`${item.title}\n\n${item.body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  function startEdit() {
    if (!item) return
    setDraft({
      client_id: item.client_id,
      author:    item.author,
      priority:  item.priority,
      tags:      [...(item.tags ?? [])],
    })
    setSaveError(null)
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setDraft(null)
    setSaveError(null)
  }

  async function saveEdit() {
    if (!item || !draft || !onSaveItem) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await onSaveItem(item.id, draft)
      setIsEditing(false)
      setDraft(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setIsSaving(false)
    }
  }

  const displayPriority = isEditing && draft ? draft.priority : item?.priority
  const displayAuthor   = isEditing && draft ? draft.author   : item?.author
  const displayTags     = isEditing && draft ? draft.tags     : (item?.tags ?? [])

  return (
    <Drawer open={open} onClose={onClose} closeOnBackdrop={!isEditing}>
        {/* 헤더 */}
        <DrawerHeader>
          <div className="flex items-center px-5 h-12 gap-1">
          <h2 className="text-xs font-semibold text-foreground flex-1">상세 정보</h2>
          {!isEditing && item?.body && (
            <button onClick={copyBody} className="p-1 text-ink-300 hover:text-foreground rounded transition-colors" title="제목+본문 복사">
              {copied ? <Check size={14} className="text-mint-500" /> : <Copy size={14} />}
            </button>
          )}
          {!isEditing && item?.source_ref && (
            <a href={item.source_ref} target="_blank" rel="noreferrer"
              className="p-1 text-ink-300 hover:text-accent-foreground rounded transition-colors" title="슬랙 원본 열기">
              <ExternalLink size={14} />
            </a>
          )}
          {!isEditing && onSaveItem && item && (
            <button onClick={startEdit} className="p-1 text-ink-300 hover:text-foreground rounded transition-colors" title="편집">
              <Pencil size={14} />
            </button>
          )}
          <button onClick={isEditing ? cancelEdit : onClose} className="p-1 text-ink-400 hover:text-muted-foreground rounded">
            <X size={16} />
          </button>
          </div>
        </DrawerHeader>

        {item && (
          <DrawerBody className="px-5 py-4 space-y-4">
            {/* 제목 */}
            <div>
              <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">제목</div>
              <h3 className="text-xs font-semibold text-foreground leading-[1.4]">{item.title}</h3>
            </div>

            {/* 메타 그리드 */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pb-4 border-b border-ink-150">
              <Meta label="브랜드">
                {isEditing && draft ? (
                  <div ref={brandDropRef} className="relative">
                    <button
                      onClick={() => setBrandDropOpen(o => !o)}
                      className="w-full inline-flex items-center gap-2 px-2 py-1 rounded text-xs bg-card border border-border hover:border-ink-300 transition-colors text-foreground"
                    >
                      {(() => {
                        const c = clients.find(x => x.id === draft.client_id)
                        return c ? (
                          <>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                            <span className="flex-1 truncate text-left">{c.name}</span>
                          </>
                        ) : <span className="flex-1 text-left text-muted-foreground">선택</span>
                      })()}
                      <ChevronDown size={11} className="shrink-0 text-ink-400" />
                    </button>
                    {brandDropOpen && (
                      <div className="absolute top-full left-0 mt-1 w-full bg-card border border-border rounded shadow-lg z-10 max-h-48 overflow-y-auto p-1">
                        {clients.map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setDraft(d => ({ ...d!, client_id: c.id })); setBrandDropOpen(false) }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
                              draft.client_id === c.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  client ? (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: client.color }} />
                      {client.name}
                    </span>
                  ) : <span className="text-xs text-ink-300">—</span>
                )}
              </Meta>

              <Meta label="중요도">
                {isEditing && draft ? (
                  <div className="flex gap-1 flex-wrap">
                    {(['high', 'medium', 'low'] as Priority[]).map(p => {
                      const meta = PRIORITY_META[p]
                      const active = draft.priority === p
                      return (
                        <button
                          key={p}
                          onClick={() => setDraft(d => ({ ...d!, priority: d!.priority === p ? null : p }))}
                          className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors ${
                            active ? 'border-transparent font-medium' : 'border-border text-muted-foreground hover:border-ink-300'
                          }`}
                          style={active ? { background: meta.bg, color: meta.color } : undefined}
                        >
                          <PriorityBars priority={p} />
                          {meta.label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  displayPriority ? (
                    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: PRIORITY_META[displayPriority].color }}>
                      <PriorityBars priority={displayPriority} />
                      <span className="font-medium">{PRIORITY_META[displayPriority].label}</span>
                    </span>
                  ) : <span className="text-xs text-ink-300">—</span>
                )}
              </Meta>

              <Meta label="작성자">
                {isEditing && draft ? (
                  <input
                    type="text"
                    value={draft.author ?? ''}
                    onChange={e => setDraft(d => ({ ...d!, author: e.target.value || null }))}
                    className="text-xs border border-border rounded px-2 py-1 bg-card text-foreground outline-none focus:border-lilac-300 w-full"
                    placeholder="작성자 없음"
                  />
                ) : (
                  <span className="text-xs text-foreground">{displayAuthor ?? <span className="text-ink-300">—</span>}</span>
                )}
              </Meta>

              <Meta label="채널">
                <span className="text-xs text-foreground">#{item.channel}</span>
              </Meta>

              <Meta label="등록일" full>
                <span className="text-xs text-foreground tabular-nums">
                  {format(new Date(item.occurred_at), 'yyyy.MM.dd (eee) HH:mm', { locale: ko })}
                </span>
              </Meta>
            </div>

            {/* 태그 */}
            <div>
              <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2">태그</div>
              {isEditing && draft ? (
                <div className="flex flex-wrap gap-1.5">
                  {TAG_KEYS.map(t => {
                    const meta = TAG_META[t]
                    const active = draft.tags.includes(t)
                    return (
                      <button
                        key={t}
                        onClick={() => setDraft(d => {
                          const tags = d!.tags.includes(t)
                            ? d!.tags.filter(x => x !== t)
                            : [...d!.tags, t]
                          return { ...d!, tags }
                        })}
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-[3px] rounded font-medium transition-colors ${
                          active ? '' : 'bg-muted text-ink-500 hover:text-foreground'
                        }`}
                        style={active ? { background: meta.bg, color: meta.color } : undefined}
                      >
                        {active && <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />}
                        {meta.label}
                      </button>
                    )
                  })}
                </div>
              ) : (
                displayTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {displayTags.map(t => {
                      const meta = TAG_META[t]
                      if (!meta) return null
                      return (
                        <span key={t}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-[3px] rounded font-medium"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                          {meta.label}
                        </span>
                      )
                    })}
                  </div>
                ) : <span className="text-xs text-ink-300">—</span>
              )}
            </div>

            {/* 본문 */}
            {item.body && (
              <div>
                <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2">본문</div>
                <div className="text-xs text-foreground leading-[1.7] whitespace-pre-wrap break-words">
                  {item.body}
                </div>
              </div>
            )}

            {/* 스레드 답글 */}
            {threadReplies.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2">
                  스레드 답글 <span className="text-ink-300 font-normal">({threadReplies.length})</span>
                </div>
                <div className="space-y-2">
                  {threadReplies.map((r, i) => (
                    <div key={i} className="bg-muted rounded-md px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-foreground">{r.author}</span>
                        <span className="text-[10px] text-ink-400 tabular-nums shrink-0">
                          {format(new Date(r.occurred_at), 'MM/dd HH:mm', { locale: ko })}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-[1.6] whitespace-pre-wrap break-words">{r.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 하단 액션 */}
            {!isEditing && (
              <div className="pt-2 flex flex-col gap-5">
                {item.source_ref && (
                  <a href={item.source_ref} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-accent-foreground hover:underline">
                    <ExternalLink size={12} />
                    슬랙 원본 메시지 열기
                  </a>
                )}
                {(onCreateTask || onCreateProject) && (
                  <div className="flex gap-2">
                    {onCreateTask && (
                      <button
                        onClick={() => onCreateTask(item)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-muted text-xs font-medium text-ink-500 hover:bg-card hover:text-foreground border border-border hover:border-ink-300 transition-colors"
                      >
                        <Plus size={12} />
                        태스크 추가
                      </button>
                    )}
                    {onCreateProject && (
                      <button
                        onClick={() => onCreateProject(item)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-muted text-xs font-medium text-ink-500 hover:bg-card hover:text-foreground border border-border hover:border-ink-300 transition-colors"
                      >
                        <Plus size={12} />
                        프로젝트 추가
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </DrawerBody>
        )}

        {/* 편집 푸터 */}
        {isEditing && item && (
          <div className="shrink-0 px-5 py-3 border-t flex flex-col gap-2">
            {saveError && <p className="text-[11px] text-destructive">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelEdit}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-60"
              >
                취소
              </button>
              <button
                onClick={saveEdit}
                disabled={isSaving}
                className="px-4 py-1.5 text-xs bg-foreground text-background rounded font-medium hover:bg-ink-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}
    </Drawer>
  )
}

function Meta({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-0.5">{label}</div>
      <div>{children}</div>
    </div>
  )
}
