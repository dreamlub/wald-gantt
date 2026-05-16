'use client'

import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { X, ExternalLink, Copy, Check } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { Client, HistoryItem } from '../_lib/types'
import { TAG_META, PRIORITY_META } from '../_lib/mock-data'
import { PriorityBars } from './badges'

interface Props {
  open: boolean
  item: HistoryItem | null
  client: Client | undefined
  onClose: () => void
}

export function HistoryDetailDrawer({ open, item, client, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => { if (open) setCopied(false) }, [open, item?.id])

  async function copyBody() {
    if (!item?.body) return
    try {
      await navigator.clipboard.writeText(`${item.title}\n\n${item.body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-[480px] bg-card shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* 헤더 */}
        <div className="shrink-0 border-b flex items-center px-5 h-12 gap-1">
          <h2 className="text-sm font-semibold text-foreground flex-1">상세 정보</h2>
          {item?.body && (
            <button
              onClick={copyBody}
              className="p-1 text-ink-300 hover:text-foreground rounded transition-colors"
              title="제목+본문 복사"
            >
              {copied ? <Check size={14} className="text-mint-500" /> : <Copy size={14} />}
            </button>
          )}
          {item?.source_ref && (
            <a
              href={item.source_ref}
              target="_blank"
              rel="noreferrer"
              className="p-1 text-ink-300 hover:text-accent-foreground rounded transition-colors"
              title="슬랙 원본 열기"
            >
              <ExternalLink size={14} />
            </a>
          )}
          <button onClick={onClose} className="p-1 text-ink-400 hover:text-muted-foreground rounded">
            <X size={16} />
          </button>
        </div>

        {item && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* 제목 */}
            <div>
              <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">제목</div>
              <h3 className="text-[15px] font-semibold text-foreground leading-[1.4]">{item.title}</h3>
            </div>

            {/* 메타 정보 그리드 */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pb-4 border-b border-ink-150">
              <Meta label="브랜드">
                {client && (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: client.color }} />
                    {client.name}
                  </span>
                )}
              </Meta>
              <Meta label="중요도">
                {item.priority ? (
                  <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: PRIORITY_META[item.priority].color }}>
                    <PriorityBars priority={item.priority} />
                    <span className="font-medium">{PRIORITY_META[item.priority].label}</span>
                  </span>
                ) : <span className="text-xs text-ink-300">—</span>}
              </Meta>
              <Meta label="작성자">
                <span className="text-xs text-foreground">{item.author ?? <span className="text-ink-300">—</span>}</span>
              </Meta>
              <Meta label="채널">
                <span className="text-xs text-foreground font-mono">#{item.channel}</span>
              </Meta>
              <Meta label="등록일" full>
                <span className="text-xs text-foreground tabular-nums">
                  {format(new Date(item.occurred_at), 'yyyy.MM.dd (eee) HH:mm', { locale: ko })}
                </span>
              </Meta>
            </div>

            {/* 태그 */}
            {item.tags && item.tags.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2">태그</div>
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map(t => {
                    const meta = TAG_META[t]
                    return (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-[3px] rounded font-medium"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                        {meta.label}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 본문 */}
            {item.body && (
              <div>
                <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2">본문</div>
                <div className="text-[13px] text-foreground leading-[1.7] whitespace-pre-wrap break-words">
                  {item.body}
                </div>
              </div>
            )}

            {/* 슬랙 링크 */}
            {item.source_ref && (
              <div className="pt-2">
                <a
                  href={item.source_ref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-foreground hover:underline"
                >
                  <ExternalLink size={12} />
                  슬랙 원본 메시지 열기
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
