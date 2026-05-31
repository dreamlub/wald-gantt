/**
 * week-format.ts — 주차 표시 공용 유틸 (ISO 주차 번호 + 주 범위 라벨)
 *
 * 여러 화면(업무 캘린더·주간보고 등)이 각자 ISO 주차를 계산하고 범위를
 * 제각각 표기하던 것을 한 곳으로 통일한다.
 *  - 주차 표기는 항상 `W{n}` (예: W22). `{n}W` 형식 금지.
 *  - 날짜는 'YYYY-MM-DD'(KST 날짜) 문자열을 입력으로 받는다.
 */
import { getISOWeek } from 'date-fns'

/** 'YYYY-MM-DD' → ISO 주차 번호 (1~53) */
export function isoWeek(ymd: string): number {
  return getISOWeek(new Date(ymd + 'T00:00:00'))
}

function md(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `${m}/${d}`
}

/**
 * 주 범위 + ISO 주차 통일 라벨.
 * 예: weekRangeLabel('2026-05-25', '2026-05-29') → "5/25 ~ 5/29 (2026년 W22)"
 * 연도는 종료일 기준(연 경계 주에서 끝나는 해를 표기), 주차는 시작일 기준.
 */
export function weekRangeLabel(startYmd: string, endYmd: string): string {
  const endYear = Number(endYmd.slice(0, 4))
  return `${md(startYmd)} ~ ${md(endYmd)} (${endYear}년 W${isoWeek(startYmd)})`
}
