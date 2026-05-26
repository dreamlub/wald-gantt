'use client'

import { useState, useEffect } from 'react'
import { ArrowRight, Plus, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

import type { ActionItem, Priority, Tag } from '../_lib/types'
import { PRIORITY_META, TAG_META } from '../_lib/constants'
import { PriorityBars, BrandBadge } from './badges'
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from '@/components/ui/drawer'
import { toKSTDate } from '@/lib/history-query-utils'

export const SEV_TO_PRIORITY: Record<string, Priority> = { urgent: 'high', watch: 'medium', info: 'low' }

interface RelatedItem {
  id: string
  title: string
  body: string | null
  tags: Tag[]
  priority: Priority | null
  author: string | null
  thread_count: number
  raw_message_id: string | null
  raw_text: string | null
}

interface SimilarItem {
  id: string
  title: string
  body: string | null
  tags: Tag[]
  occurred_at: string
}

function kstDateLabel(utcStr: string): string {
  const [y, m, d] = toKSTDate(utcStr).split('-')
  return `${y}/${parseInt(m)}/${parseInt(d)}`
}

function slackTextClean(text: string) {
  return text
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<@[A-Z0-9]+>/g, '@사용자')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function renderBodyBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : <span key={i}>{part.replace(/\*/g, '')}</span>
  )
}

