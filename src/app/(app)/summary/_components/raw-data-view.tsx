'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { DatabaseZap, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface DayRow {
  date: string
  rawCount: number
  classified: number
  channelCount: number
  lastCollectedAt: string | null
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function dateRange(f: string, t: string): string[] {
  const dates: string[] = []
  const [fy, fm, fd] = f.split('-').map(Number)
  const [ty, tm, td] = t.split('-').map(Number)
  let d = new Date(Date.UTC(fy, fm - 1, fd))
  const end = new Date(Date.UTC(ty, tm - 1, td))
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  }
  return dates
}

export function RawDataView() {
  const [rows, setRows]     = useState<DayRow[]>([])
  const [loading, setLoading] = useState(true)

  // 컨트롤 상태
  const [from, setFrom] = useState(monthStart)
  const [to,   setTo]   = useState(todayStr)
  const [collectStatus,  setCollectStatus]  = useState<string | null>(null)
  const [classifyStatus, setClassifyStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return

    const { data: member } = await sb
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()
    if (!member) return

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

  async function handleCollectRaw() {
    if (busy) return
    setBusy(true); setCollectStatus('준비 중...'); setClassifyStatus(null)
    try {
      const res = await fetch('/api/slack/collect-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n'); buffer = parts.pop() ?? ''
        for (const part of parts) {
          let eventType = '', eventData = ''
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: ')) eventData = line.slice(6)
          }
          if (!eventData) continue
          const data = JSON.parse(eventData) as Record<string, unknown>
          if (eventType === 'status') setCollectStatus(data.message as string)
          else if (eventType === 'result') setCollectStatus(`✓ ${data.message as string}`)
          else if (eventType === 'error') setCollectStatus(`오류: ${data.message as string}`)
        }
      }
      await fetchStats()
    } catch (e) {
      setCollectStatus(`오류: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleBatchReclassify() {
    if (busy) return
    setBusy(true); setClassifyStatus('준비 중...'); setCollectStatus(null)
    const dates = dateRange(from, to); let doneCount = 0
    try {
      for (const date of dates) {
        setClassifyStatus(`[${doneCount + 1}/${dates.length}] ${date} 분류 중...`)
        const res = await fetch('/api/slack/reclassify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        })
        if (!res.ok || !res.body) { setClassifyStatus(`오류: HTTP ${res.status} (${date})`); break }
        const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
        while (true) {
          const { done, value } = await reader.read(); if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n'); buffer = parts.pop() ?? ''
          for (const part of parts) {
            let eventType = '', eventData = ''
            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim()
              else if (line.startsWith('data: ')) eventData = line.slice(6)
            }
            if (!eventData) continue
            const data = JSON.parse(eventData) as Record<string, unknown>
            if (eventType === 'status') setClassifyStatus(`[${doneCount + 1}/${dates.length}] ${data.message as string}`)
            else if (eventType === 'error') setClassifyStatus(`오류: ${data.message as string}`)
          }
        }
        doneCount++
      }
      if (doneCount === dates.length) setClassifyStatus(`✓ ${dates.length}일 분류 완료`)
      await fetchStats()
    } catch (e) {
      setClassifyStatus(`오류: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-ink-400">
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
        <span className="text-xs text-ink-400">
          총 <b className="text-foreground font-semibold">{rows.length}일</b> ·{' '}
          수집 <b className="text-foreground font-semibold">{totalRaw.toLocaleString()}</b> ·{' '}
          분류 <b className="text-foreground font-semibold">{totalClassified.toLocaleString()}</b> ·{' '}
          제외 <b className="text-foreground font-semibold">{totalExcluded.toLocaleString()}</b>
        </span>
      </div>

      {/* 컨트롤 바 */}
      <div className="shrink-0 px-5 py-2 border-b border-border bg-muted/40 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-3xs text-ink-400">from</span>
          <input
            type="date" value={from} onChange={e => setFrom(e.target.value)} disabled={busy}
            className="text-2xs bg-card border border-border rounded px-2 py-1 text-foreground disabled:opacity-50"
          />
          <span className="text-3xs text-ink-400">to</span>
          <input
            type="date" value={to} onChange={e => setTo(e.target.value)} disabled={busy}
            className="text-2xs bg-card border border-border rounded px-2 py-1 text-foreground disabled:opacity-50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCollectRaw}
            disabled={busy || !from || !to || from > to}
            className="inline-flex items-center gap-1.5 text-2xs font-medium px-3 py-1 rounded border border-border text-ink-500 hover:text-foreground hover:border-ink-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <DatabaseZap size={11} className={busy && !!collectStatus ? 'animate-pulse' : ''} />
            Raw 수집
          </button>
          <button
            onClick={handleBatchReclassify}
            disabled={busy || !from || !to || from > to}
            className="inline-flex items-center gap-1.5 text-2xs font-medium px-3 py-1 rounded border border-border text-ink-500 hover:text-foreground hover:border-lilac-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles size={11} className={busy && !!classifyStatus ? 'animate-pulse' : ''} />
            AI 재분류
          </button>
        </div>
        {(collectStatus || classifyStatus) && (
          <span className="text-2xs text-lilac-500 truncate max-w-xs">{classifyStatus ?? collectStatus}</span>
        )}
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-muted z-10 border-b border-ink-150">
            <tr>
              <th className="text-left px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider">날짜</th>
              <th className="text-right px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-16">채널</th>
              <th className="text-right px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-20">수집</th>
              <th className="text-right px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-20">분류</th>
              <th className="text-right px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider w-20">제외</th>
              <th className="text-left px-5 py-2 text-3xs font-semibold text-ink-400 uppercase tracking-wider">마지막 수집</th>
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
                  <tr key={`month-${month}`} className="bg-amber-50 border-t-2 border-amber-200">
                    <td className="px-5 py-2 text-2xs font-semibold text-ink-600 whitespace-nowrap">
                      {monthLabel}
                      <span className="ml-2 text-3xs font-normal text-ink-400">{mRows.length}일</span>
                    </td>
                    <td className="px-5 py-2 text-right text-2xs text-ink-400">—</td>
                    <td className="px-5 py-2 text-right text-2xs font-semibold text-ink-600 tabular-nums">{mRaw.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right text-2xs font-semibold text-ink-600 tabular-nums">{mClassified.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right text-2xs text-ink-400 tabular-nums">
                      {mExcluded > 0 ? mExcluded.toLocaleString() : <span className="text-ink-200">—</span>}
                    </td>
                    <td className="px-5 py-2" />
                  </tr>

                  {/* 일별 행 */}
                  {mRows.map(row => {
                    const excluded = row.rawCount - row.classified
                    return (
                      <tr key={row.date} className="border-t border-border hover:bg-muted/40 transition-colors">
                        <td className="px-5 py-2 text-xs font-medium text-foreground tabular-nums whitespace-nowrap">
                          {format(new Date(row.date + 'T00:00:00'), 'yyyy.MM.dd (eee)', { locale: ko })}
                        </td>
                        <td className="px-5 py-2 text-right text-xs tabular-nums text-ink-400">
                          {row.channelCount}
                        </td>
                        <td className="px-5 py-2 text-right text-xs tabular-nums text-ink-500 font-medium">
                          {row.rawCount.toLocaleString()}
                        </td>
                        <td className="px-5 py-2 text-right text-xs tabular-nums text-foreground font-medium">
                          {row.classified.toLocaleString()}
                        </td>
                        <td className="px-5 py-2 text-right text-xs tabular-nums text-ink-400">
                          {excluded > 0 ? excluded.toLocaleString() : <span className="text-ink-200">—</span>}
                        </td>
                        <td className="px-5 py-2 text-2xs text-ink-400 tabular-nums">
                          {row.lastCollectedAt
                            ? format(new Date(row.lastCollectedAt), 'yyyy.MM.dd HH:mm', { locale: ko })
                            : <span className="text-ink-200">—</span>
                          }
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

    </div>
  )
}
