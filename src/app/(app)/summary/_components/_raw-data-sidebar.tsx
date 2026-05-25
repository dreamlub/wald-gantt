'use client'

import { useState } from 'react'
import { DatabaseZap, Sparkles } from 'lucide-react'

export function RawDataSidebarPanel() {
  const [from, setFrom] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [to, setTo] = useState(() => {
    const now = new Date()
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${last}`
  })
  const [status, setStatus]           = useState<string | null>(null)
  const [classifyStatus, setClassifyStatus] = useState<string | null>(null)
  const [busy, setBusy]               = useState(false)

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

  async function handleBatchReclassify() {
    if (busy) return
    setBusy(true)
    setClassifyStatus('준비 중...')
    const dates = dateRange(from, to)
    let doneCount = 0
    try {
      for (const date of dates) {
        setClassifyStatus(`[${doneCount + 1}/${dates.length}] ${date} 분류 중...`)
        const res = await fetch('/api/slack/reclassify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        })
        if (!res.ok || !res.body) { setClassifyStatus(`오류: HTTP ${res.status} (${date})`); break }
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
            if (eventType === 'status') setClassifyStatus(`[${doneCount + 1}/${dates.length}] ${data.message as string}`)
            else if (eventType === 'error') setClassifyStatus(`오류: ${data.message as string}`)
          }
        }
        doneCount++
      }
      if (doneCount === dates.length) setClassifyStatus(`✓ ${dates.length}일 분류 완료`)
    } catch (e) {
      setClassifyStatus(`오류: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCollectRaw() {
    if (busy) return
    setBusy(true)
    setStatus('준비 중...')
    try {
      const res = await fetch('/api/slack/collect-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
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
          if (eventType === 'status') setStatus(data.message as string)
          else if (eventType === 'result') setStatus(`✓ ${data.message as string}`)
          else if (eventType === 'error') setStatus(`오류: ${data.message as string}`)
        }
      }
    } catch (e) {
      setStatus(`오류: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-2xs text-ink-400 leading-relaxed">
        날짜별 수집 현황을 확인하고 재수집을 실행합니다.
      </p>

      <div className="border border-border rounded-lg p-3 flex flex-col gap-2">
        <div className="text-3xs font-semibold text-ink-400 uppercase tracking-wider mb-0.5">기간 Raw 수집</div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-ink-400 w-6 shrink-0">from</span>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              disabled={busy}
              className="flex-1 text-2xs bg-muted border border-border rounded px-1.5 py-1 text-foreground disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-ink-400 w-6 shrink-0">to</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              disabled={busy}
              className="flex-1 text-2xs bg-muted border border-border rounded px-1.5 py-1 text-foreground disabled:opacity-50"
            />
          </div>
        </div>
        <button
          onClick={handleCollectRaw}
          disabled={busy || !from || !to || from > to}
          className="mt-0.5 flex items-center justify-center gap-1.5 w-full text-2xs font-medium px-3 py-1.5 rounded border border-border text-ink-500 hover:text-foreground hover:border-ink-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <DatabaseZap size={11} className={busy && !classifyStatus ? 'animate-pulse' : ''} />
          {busy && !classifyStatus ? 'Raw 수집 중...' : 'Raw 수집'}
        </button>
        {status && (
          <p className="text-3xs text-ink-400 leading-relaxed break-all">{status}</p>
        )}
      </div>

      <div className="border border-border rounded-lg p-3 flex flex-col gap-2">
        <div className="text-3xs font-semibold text-ink-400 uppercase tracking-wider mb-0.5">기간 일괄 재분류</div>
        <p className="text-3xs text-ink-400 leading-relaxed">위 기간의 raw 메시지를 AI로 순차 재분류합니다.</p>
        <button
          onClick={handleBatchReclassify}
          disabled={busy || !from || !to || from > to}
          className="flex items-center justify-center gap-1.5 w-full text-2xs font-medium px-3 py-1.5 rounded border border-border text-ink-500 hover:text-foreground hover:border-lilac-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles size={11} className={busy && !!classifyStatus ? 'animate-pulse' : ''} />
          {busy && !!classifyStatus ? '분류 중...' : 'AI 재분류'}
        </button>
        {classifyStatus && (
          <p className="text-3xs text-ink-400 leading-relaxed break-all">{classifyStatus}</p>
        )}
      </div>
    </div>
  )
}
