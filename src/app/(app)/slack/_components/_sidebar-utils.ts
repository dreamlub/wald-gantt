import type { Priority } from '../_lib/types'

export type PriorityKey = 'all' | Priority

export function getMondayOfDate(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getWeekLabel(monday: Date): string {
  const month = monday.getMonth()
  const dow = new Date(monday.getFullYear(), month, 1).getDay()
  const firstMondayDate = 1 + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow)
  const weekNum = Math.floor((monday.getDate() - firstMondayDate) / 7) + 1
  return `${month + 1}월 ${weekNum}주`
}

export function getWeekDateRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${monday.getMonth() + 1}/${monday.getDate()} ~ ${sunday.getMonth() + 1}/${sunday.getDate()}`
}

export function getCurrentWeekStart(): string {
  return dateStr(getMondayOfDate(new Date()))
}

export function isCurrentWeek(weekStart: string): boolean {
  return weekStart === getCurrentWeekStart()
}
