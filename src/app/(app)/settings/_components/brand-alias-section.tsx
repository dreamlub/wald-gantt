'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import type { Client } from '../../slack/_lib/types'
import { AutocompleteInput } from '@/components/AutocompleteInput'

interface Alias {
  id: string
  alias_name: string
  canonical_name: string
}

interface Props {
  clients: Client[]
}

export function BrandAliasSection({ clients }: Props) {
  const [aliases, setAliases] = useState<Alias[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ alias_name: '', canonical_name: '' })

  const brandSuggestions = useMemo(() => {
    const names = new Set(clients.map(c => c.name))
    for (const a of aliases) names.add(a.canonical_name)
    return [...names].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [clients, aliases])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/slack/brand-aliases')
        const json = await res.json()
        if (!res.ok || cancelled) return
        setAliases(json.aliases ?? [])
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleAdd = async () => {
    const alias = form.alias_name.trim()
    const canonical = form.canonical_name.trim()
    if (!alias || !canonical) return
    if (alias === canonical) { toast.error('별칭과 정식 이름이 같습니다'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/slack/brand-aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases: [{ alias_name: alias, canonical_name: canonical }] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')

      const msg = json.historyUpdated > 0
        ? `저장 완료 — 기존 ${json.historyUpdated}건 브랜드명 변환됨`
        : '저장 완료'
      toast.success(msg)
      setForm({ alias_name: '', canonical_name: '' })

      // 목록 새로고침
      const listRes = await fetch('/api/slack/brand-aliases')
      const listJson = await listRes.json()
      setAliases(listJson.aliases ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const rollback = aliases
    setAliases(prev => prev.filter(a => a.id !== id))
    try {
      const res = await fetch('/api/slack/brand-aliases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('삭제 실패')
      toast.success('삭제되었습니다')
    } catch {
      setAliases(rollback)
      toast.error('삭제 실패')
    }
  }

  // 정식 브랜드별로 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, Alias[]>()
    for (const a of aliases) {
      const group = map.get(a.canonical_name)
      if (group) group.push(a)
      else map.set(a.canonical_name, [a])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))
  }, [aliases])

  return (
    <div className="space-y-4">
      <p className="text-2xs text-muted-foreground">
        같은 브랜드인데 다르게 분류된 이름을 하나로 통합합니다. 저장 시 기존 데이터도 일괄 변환됩니다.
      </p>

      {/* 추가 폼 */}
      <div className="flex items-center gap-2">
        <AutocompleteInput
          value={form.alias_name}
          onChange={v => setForm(p => ({ ...p, alias_name: v }))}
          suggestions={brandSuggestions}
          placeholder="잘못된 이름 (예: 10밀리언)"
          className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-2xs text-foreground outline-none focus:border-lilac-300"
        />
        <ArrowRight size={14} className="text-ink-300 shrink-0" />
        <AutocompleteInput
          value={form.canonical_name}
          onChange={v => setForm(p => ({ ...p, canonical_name: v }))}
          suggestions={brandSuggestions}
          placeholder="정식 이름 (예: 백억커피)"
          className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-2xs text-foreground outline-none focus:border-lilac-300"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !form.alias_name.trim() || !form.canonical_name.trim()}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-sm bg-foreground text-background text-2xs font-medium hover:opacity-80 disabled:opacity-40 transition-opacity shrink-0"
        >
          <Plus size={12} /> 추가
        </button>
      </div>

      {/* 목록 */}
      {loading && <p className="text-xs text-ink-400 text-center py-4">불러오는 중...</p>}

      {!loading && grouped.length === 0 && (
        <p className="text-xs text-ink-400 text-center py-4">등록된 별칭이 없습니다.</p>
      )}

      {!loading && grouped.length > 0 && (
        <div className="space-y-2">
          {grouped.map(([canonical, items]) => (
            <div key={canonical} className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
              <div className="text-xs font-semibold text-foreground">{canonical}</div>
              <div className="flex flex-wrap gap-1.5">
                {items.map(a => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 text-2xs bg-muted text-ink-500 px-2 py-0.5 rounded-full"
                  >
                    {a.alias_name}
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-ink-300 hover:text-status-late transition-colors"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
