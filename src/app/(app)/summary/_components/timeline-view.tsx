'use client'

import type { Client, HistoryItem } from '../_lib/types'
import { TAG_META, fmtMonth, fmtMonthDay } from '../_lib/mock-data'
import { TagList, BrandBadge, ChannelBadge, PriorityBadge } from './badges'

interface Props {
  items: HistoryItem[]
  clients: Client[]
}

export function TimelineView({ items, clients }: Props) {
  const clientMap = new Map(clients.map(c => [c.id, c]))

  const grouped = items.reduce((acc, item) => {
    const m = fmtMonth(item.occurred_at)
    if (!acc[m]) acc[m] = []
    acc[m].push(item)
    return acc
  }, {} as Record<string, HistoryItem[]>)
  const months = Object.entries(grouped)

  if (months.length === 0) {
    return <div className="text-center py-12 text-ink-400 text-xs">필터에 해당하는 항목이 없어요</div>
  }

  return (
    <div className="relative pl-[18px]">
      <div className="absolute left-[5px] top-0 bottom-0 w-px bg-border" />
      {months.map(([month, list]) => (
        <div key={month} className="mb-[22px]">
          <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.06em] text-ink-400 font-semibold">
            <span>{month}</span>
            <div className="flex-1 h-px bg-border" />
            <span>{list.length}건</span>
          </div>
          {list.map(item => {
            const client = clientMap.get(item.client_id)
            // 첫 번째 태그 색으로 불릿
            const dotColor = item.tags && item.tags.length > 0
              ? TAG_META[item.tags[0]].dot
              : 'var(--color-ink-300)'
            return (
              <div key={item.id} className="relative mb-2 pl-[14px]">
                <span
                  className="absolute -left-[18px] top-[13px] w-[11px] h-[11px] rounded-full border-2 border-card shadow-[0_0_0_1px_var(--color-border)]"
                  style={{ background: dotColor }}
                />
                <div className="bg-card border border-border rounded-lg px-3.5 py-3 transition-all hover:border-ink-300 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                    <TagList tags={item.tags} />
                    {client && <BrandBadge client={client} />}
                    <ChannelBadge channel={item.channel} href={item.source_ref} />
                    <PriorityBadge priority={item.priority} />
                    <span className="ml-auto text-[11px] text-ink-400">
                      {fmtMonthDay(item.occurred_at)}{item.author ? ` · ${item.author}` : ''}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-foreground leading-[1.4]">{item.title}</div>
                  {item.body && (
                    <div className="text-[11px] text-ink-700 leading-[1.6] mt-1">{item.body}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
