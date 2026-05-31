import { useMemo } from 'react'

// 브랜드별 표시 프로필(로고/아이콘). 영속 계층(테이블·API)은 아직 없으므로
// 현재는 항상 빈 맵을 반환 → BrandIcon이 이름 첫 글자 fallback으로 렌더한다.
// 백엔드가 생기면 이 훅만 교체하면 소비처는 그대로 동작한다.
export interface BrandProfile {
  logo_url?: string | null
  lucide_icon?: string | null
}

export function useBrandProfiles(): Map<string, BrandProfile> {
  return useMemo(() => new Map<string, BrandProfile>(), [])
}
