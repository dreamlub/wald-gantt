'use client'

import { useState, useEffect } from 'react'
import { X, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from '@/components/ui/drawer'
import type { Client } from '@/app/(app)/summary/_lib/types'

const BRAND_COLORS = [
  '#818cf8', '#60a5fa', '#4ade80', '#facc15',
  '#fb923c', '#f87171', '#f472b6', '#c084fc',
  '#c7d2fe', '#bfdbfe', '#bbf7d0', '#fef08a',
  '#fed7aa', '#fecaca', '#fbcfe8', '#ddd6fe',
]

interface Props {
  brand: Client | null
  workspaceId: string
  open: boolean
  onClose: () => void
  onSaved: (brand: Client, isNew: boolean) => void
  onDeleted: (id: string) => void
}

export function BrandDrawer({ brand, workspaceId, open, onClose, onSaved, onDeleted }: Props) {
  const isNew = brand === null

  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [color, setColor] = useState(BRAND_COLORS[0])
  const [keywords, setKeywords] = useState<string[]>([])
  const [kwInput, setKwInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [historyCount, setHistoryCount] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setName(brand?.name ?? '')
      setNameEn(brand?.name_en ?? '')
      setColor(brand?.color ?? BRAND_COLORS[0])
      setKeywords(brand?.keywords ?? [])
      setKwInput('')
      setConfirmDelete(false)
      setHistoryCount(null)
    }
  }, [open, brand])

  const addKw = () => {
    const v = kwInput.trim().toLowerCase()
    if (!v || keywords.includes(v)) { setKwInput(''); return }
    setKeywords(prev => [...prev, v])
    setKwInput('')
  }

  const removeKw = (kw: string) => setKeywords(prev => prev.filter(k => k !== kw))

  const handleSave = async () => {
    if (!name.trim()) { toast.error('브랜드명을 입력해주세요.'); return }
    setSaving(true)
    try {
      const sb = createClient()
      if (isNew) {
        const { data: maxRow } = await sb
          .from('clients')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()
        const sort_order = (maxRow?.sort_order ?? -10) + 10
        const { data, error } = await sb
          .from('clients')
          .insert({ workspace_id: workspaceId, name: name.trim(), name_en: nameEn.trim() || null, color, keywords, sort_order })
          .select()
          .single()
        if (error) throw error
        onSaved({ id: data.id, name: data.name, name_en: data.name_en ?? '', color: data.color, keywords: data.keywords ?? [] }, true)
      } else {
        const { error } = await sb
          .from('clients')
          .update({ name: name.trim(), name_en: nameEn.trim() || null, color, keywords })
          .eq('id', brand!.id)
        if (error) throw error
        onSaved({ ...brand!, name: name.trim(), name_en: nameEn.trim(), color, keywords }, false)
      }
      toast.success(isNew ? '브랜드가 추가되었습니다.' : '저장되었습니다.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClick = async () => {
    if (!brand) return
    const sb = createClient()
    const { count } = await sb
      .from('client_history')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', brand.id)
      .is('deleted_at', null)
    setHistoryCount(count ?? 0)
    setConfirmDelete(true)
  }

  const handleDeleteConfirm = async () => {
    if (!brand) return
    try {
      const sb = createClient()
      const { error } = await sb.from('clients').delete().eq('id', brand.id)
      if (error) throw error
      onDeleted(brand.id)
      toast.success('브랜드가 삭제되었습니다.')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <Drawer open={open} onClose={onClose} width={440}>
      <DrawerHeader>
        <div className="flex items-center justify-between px-5 py-3.5">
          <span className="text-xs font-semibold text-foreground">
            {isNew ? '새 브랜드' : brand?.name}
          </span>
          <div className="flex items-center gap-2">
            {!isNew && !confirmDelete && (
              <button
                onClick={handleDeleteClick}
                className="text-ink-400 hover:text-status-late transition-colors"
                aria-label="브랜드 삭제"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button onClick={onClose} className="text-ink-400 hover:text-foreground transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        {confirmDelete && (
          <div className="px-5 py-3 bg-status-late/5 border-t border-status-late/20">
            <p className="text-[11px] text-foreground mb-2.5">
              {historyCount !== null && historyCount > 0 ? (
                <><span className="font-semibold text-status-late">연결된 히스토리 {historyCount}건</span>이 있습니다. 브랜드를 삭제하면 복구할 수 없습니다.</>
              ) : (
                '이 브랜드를 삭제하시겠습니까? 복구할 수 없습니다.'
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 rounded bg-status-late text-background text-[11px] font-medium hover:opacity-80 transition-opacity"
              >
                삭제
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-muted transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </DrawerHeader>

      <DrawerBody className="px-5 py-5 space-y-5">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">이름 (KR)</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="브랜드명"
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs outline-none focus:border-lilac-400 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">이름 (EN)</label>
          <input
            value={nameEn}
            onChange={e => setNameEn(e.target.value)}
            placeholder="Brand name in English"
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs outline-none focus:border-lilac-400 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">색상</label>
          <div className="grid grid-cols-8 gap-1.5">
            {BRAND_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border border-black/5 hover:scale-110 transition-transform ${color === c ? 'ring-2 ring-foreground ring-offset-1' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">키워드</label>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {keywords.length === 0 && <span className="text-[11px] text-ink-400">키워드 없음</span>}
            {keywords.map(kw => (
              <span key={kw} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-ink-100 text-ink-700 border border-border">
                {kw}
                <button onClick={() => removeKw(kw)} aria-label={`키워드 ${kw} 삭제`} className="text-ink-400 hover:text-status-late transition-colors leading-none">✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={kwInput}
              onChange={e => setKwInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKw() } }}
              placeholder="Enter 또는 쉼표로 추가"
              className="flex-1 bg-background border border-border rounded-sm px-2.5 py-1.5 text-[11px] outline-none focus:border-lilac-400 transition-colors"
            />
            <button
              onClick={addKw}
              className="inline-flex items-center gap-1 h-7 px-3 rounded-sm border border-border text-[11px] font-medium hover:bg-muted transition-colors shrink-0"
            >
              <Plus size={12} /> 추가
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">Slack 채널</label>
          <input
            disabled
            placeholder="#채널명"
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-[11px] opacity-40 cursor-not-allowed"
          />
          <p className="text-[10px] text-ink-400">* 채널 매핑 저장 기능은 준비 중입니다.</p>
        </div>
      </DrawerBody>

      <DrawerFooter>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded border border-border text-xs hover:bg-muted transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-4 py-1.5 rounded bg-foreground text-background text-xs font-medium hover:opacity-80 disabled:opacity-40 transition-opacity"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </DrawerFooter>
    </Drawer>
  )
}
