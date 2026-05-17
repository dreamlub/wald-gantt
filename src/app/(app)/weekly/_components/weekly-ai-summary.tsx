'use client'

import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import type { WeekSection } from '../_lib/types'

interface Props {
  section: WeekSection
}

async function fetchSummary(
  date: string,
  content: string,
  onStatus: (msg: string) => void,
): Promise<string> {
  const res = await fetch('/api/weekly/ai-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, content }),
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
      const lines = part.split('\n')
      let eventType = 'message'
      let eventData = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim()
        else if (line.startsWith('data: ')) eventData = line.slice(6)
      }
      if (!eventData) continue
      const data = JSON.parse(eventData) as Record<string, unknown>
      if (eventType === 'status') onStatus(data.message as string)
      else if (eventType === 'result') return data.summary as string
      else if (eventType === 'error') throw new Error(data.message as string)
    }
  }

  throw new Error('스트림이 결과 없이 종료되었습니다')
}

export function WeeklyAiSummary({ section }: Props) {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setStatus(null)
    setSummary(null)
    setOpen(true)
    try {
      const result = await fetchSummary(section.date, section.content, setStatus)
      setSummary(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '요약 실패')
    } finally {
      setLoading(false)
      setStatus(null)
    }
  }

  return (
    <div className="mb-4 border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b border-border">
        <Sparkles size={13} className="text-lilac-500 shrink-0" />
        <span className="flex-1 text-xs font-semibold text-foreground">AI 요약</span>
        {!summary && !loading && (
          <button
            onClick={handleGenerate}
            className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded bg-foreground text-background hover:bg-ink-800 transition-colors"
          >
            <Sparkles size={11} />
            요약하기
          </button>
        )}
        {summary && (
          <>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="p-1 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              title="다시 요약"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setOpen(o => !o)}
              className="p-1 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
            >
              {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </>
        )}
      </div>

      {(loading || summary || error) && open && (
        <div className="px-4 py-3 bg-muted/40">
          {loading && (
            <div className="flex items-center gap-2 text-[11px] text-ink-400">
              <RefreshCw size={12} className="animate-spin shrink-0" />
              {status ?? '요약 생성 중...'}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-[12px] text-status-late">
              <span className="flex-1">{error}</span>
              <button onClick={handleGenerate} className="underline underline-offset-2 text-[11px] hover:opacity-70">다시 시도</button>
            </div>
          )}
          {summary && (
            <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{summary}</div>
          )}
        </div>
      )}
    </div>
  )
}
