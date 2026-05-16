'use client'

import { useEffect, useState } from 'react'
import { useConfirm } from '@/hooks/use-confirm'
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
  const { confirm: showConfirm, dialog: confirmDialog } = useConfirm()
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied]   = useState(false)

  // 다이얼로그 열릴 때 공유 토큰 fetch (외부 fetch → setState 의도된 패턴)
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (!await showConfirm({
      title: '공유 링크 삭제',
      description: '기존 링크로 더 이상 접근할 수 없게 돼요.',
    })) return
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
    <>
    {confirmDialog}
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 size={16} />
            외부 공유
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{boardName}</span> 보드의 공개 읽기 링크를 생성합니다. 링크를 아는 누구나 로그인 없이 열람할 수 있습니다.
          </p>

          {loading ? (
            <div className="flex items-center justify-center h-12">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : shareUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="text-xs text-muted-foreground flex-1" />
                <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
                  {copied ? <span className="text-mint-500 text-xs">복사됨!</span> : <><Copy size={13} /> 복사</>}
                </Button>
              </div>
              <button
                onClick={handleRevoke}
                className="flex items-center gap-1 text-xs text-status-late hover:text-status-late/80 transition-colors"
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
    </>
  )
}
