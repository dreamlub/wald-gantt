'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DayRow {
  date: string          // 'YYYY-MM-DD'
  rawCount: number      // slack_raw_messages 수 (전체 수집)
  classified: number    // client_history 수 (분류됨)
  channelCount: number  // 고유 채널 수
  lastCollectedAt: string | null
}

interface ActionState {
  [date: string]: { status: string } | undefined
}


export function RawDataView() {
  const [rows, setRows]             = useState<DayRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [collecting, setCollecting] = useState<ActionState>({})
  const [resultModal, setResultModal] = useState<{ date: string; message: string } | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!member) { setLoading(false); return }

    const [rawRes, histRes] = await Promise.all([
      sb.rpc('get_raw_message_stats',  { p_workspace_id: member.workspace_id }),
      sb.rpc('get_classified_stats',   { p_workspace_id: member.workspace_id }),
    ])

    const rawData  = rawRes.data  ?? []
    const histData = histRes.data ?? []

    // slack_raw_messages → 날짜별 집계 (RPC 결과, 이미 서버에서 그룹화됨)
    const rawMap = new Map<string, { count: number; channelCount: number; lastCollected: string }>()
    for (const row of rawData as { date_kst: string; raw_count: number; channel_count: number; last_collected: string }[]) {
      rawMap.set(row.date_kst, {
        count: Number(row.raw_count),
        channelCount: Number(row.channel_count),
        lastCollected: row.last_collected ?? '',
      })
    }

    // client_history → 날짜별 분류 수 (RPC에서 이미 KST 기준 집계)
    const histMap = new Map<string, { count: number; lastUpdated: string }>()
    for (const row of histData as { date_kst: string; classified_count: number; last_updated: string }[]) {
      histMap.set(row.date_kst, {
        count: Number(row.classified_count),
        lastUpdated: row.last_updated ?? '',
      })
    }

    // 두 맵 병합 + 미수집 날짜 채우기 (2026-01-01 ~ 오늘)
    const allDates = new Set([...rawMap.keys(), ...histMap.keys()])
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const cur = new Date(new Date().getFullYear(), 0, 1)
    while (cur <= today) {
      allDates.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
      cur.setDate(cur.getDate() + 1)
    }

    const result: DayRow[] = Array.from(allDates)
      .map(date => {
        const raw  = rawMap.get(date)
        const hist = histMap.get(date)
        return {
          date,
          rawCount:     raw?.count ?? 0,
          classified:   hist?.count ?? 0,
          channelCount: raw?.channelCount ?? 0,
          lastCollectedAt: raw?.lastCollected || (hist?.lastUpdated ?? null),
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date))

    setRows(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats()
  }, [fetchStats])

  async function runSSE(
    url: string, date: string,
    setState: React.Dispatch<React.SetStateAction<ActionState>>,
    tag: string,
    body?: unknown,
  ) {
    setState(prev => ({ ...prev, [date]: { status: '준비 중...' } }))
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? { date }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          let eventType = '', eventData = ''
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: ')) eventData = line.slice(6)
          }
          if (!eventData) continue
          const data = JSON.parse(eventData) as Record<string, unknown>
          if (eventType === 'status') setState(prev => ({ ...prev, [date]: { status: data.message as string } }))
          else if (eventType === 'result') { setResultModal({ date, message: data.message as string }); break }
          else if (eventType === 'error') { setResultModal({ date, message: `오류: ${data.message as string}` }); break }
        }
      }
      await fetchStats()
    } catch {
    } finally {
      setState(prev => { const next = { ...prev }; delete next[date]; return next })
    }
  }

  const handleRecollect = (date: string) => runSSE('/api/slack/collect-raw', date, setCollecting, 'recollect', { from: date, to: date })

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-ink-400">
        로딩 중...
      </div>
    )
  }

  const totalRaw        = rows.reduce((s, r) => s + r.rawCount, 0)
  const totalClassified = rows.reduce((s, r) => s + r.classified, 0)
  const totalExcluded   = totalRaw - totalClassified

  // 월별 그룹 (rows는 이미 내림차순)
  const monthGroups: Array<{ month: string; rows: DayRow[] }> = []
  for (const row of rows) {
    const month = row.date.slice(0, 7)
    const last = monthGroups[monthGroups.length - 1]
    if (last?.month === month) last.rows.push(row)
    else monthGroups.push({ month, rows: [row] })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 요약 바 */}
      <div className="shrink-0 px-5 py-2.5 border-b border-border bg-card">
        <span className="text-sm text-ink-400">
          총 <b className="text-foreground font-semibold">{rows.length}일</b> ·{' '}
          수집 <b className="text-foreground font-semibold">{totalRaw.toLocaleString()}</b> ·{' '}
          분류 <b className="text-foreground font-semibold">{totalClassified.toLocaleString()}</b> ·{' '}
          제외 <b className="text-foreground font-semibold">{totalExcluded.toLocaleString()}</b>
        </span>
      </div>

      {/* 테이블 */}
      <div data-scrolltop className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-muted z-10 border-b border-ink-150">
            <tr>
              <th className="text-left px-5 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider">날짜</th>
              <th className="text-right px-5 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider w-16">채널</th>
              <th className="text-right px-5 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider w-20">수집</th>
              <th className="text-right px-5 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider w-20">분류</th>
              <th className="text-right px-5 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider w-20">제외</th>
              <th className="text-left px-5 py-2 text-xs font-semibold text-ink-400 uppercase tracking-wider">마지막 수집</th>
              <th className="px-5 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {monthGroups.map(({ month, rows: mRows }) => {
              const mRaw        = mRows.reduce((s, r) => s + r.rawCount, 0)
              const mClassified = mRows.reduce((s, r) => s + r.classified, 0)
              const mExcluded   = mRaw - mClassified
              const monthLabel  = format(new Date(month + '-01'), 'yyyy년 M월', { locale: ko })

              return (
                <React.Fragment key={month}>
                  {/* 월 부분합 행 */}
                  <tr key={`month-${month}`} className="bg-status-warn/10 border-t-2 border-status-warn/30">
                    <td className="px-5 py-2 text-sm font-semibold text-ink-600 whitespace-nowrap">
                      {monthLabel}
                      <span className="ml-2 text-sm font-normal text-ink-400">{mRows.length}일</span>
                    </td>
                    <td className="px-5 py-2 text-right text-sm text-ink-400">—</td>
                    <td className="px-5 py-2 text-right text-sm font-semibold text-ink-600 tabular-nums">{mRaw.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right text-sm font-semibold text-ink-600 tabular-nums">{mClassified.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right text-sm text-ink-400 tabular-nums">
                      {mExcluded > 0 ? mExcluded.toLocaleString() : <span className="text-ink-200">—</span>}
                    </td>
                    <td className="px-5 py-2" />
                    <td className="px-5 py-2" />
                  </tr>

                  {/* 일별 행 */}
                  {mRows.map(row => {
                    const cState = collecting[row.date]
                    const isBusy = !!cState
                    const activeStatus = cState?.status
                    const excluded = row.rawCount - row.classified
                    return (
                      <tr key={row.date} className="border-t border-border hover:bg-muted/40 transition-colors">
                        <td className="px-5 py-2 text-sm font-medium text-foreground tabular-nums whitespace-nowrap">
                          {format(new Date(row.date + 'T00:00:00'), 'yyyy.MM.dd (eee)', { locale: ko })}
                        </td>
                        <td className="px-5 py-2 text-right text-sm tabular-nums text-ink-400">
                          {row.channelCount}
                        </td>
                        <td className="px-5 py-2 text-right text-sm tabular-nums text-ink-500 font-medium">
                          {row.rawCount.toLocaleString()}
                        </td>
                        <td className="px-5 py-2 text-right text-sm tabular-nums text-foreground font-medium">
                          {row.classified.toLocaleString()}
                        </td>
                        <td className="px-5 py-2 text-right text-sm tabular-nums text-ink-400">
                          {excluded > 0 ? excluded.toLocaleString() : <span className="text-ink-200">—</span>}
                        </td>
                        <td className="px-5 py-2 text-sm text-ink-400 tabular-nums">
                          {isBusy
                            ? <span className="text-lilac-500">{activeStatus}</span>
                            : row.lastCollectedAt
                              ? format(new Date(row.lastCollectedAt), 'yyyy.MM.dd HH:mm', { locale: ko })
                              : <span className="text-ink-200">—</span>
                          }
                        </td>
                        <td className="px-5 py-2 text-right">
                          <button
                            onClick={() => handleRecollect(row.date)}
                            disabled={isBusy}
                            title="Slack에서 다시 수집"
                            className="inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded border border-border text-ink-400 hover:text-foreground hover:border-ink-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <RefreshCw size={10} className={cState ? 'animate-spin' : ''} />
                            재수집
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!resultModal} onOpenChange={open => { if (!open) setResultModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resultModal?.date} 처리 결과</DialogTitle>
            <DialogDescription>{resultModal?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              닫기
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
