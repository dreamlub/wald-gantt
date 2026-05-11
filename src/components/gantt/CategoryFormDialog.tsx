'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { GanttCategory } from '@/types'

const PALETTE = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#10b981',
  '#f59e0b', '#ef4444', '#8b5cf6', '#64748b',
]

interface Props {
  open: boolean
  onClose: () => void
  onSave: (name: string, color: string) => Promise<void>
  editCategory?: GanttCategory | null
}

export function CategoryFormDialog({ open, onClose, onSave, editCategory }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editCategory) {
      setName(editCategory.name)
      setColor(editCategory.color)
    } else {
      setName('')
      setColor(PALETTE[0])
    }
  }, [editCategory, open])

  async function handleSave() {
    if (!name.trim()) return
    setLoading(true)
    try {
      await onSave(name.trim(), color)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editCategory ? '카테고리 수정' : '카테고리 추가'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>이름</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="카테고리명" />
          </div>
          <div className="space-y-1.5">
            <Label>색상</Label>
            <div className="flex gap-2 flex-wrap">
              {PALETTE.map(c => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={loading || !name.trim()}>
            {loading ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
