// 브랜드명 → 안정적 팔레트 색상 매핑 (공용).
// history-service가 re-export하며 슬랙/통계/홈 등 다수 화면에서 사용.
const BRAND_PALETTE = [
  'var(--color-id-indigo)',
  'var(--color-id-purple)',
  'var(--color-id-teal)',
  'var(--color-id-green)',
  'var(--color-id-amber)',
  'var(--color-id-pink)',
  'var(--color-id-blue)',
  'var(--color-id-orange)',
]

export function brandColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return BRAND_PALETTE[h % BRAND_PALETTE.length]
}
