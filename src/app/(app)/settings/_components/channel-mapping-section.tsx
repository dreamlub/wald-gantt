'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { RefreshCw, Hash, MessageSquare, EyeOff, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import type { Client } from '../../summary/_lib/types'
import type { SlackChannelItem } from '@/app/api/slack/channels/route'
import { AutocompleteInput } from '@/components/AutocompleteInput'

type Filter = 'all' | 'unmapped'

interface Props {
  clients: Client[]
}

export function ChannelMappingSection({ clients }: Props) {
  const [channels, setChannels] = useState<SlackChannelItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [missingScopes, setMissingScopes] = useState<string[]>([])
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [showExcluded, setShowExcluded] = useState(false)

  const markDirty = (channelId: string) =>
    setDirty(prev => new Set(prev).add(channelId))

  useEffect(() => {
    let cancelled = false
    async function loadSaved() {
      try {
        const res = await fetch('/api/slack/channel-mappings')
        const json = await res.json()
        if (!res.ok || cancelled) return
        const saved = (json.channels ?? []) as SlackChannelItem[]
        if (saved.length > 0) {
          setChannels(saved)
          setLoaded(true)
        }
      } catch { /* 무시 */ }
    }
    loadSaved()
    return () => { cancelled = true }
  }, [])

  const syncFromSlack = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/slack/channels')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setChannels(json.channels as SlackChannelItem[])
      setMissingScopes(json.missing_scopes ?? [])
      setLoaded(true)
      setDirty(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '채널 목록 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBrandChange = (channelId: string, brandName: string | null) => {
    markDirty(channelId)
    setChannels(prev =>
      prev.map(ch => ch.channel_id === channelId ? { ...ch, brand_name: brandName } : ch)
    )
  }

  const handleExcludeToggle = (channelId: string) => {
    markDirty(channelId)
    setChannels(prev =>
      prev.map(ch => ch.channel_id === channelId ? { ...ch, excluded: !ch.excluded } : ch)
    )
  }

  const saveAll = async () => {
    if (dirty.size === 0) { toast('변경 사항 없음'); return }
    setSaving(true)
    try {
      const mappings = channels
        .filter(ch => dirty.has(ch.channel_id))
        .map(ch => ({
          channel_id: ch.channel_id,
          channel_name: ch.channel_name,
          is_dm: ch.is_dm,
          dm_user_id: ch.dm_user_id,
          dm_user_name: ch.dm_user_name,
          brand_name: ch.brand_name,
          excluded: ch.excluded,
        }))

      const res = await fetch('/api/slack/channel-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      toast.success(`${json.saved}건 저장되었습니다.`)
      setDirty(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const brandSuggestions = useMemo(() => {
    const fromClients = clients.map(c => c.name)
    const fromChannels = channels.map(ch => ch.brand_name).filter((n): n is string => !!n)
    return [...new Set([...fromClients, ...fromChannels])].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [clients, channels])

  const activeChannels = useMemo(() => channels.filter(ch => !ch.excluded || dirty.has(ch.channel_id)), [channels, dirty])
  const excludedChannels = useMemo(() => channels.filter(ch => ch.excluded && !dirty.has(ch.channel_id)), [channels, dirty])
  const unmappedCount = activeChannels.filter(ch => !ch.brand_name).length

  const visibleChannels = useMemo(() => {
    if (filter === 'unmapped') return activeChannels.filter(ch => !ch.brand_name || dirty.has(ch.channel_id))
    return activeChannels
  }, [activeChannels, filter, dirty])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs text-muted-foreground">
          Slack 채널과 브랜드를 직접 연결합니다. 저장 후 신규 수집부터 적용됩니다.
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <SaveButton saving={saving} dirty={dirty} onClick={saveAll} />
          <button
            onClick={syncFromSlack}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border text-2xs font-medium text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Slack 채널 현행화
          </button>
        </div>
      </div>

      {loaded && missingScopes.length > 0 && (
        <div className="rounded border border-status-warn/30 bg-status-warn/5 px-3 py-2 space-y-1">
          <p className="text-2xs font-medium text-status-warn">일부 채널 타입을 불러오지 못했습니다.</p>
          <p className="text-3xs text-ink-400">
            Slack 앱에 아래 스코프를 추가하면 해당 채널도 표시됩니다:
          </p>
          <ul className="text-3xs text-ink-400 list-disc list-inside space-y-0.5">
            {missingScopes.map(s => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}

      {loaded && channels.length > 0 && (
        <>
          {/* 필터 */}
          <div className="flex items-center gap-1.5">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              전체 {activeChannels.length}
            </FilterChip>
            <FilterChip active={filter === 'unmapped'} onClick={() => setFilter('unmapped')}>
              미지정 {unmappedCount}
            </FilterChip>
          </div>

          {/* 활성 채널 목록 */}
          <div className="grid grid-cols-2 gap-2">
            {visibleChannels.map(ch => (
              <ChannelRow
                key={ch.channel_id}
                ch={ch}
                dirty={dirty.has(ch.channel_id)}
                brandSuggestions={brandSuggestions}
                onBrandChange={handleBrandChange}
                onExcludeToggle={handleExcludeToggle}
              />
            ))}
          </div>
          {visibleChannels.length === 0 && filter === 'unmapped' && (
            <p className="text-xs text-ink-400 text-center py-4">모든 채널에 브랜드가 지정되어 있습니다.</p>
          )}

          {/* 제외 채널 접힘 */}
          {excludedChannels.length > 0 && (
            <div>
              <button
                onClick={() => setShowExcluded(v => !v)}
                className="flex items-center gap-1.5 text-2xs text-ink-400 hover:text-foreground transition-colors py-1"
              >
                <ChevronDown size={12} className={`transition-transform ${showExcluded ? '' : '-rotate-90'}`} />
                <EyeOff size={11} />
                제외 {excludedChannels.length}개
              </button>
              {showExcluded && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {excludedChannels.map(ch => (
                    <ChannelRow
                      key={ch.channel_id}
                      ch={ch}
                      dirty={dirty.has(ch.channel_id)}
                      brandSuggestions={brandSuggestions}
                      onBrandChange={handleBrandChange}
                      onExcludeToggle={handleExcludeToggle}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <SaveButton saving={saving} dirty={dirty} onClick={saveAll} />
          </div>
        </>
      )}

      {!loaded && (
        <p className="text-xs text-ink-400 py-4 text-center">저장된 채널 매핑을 불러오는 중...</p>
      )}

      {loaded && channels.length === 0 && (
        <p className="text-xs text-ink-400">저장된 매핑이 없습니다. &quot;Slack 동기화&quot; 버튼으로 채널을 불러오세요.</p>
      )}
    </div>
  )
}

function ChannelRow({ ch, dirty, brandSuggestions, onBrandChange, onExcludeToggle }: {
  ch: SlackChannelItem
  dirty: boolean
  brandSuggestions: string[]
  onBrandChange: (id: string, name: string | null) => void
  onExcludeToggle: (id: string) => void
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 border border-border rounded-lg transition-colors ${
        ch.excluded ? 'bg-muted/80 opacity-60' : 'hover:bg-muted/50'
      }`}
    >
      <span className="text-ink-400 shrink-0">
        {ch.is_dm ? <MessageSquare size={13} /> : <Hash size={13} />}
      </span>
      <span className="text-xs text-foreground truncate min-w-0 flex-1">
        {ch.channel_name || ch.channel_id}
        {dirty && <span className="ml-1 text-3xs text-lilac-500">●</span>}
      </span>
      <AutocompleteInput
        value={ch.brand_name ?? ''}
        onChange={v => onBrandChange(ch.channel_id, v || null)}
        suggestions={brandSuggestions}
        placeholder="브랜드명"
        className="text-2xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-lilac-300 w-[120px] shrink-0"
      />
      <button
        onClick={() => onExcludeToggle(ch.channel_id)}
        title={ch.excluded ? '수집 제외됨 — 클릭하여 해제' : '클릭하여 수집 제외'}
        className={`shrink-0 inline-flex items-center gap-1 text-3xs px-1.5 py-0.5 rounded-full border transition-colors ${
          ch.excluded
            ? 'bg-status-late/15 border-status-late/40 text-status-late'
            : 'border-border text-ink-400 hover:border-ink-300 hover:text-ink-500'
        }`}
      >
        <EyeOff size={9} />
        제외
      </button>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-2xs px-2.5 py-[3px] rounded-full border transition-colors ${
        active
          ? 'bg-foreground text-white border-foreground'
          : 'bg-card text-muted-foreground border-border hover:border-ink-400'
      }`}
    >
      {children}
    </button>
  )
}

function SaveButton({ saving, dirty, onClick }: { saving: boolean; dirty: Set<string>; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving || dirty.size === 0}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-foreground text-background text-2xs font-medium hover:opacity-80 disabled:opacity-40 transition-opacity"
    >
      {saving ? '저장 중...' : `저장${dirty.size > 0 ? ` (${dirty.size}건)` : ''}`}
    </button>
  )
}
