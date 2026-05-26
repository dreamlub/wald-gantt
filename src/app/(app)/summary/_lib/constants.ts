import type { Tag, Priority } from './types'

// 태그 메타 — 시각화용
export const TAG_META: Record<Tag, { label: string; emoji: string; bg: string; color: string; dot: string }> = {
  'issue':       { label: '이슈',      emoji: '🔴', bg: 'var(--color-tag-issue-dot)',     color: 'var(--color-tag-vivid-text)',     dot: 'var(--color-tag-issue-dot)' },
  'decision':    { label: '의사결정',  emoji: '🟡', bg: 'var(--color-tag-decision-dot)',  color: 'var(--color-ink-800)',            dot: 'var(--color-tag-decision-dot)' },
  'mention':     { label: '나를 멘션', emoji: '🔵', bg: 'var(--color-tag-mention-dot)',   color: 'var(--color-tag-vivid-text)',     dot: 'var(--color-tag-mention-dot)' },
  'schedule':    { label: '일정수립',  emoji: '📅', bg: 'var(--color-tag-schedule-dot)',  color: 'var(--color-tag-vivid-text)',     dot: 'var(--color-tag-schedule-dot)' },
}

export const TAG_KEYS: Tag[] = ['issue', 'decision', 'mention', 'schedule']

export const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string }> = {
  high:   { label: '높음', color: 'var(--color-status-late)',   bg: 'var(--color-priority-high-bg)' },
  medium: { label: '보통', color: 'var(--color-status-warn)',   bg: 'var(--color-priority-medium-bg)' },
  low:    { label: '낮음', color: 'var(--color-status-future)', bg: 'var(--color-priority-low-bg)' },
}

export const PRIORITY_KEYS: Priority[] = ['high', 'medium', 'low']

export function fmtMonthDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function fmtMonth(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}
