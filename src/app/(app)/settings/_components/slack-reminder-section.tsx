'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, BellOff, Check, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export function SlackReminderSection() {
  const [channelId, setChannelId] = useState<string | null>(null)
  const [editing,   setEditing]   = useState(false)
  const [value,     setValue]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [loading,   setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/settings/api-keys')
      const data = await res.json() as { name: string; set: boolean; masked: string | null }[]
      if (Array.isArray(data)) {
        const ch = data.find(k => k.name === 'slack_reminder_channel')
        setChannelId(ch?.set ? (ch.masked ?? '') : null)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => load())
  }, [load])

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'slack_reminder_channel', value: value.trim() }),
      })
      if (!res.ok) throw new Error()
      toast.success('채널 ID가 저장됐습니다')
      setValue(''); setEditing(false)
      await load()
    } catch { toast.error('저장 실패') } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'slack_reminder_channel' }),
      })
      if (!res.ok) throw new Error()
      toast.success('채널 설정이 삭제됐습니다')
      setChannelId(null)
    } catch { toast.error('삭제 실패') } finally { setDeleting(false) }
  }

  if (loading) return <p className="text-sm text-ink-400">불러오는 중...</p>

  const enabled = !!channelId

  return (
    <div className="space-y-3">
      {/* 상태 + 채널 표시 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {enabled
            ? <Bell size={13} className="text-mint-500 shrink-0" />
            : <BellOff size={13} className="text-ink-400 shrink-0" />
          }
          <span className="text-sm text-foreground">{enabled ? '활성화됨' : '비활성화'}</span>
          {enabled && (
            <span className="text-xs font-mono text-ink-400 bg-muted px-2 py-0.5 rounded truncate">
              {channelId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {enabled && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-lilac-600 hover:underline"
              >
                변경
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-ink-400 hover:text-status-late transition-colors disabled:opacity-50"
                title="삭제"
              >
                {deleting
                  ? <RefreshCw size={12} className="animate-spin" />
                  : <Trash2 size={12} />
                }
              </button>
            </>
          )}
          {!enabled && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-2.5 py-1 rounded bg-foreground text-background font-medium hover:opacity-80 transition-opacity"
            >
              채널 등록
            </button>
          )}
        </div>
      </div>

      {/* 편집 폼 */}
      {editing && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="C08XXXXXXXX"
            autoFocus
            className="flex-1 bg-background border border-border rounded-sm px-2.5 py-1.5 text-sm font-mono outline-none focus:border-lilac-400 transition-colors"
          />
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-foreground text-background text-sm font-medium hover:opacity-80 disabled:opacity-40 transition-opacity shrink-0"
          >
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
            저장
          </button>
          <button
            onClick={() => { setEditing(false); setValue('') }}
            className="text-sm text-ink-400 hover:text-foreground transition-colors"
          >
            취소
          </button>
        </div>
      )}

      {/* 안내 */}
      <div className="rounded-md bg-muted/50 px-3 py-2.5 space-y-1">
        <p className="text-xs text-ink-500">• 매일 오전 9시 (KST)에 지연·오늘·내일 마감 태스크를 발송합니다</p>
        <p className="text-xs text-ink-500">• 채널 ID: Slack에서 채널 우클릭 → <strong className="font-medium">채널 ID 복사</strong></p>
        <p className="text-xs text-ink-400">
          • 프로덕션 서버에{' '}
          <code className="bg-muted rounded px-1 font-mono">CRON_SECRET</code>,{' '}
          <code className="bg-muted rounded px-1 font-mono">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
          환경변수도 설정해야 합니다
        </p>
      </div>
    </div>
  )
}
