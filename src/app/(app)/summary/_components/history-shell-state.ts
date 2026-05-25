import type { HistoryItem, Tag } from '../_lib/types'
import type { PriorityKey } from './history-sidebar'
import type { HistoryPage } from '@/lib/history-service'

export interface PageState {
  items: HistoryItem[]
  cursor: string | null
  total: number
  loading: boolean
  hasMore: boolean
  brandCounts: Record<string, number>
}

export type PageAction =
  | { type: 'reset' }
  | { type: 'loading' }
  | { type: 'loaded'; page: HistoryPage; append: boolean }

export function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'reset': return { items: [], cursor: null, total: 0, loading: true, hasMore: false, brandCounts: {} }
    case 'loading': return { ...state, loading: true }
    case 'loaded': return {
      items: action.append ? [...state.items, ...action.page.items] : action.page.items,
      cursor: action.page.nextCursor,
      total: action.page.total,
      loading: false,
      hasMore: !!action.page.nextCursor,
      brandCounts: action.append ? state.brandCounts : (action.page.brandCounts ?? {}),
    }
  }
}

export const PAGE_INIT: PageState = { items: [], cursor: null, total: 0, loading: true, hasMore: false, brandCounts: {} }

export type ViewKey = 'dailylist' | 'weeklylist' | 'dailyreport' | 'summary' | 'rawdata' | 'timeline' | 'calendar'

export const VALID_VIEWS: readonly ViewKey[] = ['dailylist', 'weeklylist', 'dailyreport', 'summary', 'rawdata', 'timeline', 'calendar']
export const VALID_PRIORITIES: readonly PriorityKey[] = ['all', 'high', 'medium', 'low']
export const VALID_TAGS: readonly Tag[] = ['issue', 'decision', 'mention', 'schedule']

export function parseView(v: string | null): ViewKey {
  return VALID_VIEWS.includes(v as ViewKey) ? (v as ViewKey) : 'dailyreport'
}

export function parsePriority(v: string | null): PriorityKey {
  return VALID_PRIORITIES.includes(v as PriorityKey) ? (v as PriorityKey) : 'all'
}

export function parseTags(v: string | null): Set<Tag> {
  if (!v) return new Set()
  return new Set(v.split(',').filter((t): t is Tag => VALID_TAGS.includes(t as Tag)))
}

export function presetDates(preset: 'today' | 'week' | 'month' | 'all'): { from: string; to: string } {
  const now = new Date()
  function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const today = fmt(now)
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'week') {
    const week = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    return { from: fmt(week), to: today }
  }
  if (preset === 'month') {
    const month = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    return { from: fmt(month), to: today }
  }
  return { from: '', to: '' }
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
