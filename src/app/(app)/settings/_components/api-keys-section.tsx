'use client'

import { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff, Check, Trash2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface ApiKeyInfo {
  name: string
  label: string
  set: boolean
  masked: string | null
  updated_at: string | null
}

const PLACEHOLDERS: Record<string, string> = {
  anthropic:  'sk-ant-api03-...',
  slack_user: 'xoxp-...',
  outline:    'ol_api_...',
}

const DESCRIPTIONS: Record<string, string> = {
  anthropic:  'AI 일일·주간 분석에 사용됩니다',
  slack_user: 'Slack 채널 메시지 수집에 사용됩니다',
  outline:    'Outline 문서 불러오기에 사용됩니다',
}

function KeyRow({ info, onSaved, onDeleted }: {
  info: ApiKeyInfo
  onSaved: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing]   = useState(false)
  const [value, setValue]       = useState('')
  const [visible, setVisible]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: info.name, value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${info.label} 저장됨`)
      setValue('')
      setEditing(false)
      setVisible(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: info.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${info.label} 삭제됨`)
      onDeleted()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4 mb-1.5">
        <div>
          <p className="text-sm font-medium text-foreground">{info.label}</p>
          <p className="text-xs text-ink-400">{DESCRIPTIONS[info.name]}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {info.set && !editing && (
            <>
              <span className="text-xs font-mono text-ink-400 bg-muted px-2 py-0.5 rounded">
                {info.masked}
              </span>
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
                {deleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </button>
            </>
          )}
          {!info.set && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-2.5 py-1 rounded bg-foreground text-background font-medium hover:opacity-80 transition-opacity"
            >
              등록
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <input
              type={visible ? 'text' : 'password'}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder={PLACEHOLDERS[info.name]}
              autoFocus
              className="w-full bg-background border border-border rounded-sm px-2.5 py-1.5 text-sm font-mono outline-none focus:border-lilac-400 transition-colors pr-8"
            />
            <button
              type="button"
              onClick={() => setVisible(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-foreground"
            >
              {visible ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-foreground text-background text-sm font-medium hover:opacity-80 disabled:opacity-40 transition-opacity shrink-0"
          >
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
            저장
          </button>
          <button
            onClick={() => { setEditing(false); setValue(''); setVisible(false) }}
            className="text-sm text-ink-400 hover:text-foreground transition-colors"
          >
            취소
          </button>
        </div>
      )}
    </div>
  )
}

export function ApiKeysSection() {
  const [keys, setKeys]       = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/api-keys')
      const data = await res.json()
      if (Array.isArray(data)) setKeys(data)
    } catch {
      toast.error('API 키 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  if (loading) {
    return <p className="text-sm text-ink-400">불러오는 중...</p>
  }

  return (
    <div>
      {keys.map(info => (
        <KeyRow
          key={info.name}
          info={info}
          onSaved={fetchKeys}
          onDeleted={fetchKeys}
        />
      ))}
      <p className="text-xs text-ink-400 mt-3">
        * 키는 DB에 저장됩니다. 미설정 시 서버 환경변수를 우선 사용합니다.
      </p>
    </div>
  )
}
