import { z } from 'zod'
import { addDaysYMD } from '@/lib/kst'
import type { WeeklyReportSummary, WeeklyReportItem, WeeklyDiffSummary } from '@/types/index'

// ── Zod 스키마 ──────────────────────────────────────────────────────────────

export const ExtractedItemSchema = z.object({
  type:              z.enum(['issue', 'decision', 'plan']),
  title:             z.string(),
  detail:            z.string(),
  date:              z.string().nullable(),
  brand:             z.string().nullable(),
  assignee:          z.string().nullable(),
  task_type:         z.string().nullable(),
  status:            z.string().nullable(),
  action_required:   z.boolean(),
  task_title:        z.string().nullable(),
  task_memo:         z.string().nullable(),
  due_date:          z.string().nullable(),
  estimated_minutes: z.number().nullable(),
})

export const ExtractedReportSchema = z.object({
  items:   z.array(ExtractedItemSchema),
  summary: z.string(),
})

export const InsightNarrativeSchema = z.object({
  headline: z.string(),
  changes:  z.string(),
})

// ── DB 타입 ──────────────────────────────────────────────────────────────────

export type DbReport = {
  id: string
  team: string
  author: string | null
  source: string
  week_start: string
  raw_content: string | null
  summary: unknown
}

// ── 날짜 유틸 ────────────────────────────────────────────────────────────────

export function subtractWeek(dateStr: string): string {
  return addDaysYMD(dateStr, -7)
}

export function weekEndOf(dateStr: string): string {
  return addDaysYMD(dateStr, 6)
}

export function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── 집계 유틸 ────────────────────────────────────────────────────────────────

export function countItems(summaries: WeeklyReportSummary[], type: string): number {
  return summaries.reduce((sum, r) => sum + r.items.filter(it => it.type === type).length, 0)
}

export function buildDiffSummary(
  currItems: WeeklyReportItem[],
  prevItems: WeeklyReportItem[],
  droppedItems: WeeklyReportItem[],
): WeeklyDiffSummary {
  return {
    new:           currItems.filter(it => it.change === 'new').length,
    completed:     currItems.filter(it => it.change === 'completed').length,
    continued:     currItems.filter(it => it.change === 'continued').length,
    blocked:       currItems.filter(it => it.change === 'blocked').length,
    dropped:       droppedItems.length,
    dropped_items: droppedItems.length > 0 ? droppedItems : undefined,
  }
}

// ── Diff 매칭 로직 ───────────────────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '')
}

function matchKey(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const na = normalizeKey(a)
  const nb = normalizeKey(b)
  if (na === nb) return true
  return na.includes(nb) || nb.includes(na)
}

function tokenSet(s: string): Set<string> {
  const normalized = s.toLowerCase().replace(/[^\w가-힣\s]/g, ' ')
  return new Set(normalized.split(/\s+/).filter(t => t.length >= 2))
}

function tokenOverlap(a: string, b: string): number {
  const at = tokenSet(a)
  const bt = tokenSet(b)
  if (at.size === 0 || bt.size === 0) return 0
  let common = 0
  for (const t of at) if (bt.has(t)) common++
  return common / Math.min(at.size, bt.size)
}

function sameWeeklyItem(
  curr: Pick<WeeklyReportItem, 'type' | 'title' | 'detail' | 'brand'>,
  prev: Pick<WeeklyReportItem, 'type' | 'title' | 'detail' | 'brand'>,
): boolean {
  if (curr.type !== prev.type) return false

  const sameBrand  = matchKey(curr.brand, prev.brand)
  const sameTitle  = matchKey(curr.title, prev.title)
  const relatedText = tokenOverlap(
    `${curr.title} ${curr.detail}`,
    `${prev.title} ${prev.detail}`,
  ) >= 0.35

  if (sameBrand) return sameTitle || relatedText
  if (!curr.brand && !prev.brand) return sameTitle || relatedText
  return false
}

export function applyDiff(
  currItems: z.infer<typeof ExtractedItemSchema>[],
  prevItems: WeeklyReportItem[],
): WeeklyReportItem[] {
  return currItems.map(curr => {
    const matched = prevItems.find(prev => sameWeeklyItem(curr, prev))

    if (!matched) {
      return { ...curr, change: 'new' as const, prev_status: null, prev_title: null, block_reason: null }
    }

    const change = curr.status === 'completed' ? 'completed' as const
                 : curr.status === 'blocked'   ? 'blocked'   as const
                 : 'continued' as const

    return {
      ...curr,
      change,
      prev_status:  matched.status ?? null,
      prev_title:   matched.title !== curr.title ? matched.title : null,
      block_reason: null,
    }
  })
}

export function findDropped(
  currItems: z.infer<typeof ExtractedItemSchema>[],
  prevItems: WeeklyReportItem[],
): WeeklyReportItem[] {
  return prevItems
    .filter(prev => !currItems.some(curr => sameWeeklyItem(curr, prev)))
    .map(prev => ({
      ...prev,
      change: 'dropped' as const,
      detail: `전주 ${prev.status ?? '진행중'} 상태였으나 이번 주 언급 없음`,
    }))
}
