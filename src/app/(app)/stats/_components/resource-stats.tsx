'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Users, Tag } from 'lucide-react'
import type { ResourceStatsResponse, ResourcePair } from '../_lib/stats-types'
import { EMPTY_RESOURCE_STATS } from '../_lib/stats-types'
import { brandColor } from '@/lib/brand-color'

type Mode = 'assignee' | 'brand'

interface Lane { label: string; color: string; weeks: Record<string, number>; total: number }
interface Group { label: string; color: string | null; total: number; lanes: Lane[] }

const CELL_W = 14

function buildGroups(pairs: ResourcePair[], mode: Mode): Group[] {
  const map = new Map<string, { total: number; lanes: Map<string, Lane> }>()
  for (const p of pairs) {
    const groupKey = mode === 'assignee' ? p.author : p.brand
    const laneKey  = mode === 'assignee' ? p.brand : p.author
    let g = map.get(groupKey)
    if (!g) { g = { total: 0, lanes: new Map() }; map.set(groupKey, g) }
    g.total += p.total
    g.lanes.set(laneKey, { label: laneKey, color: brandColor(p.brand), weeks: p.weeks, total: p.total })
  }
  return [...map.entries()]
    .map(([label, g]) => ({
      label,
      color: mode === 'brand' ? brandColor(label) : null,
      total: g.total,
      lanes: [...g.lanes.values()].sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)
}

function intensity(count: number): number {
  return Math.min(1, 0.4 + count / 8)
}

export function ResourceStats() {
  const [data, setData] = useState<ResourceStatsResponse>(EMPTY_RESOURCE_STATS)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>('assignee')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true)
    fetch('/api/stats/resources')
      .then(r => r.json())
      .then((res: ResourceStatsResponse) => { setData(res); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const groups = useMemo(() => buildGroups(data.pairs, mode), [data.pairs, mode])
  const { weeks } = data

  // 월 경계 라벨 (해당 주가 그 달 첫 주일 때)
  const monthLabels = useMemo(() => weeks.map((w, i) => {
    const m = w.slice(5, 7)
    const prev = i > 0 ? weeks[i - 1].slice(5, 7) : ''
    return m !== prev ? `${parseInt(m, 10)}월` : ''
  }), [weeks])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-ink-300" /></div>
  }
  if (groups.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-sm text-ink-400">투입 데이터가 없습니다</div>
  }

  const gridW = weeks.length * CELL_W

  return (
    <div data-scrolltop className="flex-1 overflow-auto">
      <div className="px-6 py-5">
        {/* 토글 */}
        <div className="flex items-center gap-1.5 mb-4">
          <button
            onClick={() => setMode('assignee')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              mode === 'assignee' ? 'bg-foreground text-background border-foreground' : 'border-border text-ink-500 hover:bg-muted'
            }`}
          >
            <Users size={13} /> 담당자별
          </button>
          <button
            onClick={() => setMode('brand')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              mode === 'brand' ? 'bg-foreground text-background border-foreground' : 'border-border text-ink-500 hover:bg-muted'
            }`}
          >
            <Tag size={13} /> 브랜드별
          </button>
          <span className="ml-2 text-sm text-ink-400">
            {mode === 'assignee' ? '담당자별 시간에 따라 맡은 브랜드' : '브랜드별 주차에 들어간 담당자'}
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* 주차 헤더 */}
          <div className="flex items-end h-7 border-b bg-muted sticky top-0 z-10">
            <div className="w-40 shrink-0 px-3 text-2xs text-ink-400 self-center">{mode === 'assignee' ? '담당자 / 브랜드' : '브랜드 / 담당자'}</div>
            <div className="flex" style={{ width: gridW }}>
              {weeks.map((w, i) => (
                <div key={w} className="text-4xs text-ink-400 text-left overflow-visible whitespace-nowrap" style={{ width: CELL_W }}>
                  {monthLabels[i]}
                </div>
              ))}
            </div>
            <div className="w-12 shrink-0 px-2 text-2xs text-ink-400 text-right self-center">건</div>
          </div>

          {/* 그룹 */}
          {groups.map(group => (
            <div key={group.label} className="border-b border-border last:border-0">
              <div className="flex items-center h-8 px-3 gap-2 bg-background/60">
                {group.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />}
                <span className="text-sm font-semibold text-foreground truncate">{group.label}</span>
                <span className="text-2xs text-ink-400">{group.lanes.length}{mode === 'assignee' ? '개 브랜드' : '명'}</span>
                <span className="ml-auto text-2xs text-ink-400">{group.total}건</span>
              </div>
              {group.lanes.map(lane => (
                <div key={lane.label} className="flex items-center h-6 hover:bg-muted/40">
                  <div className="w-40 shrink-0 pl-6 pr-3 flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: lane.color }} />
                    <span className="text-2xs text-ink-500 truncate">{lane.label}</span>
                  </div>
                  <div className="flex" style={{ width: gridW }}>
                    {weeks.map(w => {
                      const c = lane.weeks[w] ?? 0
                      return (
                        <div key={w} style={{ width: CELL_W }} className="px-px py-1">
                          <div
                            className="h-3 rounded-sm"
                            style={c > 0
                              ? { backgroundColor: lane.color, opacity: intensity(c) }
                              : { backgroundColor: 'var(--color-muted)' }}
                            title={c > 0 ? `${w} · ${c}건` : undefined}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div className="w-12 shrink-0 px-2 text-2xs text-ink-400 text-right tabular-nums">{lane.total}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