export function BodyBullets({ text, className }: { text: string; className?: string }) {
  const sentences = text
    .split('\n')
    .map(l => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .flatMap(line => line.split(/(?<=[.!?])\s+/).filter(Boolean))

  return (
    <ul className={`flex flex-col gap-1 ${className ?? ''}`}>
      {sentences.map((s, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className="mt-[5px] w-1 h-1 rounded-full bg-ink-300 shrink-0" />
          <span>{renderBodyBold(s)}</span>
        </li>
      ))}
    </ul>
  )
}

function RelatedItemCard({ item: r }: { item: RelatedItem }) {
  const [rawOpen, setRawOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="bg-muted/40 p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-xs font-semibold text-foreground leading-snug flex-1">{r.title}</p>
          <div className="flex items-center gap-2 shrink-0">
            {r.thread_count > 0 && <span className="text-3xs text-ink-400">{r.thread_count}개 답글</span>}
            {r.author && <span className="text-3xs text-ink-400">{r.author}</span>}
          </div>
        </div>
        {r.body && <BodyBullets text={r.body} className="text-2xs text-ink-500 leading-relaxed mb-2" />}
        {r.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {r.tags.map(tag => {
              const meta = TAG_META[tag]
              if (!meta) return null
              return (
                <span key={tag} className="text-3xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
              )
            })}
          </div>
        )}
      </div>
      {r.raw_text && (
        <div className="border-t border-border">
          <button
            onClick={() => setRawOpen(v => !v)}
            className="w-full flex items-center justify-between px-3.5 py-2 text-3xs text-ink-400 hover:bg-muted/30 transition-colors"
          >
            <span className="font-semibold uppercase tracking-wider">원본 메시지</span>
            <span className={`transition-transform ${rawOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {rawOpen && (
            <div className="px-3.5 pb-3.5 text-2xs text-ink-500 leading-relaxed whitespace-pre-wrap break-words bg-background border-t border-border/50">
              {slackTextClean(r.raw_text)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ActionDetailDrawer({
  open, item, date, onClose, onCreateTask,
}: {
  open: boolean
  item: ActionItem | null
  date: string
  onClose: () => void
  onCreateTask?: (title: string, memo: string) => void
}) {
  const [related, setRelated] = useState<RelatedItem[]>([])
  const [similar, setSimilar] = useState<SimilarItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!item || !open) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)

    ;(async () => {
      const sb = createClient()

      // occurred_at은 UTC로 저장하고, 조회 범위만 KST 날짜 경계(+09:00)로 비교한다.
      const [y, mo, d] = date.split('-').map(Number)
      const nextDate = new Date(y, mo - 1, d + 1)
      const nextDay = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`

      const { data: histData } = await sb
        .from('client_history')
        .select('id, title, body, tags, priority, author, thread_count, raw_message_id')
        .eq('brand_name', item.brand)
        .gte('occurred_at', `${date}T00:00:00+09:00`)
        .lt('occurred_at', `${nextDay}T00:00:00+09:00`)
        .is('deleted_at', null)

      if (cancelled) return

      type HistRow = { id: string; title: string; body: string | null; tags: Tag[]; priority: Priority | null; author: string | null; thread_count: number; raw_message_id: string | null }
      const rows: HistRow[] = (histData as HistRow[]) ?? []

      const rawIds = rows.map(r => r.raw_message_id).filter(Boolean) as string[]
      const rawInfoMap = new Map<string, { text: string | null; userName: string | null }>()

      if (rawIds.length > 0) {
        const { data: rawData } = await sb
          .from('slack_raw_messages')
          .select('id, raw_json')
          .in('id', rawIds)
        for (const r of rawData ?? []) {
          const rj = r.raw_json as { text?: string; user_name?: string; user?: string }
          rawInfoMap.set(r.id as string, { text: rj?.text ?? null, userName: rj?.user_name ?? rj?.user ?? null })
        }
      }

      const finalRows = rows.map(r => {
        const raw = r.raw_message_id ? rawInfoMap.get(r.raw_message_id) : null
        return { ...r, author: raw?.userName || r.author || null, raw_text: raw?.text ?? null }
      })

      const STOP = new Set(['관련', '이슈', '문제', '요청', '확인', '처리', '완료', '진행', '내용', '건', '및', '으로', '위해', '대한', '에서', '통해'])
      const keywords = item.title
        .split(/[\s·\-\(\)\[\]\/,—]+/)
        .map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, ''))
        .filter(w => w.length >= 2 && !STOP.has(w))
        .slice(0, 4)

      let similarRows: SimilarItem[] = []
      if (keywords.length > 0) {
        const orFilter = keywords.map(kw => `title.ilike.%${kw}%`).join(',')
        const { data: simData } = await sb
          .from('client_history')
          .select('id, title, body, tags, occurred_at')
          .eq('brand_name', item.brand)
          .lt('occurred_at', `${date}T00:00:00+09:00`)
          .or(orFilter)
          .is('deleted_at', null)
          .order('occurred_at', { ascending: false })
          .limit(5)
        similarRows = (simData as SimilarItem[]) ?? []
      }

      if (!cancelled) { setRelated(finalRows); setSimilar(similarRows); setLoading(false) }
    })()

    return () => { cancelled = true }
  }, [item, date, open])

  const pri = item ? (SEV_TO_PRIORITY[item.severity] ?? 'medium') : 'medium'

  return (
    <Drawer open={open} onClose={onClose} width={520}>
      <DrawerHeader>
        <div className="flex items-start justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <BrandBadge brandName={item?.brand ?? ''} />
            <PriorityBars priority={pri} />
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-ink-400 hover:text-foreground transition-colors shrink-0">
            <X size={15} />
          </button>
        </div>
        <p className="px-5 pb-4 text-sm font-semibold text-foreground leading-snug">{item?.title}</p>
      </DrawerHeader>

      <DrawerBody className="[&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        <div className="px-5 py-4 border-b border-border">
          {item?.summary && <BodyBullets text={item.summary} className="text-sm text-ink-700 leading-relaxed" />}
        </div>
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 text-xs font-medium px-3 py-2.5 rounded border border-dashed"
            style={{
              borderColor: `color-mix(in srgb, ${PRIORITY_META[pri]?.color} 40%, transparent)`,
              color: PRIORITY_META[pri]?.color,
              background: `color-mix(in srgb, ${PRIORITY_META[pri]?.color} 6%, transparent)`,
            }}>
            <ArrowRight size={13} className="shrink-0" />
            <span>{item?.action}</span>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">관련 내역</span>
            {!loading && <span className="text-3xs text-ink-300">{related.length}건</span>}
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={14} className="animate-spin text-ink-400" /></div>
          ) : related.length === 0 ? (
            <p className="text-xs text-ink-300 py-3">—</p>
          ) : (
            <div className="space-y-2">{related.map(r => <RelatedItemCard key={r.id} item={r} />)}</div>
          )}
        </div>

        {!loading && similar.length > 0 && (
          <div className="px-5 py-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xs font-semibold text-ink-400 uppercase tracking-wider">과거 유사 내역</span>
              <span className="text-3xs text-ink-300">{similar.length}건</span>
            </div>
            <div className="space-y-1.5">
              {similar.map(s => (
                <div key={s.id} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="text-3xs text-ink-400 shrink-0 mt-[2px] tabular-nums">{kstDateLabel(s.occurred_at)}</span>
                    <p className="text-xs text-foreground leading-snug flex-1">{s.title}</p>
                  </div>
                  {s.body && <BodyBullets text={s.body} className="text-2xs text-ink-400 leading-relaxed ml-[3.5rem]" />}
                  {s.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 ml-[3.5rem]">
                      {s.tags.map(tag => {
                        const meta = TAG_META[tag]
                        if (!meta) return null
                        return (
                          <span key={tag} className="text-3xs px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DrawerBody>

      {onCreateTask && (
        <DrawerFooter>
          <button
            onClick={() => { onCreateTask(item?.title ?? '', `${item?.summary ?? ''}\n\n→ ${item?.action ?? ''}`); onClose() }}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Plus size={13} />
            태스크 생성
          </button>
        </DrawerFooter>
      )}
    </Drawer>
  )
}
