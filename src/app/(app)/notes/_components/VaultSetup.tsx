import { FolderOpen, RefreshCw } from 'lucide-react'
import type { VaultStatus } from '@/hooks/use-vault-handle'

interface Props {
  status: VaultStatus
  onConnect: () => void
  onRequestPermission: () => void
}

export function VaultSetup({ status, onConnect, onRequestPermission }: Props) {
  if (status === 'needs-permission') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <RefreshCw size={22} className="text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">폴더 접근 권한이 필요해요</p>
          <p className="text-xs mt-1 text-muted-foreground">브라우저를 새로 열면 권한 재확인이 필요합니다</p>
        </div>
        <button
          onClick={onRequestPermission}
          className="px-4 py-2 rounded-lg bg-foreground text-background text-xs font-medium hover:bg-ink-800 transition-colors"
        >
          권한 허용
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <FolderOpen size={22} className="text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Obsidian 폴더를 연결하세요</p>
        <p className="text-xs mt-1.5 text-muted-foreground leading-relaxed">
          Vault 폴더를 선택하면<br />
          Daily Note를 바로 읽고 쓸 수 있어요
        </p>
      </div>
      <button
        onClick={onConnect}
        className="px-4 py-2 rounded-lg bg-foreground text-background text-xs font-medium hover:bg-ink-800 transition-colors"
      >
        폴더 선택
      </button>
      <p className="text-[10px] text-ink-300">Chrome / Edge 전용</p>
    </div>
  )
}
