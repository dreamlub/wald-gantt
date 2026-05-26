/**
 * date-utils.ts — 앱 전역 날짜 포맷 표준
 *
 * 규칙:
 *   - YYYY-MM-DD 문자열은 KST 날짜로 간주 (DB 저장값 기준)
 *   - UTC ISO timestamp는 로컬 타임존(브라우저) 기준으로 표시
 */

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const

/** KST YYYY-MM-DD 문자열 → Date (KST 자정 기준) */
function ymdToKST(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`)
}

// ── 저장·비교용 ──────────────────────────────────────────────

/** Date → "YYYY-MM-DD" */
export function toYMD(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

// ── 단축 표시 (캘린더 셀, 타임라인 레이블) ──────────────────

/**
 * YYYY-MM-DD 또는 ISO timestamp → "M/D"
 * - YYYY-MM-DD: KST 자정 기준
 * - ISO timestamp: 브라우저 로컬 타임존 기준 (scheduled_at 등)
 */
export function toShortDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = value.length === 10 ? ymdToKST(value) : new Date(value)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── 날짜 + 요일 (섹션 헤더, 알림) ───────────────────────────

/**
 * YYYY-MM-DD → 날짜 + 요일 표시
 * @param style
 *   'compact' (default) → "5/23 토요일"   — 섹션 헤더, UI 레이블
 *   'full'              → "5월 23일 (토)"  — 알림, 리포트 본문
 */
export function formatDay(ymd: string, style: 'compact' | 'full' = 'compact'): string {
  const d = ymdToKST(ymd)
  const dow = DOW[d.getDay()]
  if (style === 'full') {
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${dow}요일`
}
