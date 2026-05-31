import { brandColor } from '@/lib/brand-color'

// 브랜드 표시 아이콘. 로고 URL이 있으면 이미지를, 없으면 브랜드색 원형에
// 이름 첫 글자를 렌더한다. `lucideIcon`은 영속 계층이 생기면 사용할 예약 prop
// (현재 프로필이 비어 있어 전달되지 않으므로 미사용 — 타입에는 유지).
interface BrandIconProps {
  name: string
  logoUrl?: string | null
  lucideIcon?: string | null
  /** Tailwind 스페이싱 단위(예: 8 → 32px). */
  size?: number
}

export function BrandIcon({ name, logoUrl, size = 8 }: BrandIconProps) {
  const px = size * 4
  const letter = (name.trim()[0] ?? '?').toUpperCase()

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: px, height: px }}
      />
    )
  }

  return (
    <span
      className="rounded-full shrink-0 inline-flex items-center justify-center font-semibold text-white"
      style={{ width: px, height: px, fontSize: px * 0.45, background: brandColor(name) }}
      aria-hidden
    >
      {letter}
    </span>
  )
}
