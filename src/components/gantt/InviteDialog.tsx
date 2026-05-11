'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
}

export function InviteDialog({ open, onClose, workspaceId }: Props) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleInvite() {
    if (!email.trim()) return
    setLoading(true)
    setMessage('')
    try {
      // Find or create user, then add to workspace
      // In production: use Supabase Auth Admin or Magic Link flow
      // For now: try to find user by listing members (simple approach)
      const { data, error } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId)

      if (error) throw error

      // Note: Full invite flow requires server-side auth admin
      // This shows the workspace ID for manual addition
      setMessage(`워크스페이스 ID: ${workspaceId}\n상대방이 가입 후 이 ID로 참여할 수 있습니다.`)
    } catch (e) {
      setMessage('오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>멤버 초대</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>워크스페이스 ID</Label>
            <div className="flex items-center gap-2">
              <Input value={workspaceId} readOnly className="text-xs text-gray-500" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(workspaceId)}
              >
                복사
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              팀원에게 이 ID를 공유하세요. 팀원이 가입 후 워크스페이스 참여 기능으로 입력하면 됩니다.
            </p>
          </div>
          {message && (
            <p className="text-xs text-blue-600 bg-blue-50 rounded p-2 whitespace-pre">{message}</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
