import type { SVGProps } from 'react'

/**
 * Slack 브랜드 아이콘 (공식 로고 형태)
 * lucide-react에 브랜드 아이콘이 없어 직접 구현
 */
export function SlackIcon({ size = 16, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* top-left: 수평 바 + 왼쪽 동그라미 */}
      <rect x="3" y="8.5" width="8" height="3" rx="1.5" />
      <circle cx="4.5" cy="10" r="1.5" />

      {/* top-right: 수직 바 + 위 동그라미 */}
      <rect x="12.5" y="3" width="3" height="8" rx="1.5" />
      <circle cx="14" cy="4.5" r="1.5" />

      {/* bottom-right: 수평 바 + 오른쪽 동그라미 */}
      <rect x="13" y="12.5" width="8" height="3" rx="1.5" />
      <circle cx="19.5" cy="14" r="1.5" />

      {/* bottom-left: 수직 바 + 아래 동그라미 */}
      <rect x="8.5" y="13" width="3" height="8" rx="1.5" />
      <circle cx="10" cy="19.5" r="1.5" />
    </svg>
  )
}
