import type { Tag, Priority } from './types'

// 태그 메타 — 시각화용
export const TAG_META: Record<Tag, { label: string; emoji: string; bg: string; color: string; dot: string }> = {
  'issue':       { label: '이슈',     emoji: '🔴', bg: '#fee2e2', color: '#dc2626', dot: '#ef4444' },
  'decision':    { label: '의사결정', emoji: '🟡', bg: '#fef3c7', color: '#d97706', dot: '#f59e0b' },
  'mention':     { label: '나를 멘션', emoji: '🔵', bg: '#dbeafe', color: '#2563eb', dot: '#3b82f6' },
  'in_progress': { label: '진행중',   emoji: '🟢', bg: '#d1fae5', color: '#059669', dot: '#10b981' },
  'done':        { label: '진행완료', emoji: '✅', bg: '#e0e7ff', color: '#4338ca', dot: '#6366f1' },
  'schedule':    { label: '일정수립', emoji: '📅', bg: '#fce7f3', color: '#db2777', dot: '#ec4899' },
}

export const TAG_KEYS: Tag[] = ['issue', 'decision', 'mention', 'in_progress', 'done', 'schedule']

export const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string }> = {
  high:   { label: '높음', color: 'var(--color-status-late)',   bg: '#fee2e2' },
  medium: { label: '보통', color: 'var(--color-status-warn)',   bg: '#fef3c7' },
  low:    { label: '낮음', color: 'var(--color-status-future)', bg: '#dbeafe' },
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
