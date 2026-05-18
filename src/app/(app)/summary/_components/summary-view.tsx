'use client'

import { useMemo } from 'react'
import { Sparkles, BarChart3, Tag as TagIcon, Users, Hash } from 'lucide-react'
import type { Client, HistoryItem, Priority, Tag } from '../_lib/types'
import { TAG_META, TAG_KEYS, PRIORITY_META } from '../_lib/mock-data'
import { Avatar } from './badges'

interface Props {
  items: HistoryItem[]
  clients: Client[]
}

export function SummaryView({ items, clients }: Props) {
  const total = items.length

  // 태그별 카운트 (한 항목이 여러 태그 가지면 모두 +1)
  const tagCounts = useMemo(() => {
    const acc = TAG_KEYS.reduce((a, t) => { a[t] = 0; return a }, {} as Record<Tag, number>)
    for (const h of items) for (const t of (h.tags ?? [])) acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, [items])

  // 중요도별
  const priorityCounts = useMemo(() =>
    (['high', 'medium', 'low'] as Priority[]).reduce((acc, p) => {
      acc[p] = items.filter(i => i.priority === p).length
      return acc
    }, {} as Record<Priority, number>)
  , [items])

  // 브랜드별
  const brandStats = useMemo(() =>
    clients.map(c => {
      const own = items.filter(i => i.client_id === c.id)
      return {
        client: c,
        total: own.length,
        issue: own.filter(i => i.tags?.includes('issue')).length,
        decision: own.filter(i => i.tags?.includes('decision')).length,
      }
    }).filter(b => b.total > 0).sort((a, b) => b.total - a.total)
  , [items, clients])

  // 작성자 Top
  const { topAuthors, authorMax } = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of items) {
      if (!h.author) continue
      map.set(h.author, (map.get(h.author) ?? 0) + 1)
    }
    const top = [...map.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count).slice(0, 5)
    return { topAuthors: top, authorMax: top[0]?.count ?? 1 }
  }, [items])

  // 채널 Top
  const { topChannels, channelMax } = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of items) map.set(h.channel, (map.get(h.channel) ?? 0) + 1)
    const top = [...map.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count).slice(0, 5)
    return { topChannels: top, channelMax: top[0]?.count ?? 1 }
  }, [items])

  if (total === 0) {
    return <div className="text-center py-12 text-ink-400 text-xs">필터에 해당하는 항목이 없어요</div>
  }

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-lilac-100 to-rose-100 border border-lilac-200/60 rounded-xl px-6 py-5 mb-6">
        <div className="text-xs leading-[1.85] text-foreground">
          현재 필터 기준 <b className="text-lilac-600 font-semibold">총 {total}건</b> 수집됐어요.
          {tagCounts.issue > 0 && <> 그 중 <b className="text-lilac-600 font-semibold">이슈 {tagCounts.issue}건</b></>}
          {tagCounts.decision > 0 && <>, <b className="text-lilac-600 font-semibold">의사결정 {tagCounts.decision}건</b></>}
          {tagCounts.mention > 0 && <>, <b className="text-lilac-600 font-semibold">멘션 {tagCounts.mention}건</b></>}
          {brandStats.length > 0 && <>이 눈에 띄고, 활성 브랜드는 <b className="text-lilac-600 font-semibold">{brandStats.length}개</b>입니다.</>}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3.5 pt-3.5 border-t border-lilac-200/60 text-xs text-ink-700">
          <span className="inline-flex items-center gap-1.5"><Sparkles size={12} className="text-lilac-500" /> 총 {total}건</span>
          {TAG_KEYS.filter(t => tagCounts[t] > 0).map(t => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: TAG_META[t].dot }} />
              {TAG_META[t].label} {tagCounts[t]}건
            </span>
          ))}
          {brandStats.length > 0 && <span>{brandStats.length}개 브랜드</span>}
        </div>
      </div>

      {/* 태그별 분포 */}
      <Section icon={<BarChart3 size={13} className="text-ink-400" />} label="태그별 분포">
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {TAG_KEYS.map(t => {
            const c = tagCounts[t]
            const meta = TAG_META[t]
            const pct = total > 0 ? Math.round(c / total * 100) : 0
            return (
              <div key={t} className="bg-card border border-border rounded-lg px-4 py-3.5">
                <div className="text-[11px] font-medium mb-1 inline-flex items-center gap-1.5" style={{ color: meta.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                  {meta.label}
                </div>
                <div className="text-[22px] font-bold text-foreground leading-none">{c}건</div>
                <div className="text-[11px] text-ink-400 mt-1">전체의 {pct}%</div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 중요도별 */}
      {Object.values(priorityCounts).some(v => v > 0) && (
        <Section icon={<TagIcon size={13} className="text-ink-400" />} label="중요도별" badge={`${total}건`}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {(['high', 'medium', 'low'] as Priority[]).map(p => {
              const meta = PRIORITY_META[p]
              const c = priorityCounts[p]
              const pct = total > 0 ? Math.round(c / total * 100) : 0
              return (
                <div key={p} className="bg-card border border-border rounded-lg px-4 py-3.5">
                  <div className="text-[11px] font-medium mb-1" style={{ color: meta.color }}>
                    ● {meta.label}
                  </div>
                  <div className="text-[22px] font-bold text-foreground leading-none">{c}건</div>
                  <div className="text-[11px] text-ink-400 mt-1">전체의 {pct}%</div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* 브랜드별 요약 */}
      {brandStats.length > 0 && (
        <Section icon={<Hash size={13} className="text-ink-400" />} label="브랜드별 요약" badge={`${brandStats.length}개`}>
          <div className="flex flex-col gap-2">
            {brandStats.map(b => (
              <div key={b.client.id} className="bg-card border border-border rounded-lg px-4 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.client.color }} />
                    {b.client.name}
                  </div>
                  <div className="flex gap-3.5 text-[11px] text-ink-700">
                    {b.issue > 0 && <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-status-late)' }}>● 이슈 {b.issue}</span>}
                    {b.decision > 0 && <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-status-warn)' }}>● 의사결정 {b.decision}</span>}
                    <span className="text-ink-400">총 {b.total}건</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 작성자 / 채널 Top */}
      <div className="grid grid-cols-2 gap-4">
        <Section icon={<Users size={13} className="text-ink-400" />} label="작성자 Top" badge={`${topAuthors.length}명`}>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {topAuthors.length === 0 ? (
              <div className="px-4 py-6 text-center text-ink-400 text-xs">작성자 정보 없음</div>
            ) : (
              topAuthors.map((a, i) => (
                <div key={a.name} className={`flex items-center px-3.5 py-2 text-xs ${i < topAuthors.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className="flex items-center gap-2 w-[110px] text-ink-700">
                    <Avatar name={a.name} size={18} />
                    {a.name}
                  </div>
                  <div className="flex-1 h-[5px] bg-muted rounded-[3px] mx-3 overflow-hidden">
                    <div className="h-full bg-lilac-500 rounded-[3px]" style={{ width: `${(a.count / authorMax) * 100}%` }} />
                  </div>
                  <span className="text-ink-400 font-medium min-w-[40px] text-right">{a.count}건</span>
                </div>
              ))
            )}
          </div>
        </Section>

        <Section icon={<Hash size={13} className="text-ink-400" />} label="활발한 채널" badge={`${topChannels.length}개`}>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {topChannels.length === 0 ? (
              <div className="px-4 py-6 text-center text-ink-400 text-xs">채널 정보 없음</div>
            ) : (
              topChannels.map((c, i) => (
                <div key={c.name} className={`flex items-center px-3.5 py-2 text-xs ${i < topChannels.length - 1 ? 'border-b border-border' : ''}`}>
                  <span className="text-[11px] text-ink-700 truncate min-w-[110px]">{c.name}</span>
                  <div className="flex-1 h-[5px] bg-muted rounded-[3px] mx-3 overflow-hidden">
                    <div className="h-full bg-lilac-500 rounded-[3px]" style={{ width: `${(c.count / channelMax) * 100}%` }} />
                  </div>
                  <span className="text-ink-400 font-medium min-w-[40px] text-right">{c.count}건</span>
                </div>
              ))
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ icon, label, badge, children }: { icon: React.ReactNode; label: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2.5 text-xs font-semibold text-ink-700">
        {icon}
        <span>{label}</span>
        {badge && (
          <span className="text-[10px] px-[7px] py-[2px] rounded-[10px] bg-muted text-ink-400 font-medium">{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}
