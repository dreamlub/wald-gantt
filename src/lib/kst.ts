/**
 * kst.ts — 앱 전역 KST(Asia/Seoul) 타임존 단일 기준
 *
 * 원칙 (CLAUDE.md):
 *  - DB 저장 instant(`occurred_at` 등)는 **순수 UTC**. KST 변환은 조회·표시 레이어에서만.
 *  - `YYYY-MM-DD` 문자열은 KST 날짜로 간주한다.
 *
 * 모든 KST 계산은 이 모듈만 사용한다.
 *  - 인라인 `Date.now() + 9 * 60 * 60 * 1000` 같은 고정 오프셋 핵 금지.
 *  - instant 를 그냥 `.toISOString().slice(0, 10)` 하는 패턴 금지(UTC 날짜라 KST와 어긋남).
 *  - 위 규칙은 kst.guard.test.ts 가 강제한다.
 */

export const KST_TZ = 'Asia/Seoul'

/**
 * UTC instant(Date | ISO 문자열) → KST 기준 `YYYY-MM-DD`.
 * `sv-SE` 로캘은 `YYYY-MM-DD` 형식을 보장하므로 타임존만 KST로 지정하면 된다.
 * (고정 +9h 오프셋이 아니라 IANA 타임존을 쓰므로 환경/서머타임에 안전)
 */
export function kstDate(instant: Date | string = new Date()): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return d.toLocaleDateString('sv-SE', { timeZone: KST_TZ })
}

/** 오늘(KST) `YYYY-MM-DD` */
export function kstToday(): string {
  return kstDate(new Date())
}

/** 현재 KST 연도 */
export function kstYear(): number {
  return Number(kstToday().slice(0, 4))
}

/** instant → KST 날짜 구성요소 {ymd, year, month(1-12), day, dow(0=일)} */
export function kstParts(instant: Date | string = new Date()): {
  ymd: string
  year: number
  month: number
  day: number
  dow: number
} {
  const ymd = kstDate(instant)
  const [year, month, day] = ymd.split('-').map(Number)
  // 요일은 날짜 구성요소에서 계산 (UTC 고정 → 타임존 무관)
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return { ymd, year, month, day, dow }
}

// ── 날짜 문자열(YMD) 산술 — 타임존 무관, UTC 기준으로 안전하게 ──

/** `YYYY-MM-DD` 에 일수를 더한 `YYYY-MM-DD` (월·연 경계 자동 처리) */
export function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` 에 개월수를 더한 `YYYY-MM-DD` (일 overflow는 JS Date 규칙을 따름) */
export function addMonthsYMD(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10)
}

/** `from`~`to`(포함) 사이 KST 날짜 문자열 배열 */
export function kstDateRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let cur = from; cur <= to; cur = addDaysYMD(cur, 1)) out.push(cur)
  return out
}

// ── 쿼리 경계 (timestamptz 컬럼 비교용) ──

/** KST 하루 시작 경계 `YYYY-MM-DDT00:00:00+09:00` */
export function kstDayStart(date: string): string {
  return `${date}T00:00:00+09:00`
}

/** KST 하루 끝 경계 `YYYY-MM-DDT23:59:59.999+09:00` */
export function kstDayEnd(date: string): string {
  return `${date}T23:59:59.999+09:00`
}

/**
 * 반열린 구간 `[해당일 00:00, 다음날 00:00)` — `.gte(gte).lt(lt)` 비교 권장.
 * 끝 경계의 밀리초 누락 없이 하루를 정확히 포함한다.
 */
export function kstDayRange(date: string): { gte: string; lt: string } {
  return { gte: kstDayStart(date), lt: kstDayStart(addDaysYMD(date, 1)) }
}
