'use client'

import { useState } from 'react'
import { KeyRound, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Client } from '../../summary/_lib/types'
import { updateClientKeywords } from '@/lib/history-service'

interface Props {
  initialClients: Client[]
}

export function KeywordsClient({ initialClients }: Props) {
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [inputs,  setInputs]  = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())

  function mark(id: string, on: boolean) {
    setPending(prev => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function persist(id: string, keywords: string[]) {
    mark(id, true)
    try {
      await updateClientKeywords(id, keywords)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했어요')
      // 롤백을 위해 reload? 일단 토스트만
    } finally {
      mark(id, false)
    }
  }

  async function removeKw(id: string, kw: string) {
    const next = clients.find(c => c.id === id)?.keywords.filter(k => k !== kw) ?? []
    setClients(prev => prev.map(c => c.id === id ? { ...c, keywords: next } : c))
    await persist(id, next)
  }

  async function addKw(id: string) {
    const v = (inputs[id] ?? '').trim().toLowerCase()
    if (!v) return
    const cur = clients.find(c => c.id === id)
    if (!cur || cur.keywords.includes(v)) {
      setInputs(prev => ({ ...prev, [id]: '' }))
      return
    }
    const next = [...cur.keywords, v]
    setClients(prev => prev.map(c => c.id === id ? { ...c, keywords: next } : c))
    setInputs(prev => ({ ...prev, [id]: '' }))
    await persist(id, next)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="h-12 bg-card border-b border-border flex items-center px-4 shrink-0">
        <h1 className="text-sm font-semibold text-foreground">설정</h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[200px] shrink-0 bg-card border-r border-border py-2.5 px-1.5">
          <div className="px-2.5 pt-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-400">
            메뉴
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-sm bg-ink-100 text-foreground text-[13px] font-semibold">
            <KeyRound size={15} />
            클라이언트 키워드
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto px-8 pt-7 pb-20 bg-background">
          <div className="mb-6">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] mb-1">클라이언트 키워드 관리</h2>
            <p className="text-[13px] text-muted-foreground leading-[1.6]">
              슬랙 수집 시 Claude가 이 키워드로 관련 채널을 자동 탐색해요.<br />
              채널명 또는 대화 내용에 키워드가 포함된 채널을 찾아냅니다.
            </p>
          </div>

          {clients.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-md overflow-hidden mb-2.5">
              <div className="px-4 py-3 border-b border-ink-150 flex items-center gap-2.5">
                <span className="inline-block w-[9px] h-[9px] rounded-full shrink-0" style={{ background: c.color }} />
                <span className="font-semibold text-[13.5px]">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.name_en}</span>
                {pending.has(c.id) && (
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">저장 중…</span>
                )}
              </div>
              <div className="px-4 py-3.5">
                <div className="flex flex-wrap gap-1.5 mb-3 min-h-6">
                  {c.keywords.length === 0 && <span className="text-xs text-ink-400">키워드 없음</span>}
                  {c.keywords.map(kw => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-ink-100 text-ink-700 border border-border font-mono"
                    >
                      {kw}
                      <button
                        onClick={() => removeKw(c.id, kw)}
                        aria-label={`키워드 ${kw} 삭제`}
                        className="text-ink-400 hover:text-status-late transition-colors leading-none"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5 items-center">
                  <input
                    value={inputs[c.id] ?? ''}
                    onChange={e => setInputs(prev => ({ ...prev, [c.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addKw(c.id) }}
                    placeholder="키워드 입력 후 Enter"
                    className="bg-card border border-border rounded-sm px-2.5 py-1.5 text-[12.5px] w-40 outline-none focus:border-lilac-400 transition-colors"
                  />
                  <button
                    onClick={() => addKw(c.id)}
                    className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-sm bg-card border border-border text-foreground text-[12.5px] font-medium hover:bg-ink-100 transition-colors"
                  >
                    <Plus size={14} /> 추가
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
