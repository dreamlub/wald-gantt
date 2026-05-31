import { BrandIcon } from '@/components/brand-icon'
import type { Client } from '../../slack/_lib/types'

// 브랜드별 아이콘 미리보기. 로고 업로드·아이콘 선택의 영속 계층(테이블·API)은
// 아직 없어, 현재는 각 브랜드의 기본 아이콘(이름 첫 글자)만 읽기 전용으로 보여준다.
export function BrandProfilesSection({ clients }: { clients: Client[] }) {
  if (clients.length === 0) {
    return <p className="text-sm text-ink-400">등록된 브랜드가 없습니다.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {clients.map(c => (
          <div key={c.name} className="flex items-center gap-2 rounded-lg border border-ink-300 px-3 py-2">
            <BrandIcon name={c.name} size={8} />
            <span className="text-sm text-foreground truncate">{c.name}</span>
          </div>
        ))}
      </div>
      <p className="text-2xs text-ink-400">로고 업로드·아이콘 커스터마이즈는 준비 중입니다.</p>
    </div>
  )
}
