import type { HistoryItem, Priority, Tag } from '@/app/(app)/summary/_lib/types'
import { kstDate } from '@/lib/kst'

// 하위 호환 re-export — KST 기준은 @/lib/kst 단일 모듈로 일원화됨
export { kstDayStart, kstDayEnd } from '@/lib/kst'

/** UTC timestamp → KST 기준 `YYYY-MM-DD` */
export function toKSTDate(utc: string): string {
  return kstDate(utc)
}

export function matchesAllTags(itemTags: Tag[] | null | undefined, selectedTags: Iterable<Tag>): boolean {
  const tags = new Set(itemTags ?? [])
  for (const tag of selectedTags) {
    if (!tags.has(tag)) return false
  }
  return true
}

export function filterHistoryItems(
  items: HistoryItem[],
  filters: {
    dateFrom: string
    dateTo: string
    selectedTags: Set<Tag>
    brandId: string | 'all'
    priorityKey: Priority | 'all'
    authorKey: string | 'all'
    searchQuery: string
  },
): HistoryItem[] {
  const q = filters.searchQuery.trim().toLowerCase()
  return items
    .filter(item => {
      const ymd = toKSTDate(item.occurred_at)
      if (filters.dateFrom && ymd < filters.dateFrom) return false
      if (filters.dateTo && ymd > filters.dateTo) return false
      if (filters.selectedTags.size > 0 && !matchesAllTags(item.tags, filters.selectedTags)) return false
      if (filters.brandId !== 'all' && item.brand_name !== filters.brandId) return false
      if (filters.priorityKey !== 'all' && item.priority !== filters.priorityKey) return false
      if (filters.authorKey !== 'all' && item.author !== filters.authorKey) return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        (item.body ?? '').toLowerCase().includes(q) ||
        item.channel.toLowerCase().includes(q) ||
        (item.author ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
}
