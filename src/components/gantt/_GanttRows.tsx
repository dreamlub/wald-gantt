'use client'

import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { GanttProject, GanttStatus, Priority } from '@/types'
import { MS_PER_DAY } from '@/lib/gantt-utils'

// ── Layout constants ──────────────────────────────────────────
export const CAT_ROW_H  = 32
export const PROJ_ROW_H = 36

// hex strings required — stored to DB and compared against stored category.color values
export const CAT_COLORS = [
  '#818cf8', '#60a5fa', '#4ade80', '#facc15',  // --color-cat-{indigo,blue,green,yellow}
  '#fb923c', '#f87171', '#f472b6', '#c084fc',  // --color-cat-{orange,red,pink,purple}
  '#c7d2fe', '#bfdbfe', '#bbf7d0', '#fef08a',  // --color-cat-{indigo,blue,green,yellow}-light
  '#fed7aa', '#fecaca', '#fbcfe8', '#ddd6fe',  // --color-cat-{orange,red,pink,purple}-light
]

export const STATUS_META: Record<GanttStatus, { label: string; abbr: string; dot: string }> = {
  'to-do':       { label: 'To-Do',       abbr: 'T', dot: 'var(--task-status-todo)' },
  'in-progress': { label: 'In Progress', abbr: 'I', dot: 'var(--task-status-in-progress)' },
  'pending':     { label: 'Pending',     abbr: 'P', dot: 'var(--task-status-pending)' },
  'backlog':     { label: 'Backlog',     abbr: 'B', dot: 'var(--task-status-backlog)' },
  'done':        { label: 'Done',        abbr: 'D', dot: 'var(--task-status-done)' },
}

export const STATUS_ORDER: GanttStatus[] = ['backlog', 'to-do', 'in-progress', 'done', 'pending']

// ── Pure helpers ──────────────────────────────────────────────
export function randomCatColor(usedColors: Set<string>): string {
  const available = CAT_COLORS.filter(c => !usedColors.has(c))
  const pool = available.length > 0 ? available : CAT_COLORS
  return pool[Math.floor(Math.random() * pool.length)]
}

export function isProjectOverdue(p: GanttProject, todayStr: string): boolean {
  return !!p.end_date && p.status !== 'done' && p.end_date < todayStr
}

export function isStartDelayed(p: GanttProject, todayStr: string): boolean {
  return !!p.start_date && (p.status === 'to-do' || p.status === 'backlog') && p.start_date < todayStr
}

export function formatBarDate(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-')
  const [ey, em, ed] = end.split('-')
  const sLabel = `${parseInt(sm)}/${parseInt(sd)}`
  const eLabel = `${parseInt(em)}/${parseInt(ed)}`
  if (sy === ey) {
    if (sm === em) return `${sLabel} ~ ${parseInt(ed)}`
    return `${sLabel} ~ ${eLabel}`
  }
  return `${sy.slice(2)}.${sLabel} ~ ${ey.slice(2)}.${eLabel}`
}

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

// 드래그 툴팁 전용 — M/D(요일) 형식
export function formatBarDateWithDow(start: string, end: string): string {
  const sDow = DOW_KO[new Date(start + 'T00:00:00').getDay()]
  const eDow = DOW_KO[new Date(end   + 'T00:00:00').getDay()]
  const [sy, sm, sd] = start.split('-')
  const [ey, em, ed] = end.split('-')
  const sLabel = `${parseInt(sm)}/${parseInt(sd)}(${sDow})`
  const eDay   = parseInt(ed)
  if (sy === ey) {
    if (sm === em) return `${sLabel} ~ ${eDay}(${eDow})`
    return `${sLabel} ~ ${parseInt(em)}/${eDay}(${eDow})`
  }
  return `${sy.slice(2)}.${parseInt(sm)}/${parseInt(sd)}(${sDow}) ~ ${ey.slice(2)}.${parseInt(em)}/${eDay}(${eDow})`
}

export function daysBetween(fromDate: string, toDateStr: string): number {
  const from = new Date(fromDate + 'T00:00:00')
  const to   = new Date(toDateStr + 'T00:00:00')
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY))
}

// ── Priority → bar opacity ───────────────────────────────────
export function barOpacity(priority: Priority | null): string {
  switch (priority) {
    case 3:  return 'dd'   // 높음 — 진하게
    case 2:  return 'bb'   // 보통
    case 1:  return '88'   // 낮음 — 연하게
    default: return 'bb'   // 없음 — 기본
  }
}

// ── Sortable row shells ───────────────────────────────────────
export function SortableProjRow({ id, disabled, children }: {
  id: string
  disabled?: boolean
  children: (props: { listeners: ReturnType<typeof useSortable>['listeners']; isDragging: boolean }) => ReactNode
}) {
  // animateLayoutChanges: () => false — 정렬 모드/필터 변경 시 useDerivedTransform이
  // LEFT 패널에만 임시 transform을 적용해 RIGHT 패널과 한 프레임 틀어지는 문제 방지
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
    >
      {children({ listeners, isDragging })}
    </div>
  )
}

export function SortableCatRow({ id, disabled, children }: {
  id: string
  disabled?: boolean
  children: (props: { listeners: ReturnType<typeof useSortable>['listeners']; isDragging: boolean }) => ReactNode
}) {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
      {...attributes}
    >
      {children({ listeners, isDragging })}
    </div>
  )
}

// ── Component re-exports (extracted to keep this file < 500 lines) ──
export { GanttCategoryLeft } from './_GanttCategoryLeft'
export { GanttCategoryRight } from './_GanttCategoryRight'
