// 팀별 고정 색 팔레트 — weekly_sources.sort_order 순서로 자동 할당.
// 사이드바 "수집 현황"의 팀 점/막대 색에 사용.
const TEAM_PALETTE = [
  '#5B8DEF', // 파랑
  '#8275ED', // 보라 (lilac-500)
  '#5BC9A6', // 초록 (mint-500)
  '#F0915C', // 주황 (coral-500)
  '#E2566F', // 빨강
  '#3FB6C9', // 청록
  '#D98AE0', // 자홍
] as const

/** sort_order(0-based index)로 팀 색을 결정. 팔레트를 넘으면 순환. */
export function teamColor(index: number): string {
  return TEAM_PALETTE[index % TEAM_PALETTE.length]
}
