// 'YYYY-MM' 형식 유틸리티

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [year, month] = ym.split('-').map(Number)
  return { year, month }
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function buildMonthRange(startYM: string, endYM: string): string[] {
  const result: string[] = []
  const start = parseYearMonth(startYM)
  const end = parseYearMonth(endYM)

  let year = start.year
  let month = start.month
  while (year < end.year || (year === end.year && month <= end.month)) {
    result.push(formatYearMonth(year, month))
    month++
    if (month > 12) { month = 1; year++ }
  }
  return result
}

// 0-based column index of target relative to viewStart
export function monthOffset(viewStart: string, target: string): number {
  const s = parseYearMonth(viewStart)
  const t = parseYearMonth(target)
  return (t.year - s.year) * 12 + (t.month - s.month)
}

export function getDefaultViewRange(): { startYM: string; endYM: string } {
  const now = new Date()
  const year = now.getFullYear()
  return {
    startYM: `${year}-01`,
    endYM: `${year}-12`,
  }
}

export const STATUS_LABELS: Record<string, string> = {
  'in-progress': 'In-Progress',
  'pending': 'Pending',
  'backlog': 'Backlog',
  'to-do': 'To-Do',
}

export const STATUS_COLORS: Record<string, string> = {
  'in-progress': 'bg-blue-100 text-blue-700',
  'pending': 'bg-yellow-100 text-yellow-700',
  'backlog': 'bg-slate-100 text-slate-600',
  'to-do': 'bg-purple-100 text-purple-700',
}

export const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
