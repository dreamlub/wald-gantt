import type { WeeklyReportSummary } from '@/types'

// weekly_reports.summary(JSON) 구조 검증.
// 저장 전 가드 + 표시 전 깨진 요약 감지에 공용으로 사용.

const ITEM_TYPES = new Set(['issue', 'decision', 'plan'])

export interface SummaryValidation {
  valid: boolean
  error?: string
}

export function validateWeeklySummary(value: unknown): SummaryValidation {
  if (value == null) return { valid: false, error: 'summary가 비어 있습니다' }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'summary가 객체가 아닙니다' }
  }
  const obj = value as Record<string, unknown>
  if (typeof obj.summary !== 'string') {
    return { valid: false, error: 'summary.summary(요약문)가 문자열이 아닙니다' }
  }
  if (!Array.isArray(obj.items)) {
    return { valid: false, error: 'summary.items가 배열이 아닙니다' }
  }
  for (let i = 0; i < obj.items.length; i++) {
    const it = obj.items[i]
    if (typeof it !== 'object' || it === null) {
      return { valid: false, error: `items[${i}]가 객체가 아닙니다` }
    }
    const item = it as Record<string, unknown>
    if (typeof item.title !== 'string' || !item.title.trim()) {
      return { valid: false, error: `items[${i}].title이 비어 있습니다` }
    }
    if (typeof item.type !== 'string' || !ITEM_TYPES.has(item.type)) {
      return { valid: false, error: `items[${i}].type이 올바르지 않습니다 (${String(item.type)})` }
    }
  }
  return { valid: true }
}

export function isValidWeeklySummary(value: unknown): value is WeeklyReportSummary {
  return validateWeeklySummary(value).valid
}
