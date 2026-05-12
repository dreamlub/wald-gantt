'use client'

import { useEffect, useState } from 'react'
import { Link2, Copy, Trash2, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getShareToken, createShareToken, deleteShareToken } from '@/lib/gantt-service'

interface Props {
  open: boolean
  onClose: () => void
  boardId: string
  boardName: string
}

export function ShareDialog({ open, onClose, boardId, boardName }: Props) {
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getShareToken(boardId)
      .then(setToken)
      .finally(() => setLoading(false))
  }, [open, boardId])

  const shareUrl = token ? `${window.location.origin}/share/${token}` : null

  async function handleCreate() {
    setLoading(true)
    try {
      const t = await createShareToken(boardId)
      setToken(t)
    } finally {
      setLoading(false)
    }
  }

  async function handleRevoke() {
    if (!confirm('공유 링크를 삭제하면 기존 링크로 접근할 수 없게 됩니다. 계속할까요?')) return
    setLoading(true)
    try {
      await deleteShareToken(boardId)
      setToken(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 size={16} />
            외부 공유
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">{boardName}</span> 보드의 공개 읽기 링크를 생성합니다. 링크를 아는 누구나 로그인 없이 열람할 수 있습니다.
          </p>

          {loading ? (
            <div className="flex items-center justify-center h-12">
              <Loader2 size={18} className="animate-spin text-gray-400" />
            </div>
          ) : shareUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="text-xs text-gray-600 flex-1" />
                <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
                  {copied ? <span className="text-green-600 text-xs">복사됨!</span> : <><Copy size={13} /> 복사</>}
                </Button>
              </div>
              <button
                onClick={handleRevoke}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                <Trash2 size={12} /> 링크 삭제
              </button>
            </div>
          ) : (
            <Button onClick={handleCreate} className="w-full" size="sm">
              <Link2 size={14} /> 공유 링크 생성
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
