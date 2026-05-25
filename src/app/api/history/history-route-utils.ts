import type { HistoryPageParams } from '@/lib/history-service'

export function parseHistoryTags(raw: string | null): string[] | undefined {
  const tags = raw
    ?.split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
  return tags && tags.length > 0 ? tags : undefined
}

export function parseHistoryLimit(raw: string | null): number | undefined {
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseHistoryPageParams(sp: URLSearchParams): HistoryPageParams {
  return {
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    brand: sp.get('brand') ?? undefined,
    priority: sp.get('priority') ?? undefined,
    tags: parseHistoryTags(sp.get('tags')),
    author: sp.get('author') ?? undefined,
    q: sp.get('q') ?? undefined,
    cursor: sp.get('cursor') ?? undefined,
    limit: parseHistoryLimit(sp.get('limit')),
  }
}
