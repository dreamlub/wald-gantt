'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, X, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { BrandIcon, BRAND_ICONS } from '@/components/brand-icon'
import { invalidateBrandProfiles } from '@/hooks/use-brand-profiles'
import type { Client } from '../../slack/_lib/types'

interface Profile {
  name: string
  logo_url: string | null
  lucide_icon: string | null
}

interface Props {
  clients: Client[]
}

export function BrandProfilesSection({ clients }: Props) {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState<string | null>(null)
  const fileRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/settings/brand-profiles')
      .then(r => r.json())
      .then(({ profiles: list }: { profiles: Profile[] }) => {
        const map = new Map<string, Profile>()
        for (const p of list ?? []) map.set(p.name, p)
        setProfiles(map)
      })
      .catch(() => toast.error('브랜드 프로필 로드 실패'))
      .finally(() => setLoading(false))
  }, [])

  const getProfile = (name: string): Profile =>
    profiles.get(name) ?? { name, logo_url: null, lucide_icon: null }

  const handleIconSelect = async (brandName: string, icon: string | null) => {
    setSaving(brandName)
    setPickerOpen(null)
    try {
      const res = await fetch('/api/settings/brand-profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: brandName, lucide_icon: icon }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setProfiles(prev => {
        const next = new Map(prev)
        const p = next.get(brandName) ?? { name: brandName, logo_url: null, lucide_icon: null }
        next.set(brandName, { ...p, lucide_icon: icon })
        return next
      })
      invalidateBrandProfiles()
      toast.success('아이콘이 저장됐습니다')
    } catch {
      toast.error('저장 실패')
    } finally {
      setSaving(null)
    }
  }

  const handleLogoUpload = async (brandName: string, file: File) => {
    setUploading(brandName)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', brandName)
      const res = await fetch('/api/settings/brand-profiles/upload', { method: 'POST', body: fd })
      const json = await res.json() as { logo_url?: string; error?: string }
      if (!res.ok) throw new Error(json.error)
      setProfiles(prev => {
        const next = new Map(prev)
        const p = next.get(brandName) ?? { name: brandName, logo_url: null, lucide_icon: null }
        next.set(brandName, { ...p, logo_url: json.logo_url! })
        return next
      })
      invalidateBrandProfiles()
      toast.success('로고가 업로드됐습니다')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(null)
    }
  }

  const handleReset = async (brandName: string) => {
    setSaving(brandName)
    try {
      const res = await fetch(`/api/settings/brand-profiles?name=${encodeURIComponent(brandName)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setProfiles(prev => {
        const next = new Map(prev)
        next.delete(brandName)
        return next
      })
      invalidateBrandProfiles()
      toast.success('초기화됐습니다')
    } catch {
      toast.error('초기화 실패')
    } finally {
      setSaving(null)
    }
  }

  // 외부 클릭 시 피커 닫기 — pickerRef로 내부 클릭 제외
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current?.contains(e.target as Node)) return
      setPickerOpen(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  const brandNames = clients.map(c => c.name).filter(Boolean)

  if (loading) return <p className="text-sm text-ink-400 py-2">불러오는 중...</p>
  if (brandNames.length === 0) return <p className="text-sm text-ink-400 py-2">등록된 브랜드가 없습니다.</p>

  const iconKeys = Object.keys(BRAND_ICONS)

  return (
    <div className="space-y-1">
      {brandNames.map(name => {
        const p = getProfile(name)
        const isSaving = saving === name
        const isUploading = uploading === name
        const isPicker = pickerOpen === name

        return (
          <div key={name} className={`relative flex items-center gap-3 py-2 border-b border-border last:border-0 ${isPicker ? 'z-[10]' : ''}`}>
            {/* 미리보기 */}
            <BrandIcon name={name} logoUrl={p.logo_url} lucideIcon={p.lucide_icon} size={28} />

            {/* 브랜드명 */}
            <span className="flex-1 text-sm font-medium text-foreground truncate">{name}</span>

            {/* 로고 업로드 */}
            <div>
              <input
                ref={el => { if (el) fileRefs.current.set(name, el) }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleLogoUpload(name, file)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => fileRefs.current.get(name)?.click()}
                disabled={isUploading || isSaving}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-ink-500 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
              >
                {isUploading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
                로고
              </button>
            </div>

            {/* 아이콘 선택 */}
            <div className="relative">
              <button
                onClick={() => setPickerOpen(isPicker ? null : name)}
                disabled={isSaving || isUploading}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-ink-500 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
              >
                아이콘 선택
              </button>
              {isPicker && (
                <div
                  ref={pickerRef}
                  className="absolute right-0 top-full mt-1 z-overlay bg-card border border-border rounded-lg shadow-lg p-2 w-52"
                >
                  <div className="grid grid-cols-6 gap-1">
                    {iconKeys.map(key => {
                      const Icon = BRAND_ICONS[key]
                      return (
                        <button
                          key={key}
                          title={key}
                          onClick={() => handleIconSelect(name, key)}
                          className={`flex items-center justify-center w-7 h-7 rounded hover:bg-muted transition-colors ${p.lucide_icon === key ? 'bg-lilac-100 text-lilac-600' : 'text-ink-500'}`}
                        >
                          <Icon size={14} />
                        </button>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => handleIconSelect(name, null)}
                    className="mt-1.5 w-full text-xs text-ink-400 hover:text-foreground text-center py-0.5 hover:bg-muted rounded transition-colors"
                  >
                    아이콘 제거
                  </button>
                </div>
              )}
            </div>

            {/* 초기화 */}
            {(p.logo_url || p.lucide_icon) && (
              <button
                onClick={() => handleReset(name)}
                disabled={isSaving || isUploading}
                title="초기화"
                className="text-ink-300 hover:text-status-late transition-colors disabled:opacity-40"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
