import { useState, useCallback } from 'react'
import type { GanttProject } from '@/types'
import type { DayInfo } from '@/lib/gantt-utils'
import {
  buildWeekRange, buildDayRange, dayOffset, dayOffsetInWeeks, colFracToDate,
} from '@/lib/gantt-utils'
import { formatBarDate } from './_GanttRows'
import {
  COL_WIDTH, WEEK_COL_WIDTH, DAY_COL_WIDTH, AVG_DAYS_PER_MONTH,
  type ViewMode,
} from './_GanttConstants'

interface BarDragState {
  cursor: string
  tooltipText: string
  x: number
  y: number
}

interface UseBarDragOptions {
  viewMode: ViewMode
  viewStart: string
  viewEnd: string
  totalCols: number
  onUpdateProjectDates: (id: string, startMonth: string, endMonth: string) => Promise<void>
}

export function useBarDrag({
  viewMode, viewStart, viewEnd, totalCols, onUpdateProjectDates,
}: UseBarDragOptions) {
  const [barDrag, setBarDrag] = useState<BarDragState | null>(null)

  const makeDragHandlers = useCallback((p: GanttProject, dragType: 'move' | 'resize-left' | 'resize-right') => {
    return (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (!p.start_date || !p.end_date) return

      const cw = viewMode === 'week' ? WEEK_COL_WIDTH : viewMode === 'day' ? DAY_COL_WIDTH : COL_WIDTH
      const ws = viewMode === 'week' ? buildWeekRange(viewStart, viewEnd) : []
      const ds = viewMode === 'day'  ? buildDayRange(viewStart, viewEnd)  : ([] as DayInfo[])

      const snapDays   = viewMode === 'month' ? 7 : 1
      const pxPerSnap  = viewMode === 'month' ? cw / AVG_DAYS_PER_MONTH * 7
                       : viewMode === 'week'  ? cw / 7
                       : cw

      const origStartDate = new Date(p.start_date + 'T00:00:00')
      const origEndDate   = new Date(p.end_date   + 'T00:00:00')

      let origColStart = ds.findIndex(d => d.key === p.start_date); if (origColStart < 0) origColStart = 0
      let origColEnd   = ds.findIndex(d => d.key === p.end_date);   if (origColEnd < 0) origColEnd = 0

      const startX = e.clientX
      let snapDelta = 0
      let previewColStart = origColStart, previewColEnd = origColEnd

      const cursor = dragType === 'move' ? 'grabbing' : 'ew-resize'
      setBarDrag({ cursor, tooltipText: '', x: 0, y: 0 })

      const barEl = (e.currentTarget as HTMLElement).closest('[data-bar-id]') as HTMLElement | null
      const metaEl = barEl?.parentElement?.querySelector(`[data-bar-meta-id="${p.id}"]`) as HTMLElement | null

      function shift(date: Date, d: number): Date { const r = new Date(date); r.setDate(r.getDate() + d); return r }
      function fmt(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
      function barPx(sd: Date, ed: Date): { left: number; width: number } {
        if (viewMode === 'month') {
          const s = dayOffset(viewStart, fmt(sd), 'start'), e = dayOffset(viewStart, fmt(ed), 'end')
          return { left: s * cw + 4, width: Math.max(4, (e - s) * cw - 8) }
        }
        const s = dayOffsetInWeeks(ws, fmt(sd), 'start'), e = dayOffsetInWeeks(ws, fmt(ed), 'end')
        return { left: s * cw + 4, width: Math.max(4, (e - s) * cw - 8) }
      }

      function onMouseMove(me: MouseEvent) {
        const raw = me.clientX - startX
        let tooltipText = ''
        if (viewMode === 'day') {
          const delta = Math.round(raw / cw)
          if (dragType === 'move') {
            previewColStart = Math.max(0, Math.min(origColStart + delta, totalCols - 1))
            const span = origColEnd - origColStart
            previewColEnd = Math.min(previewColStart + span, totalCols - 1)
            if (previewColEnd === totalCols - 1) previewColStart = previewColEnd - span
          } else if (dragType === 'resize-left') {
            previewColStart = Math.max(0, Math.min(origColStart + delta, origColEnd)); previewColEnd = origColEnd
          } else {
            previewColStart = origColStart; previewColEnd = Math.max(origColStart, Math.min(origColEnd + delta, totalCols - 1))
          }
          if (barEl) { barEl.style.left = `${previewColStart * cw + 4}px`; barEl.style.width = `${(previewColEnd - previewColStart + 1) * cw - 8}px` }
          if (metaEl) { metaEl.style.left = `${(previewColEnd + 1) * cw + 12}px` }
          const sk = ds[Math.max(0, Math.min(previewColStart, ds.length-1))].key
          const ek = ds[Math.max(0, Math.min(previewColEnd,   ds.length-1))].key
          tooltipText = formatBarDate(sk, ek)
        } else {
          snapDelta = Math.round(raw / pxPerSnap)
          const d = snapDelta * snapDays
          let ns = origStartDate, ne = origEndDate
          if (dragType === 'move')         { ns = shift(origStartDate, d);  ne = shift(origEndDate, d) }
          else if (dragType === 'resize-left') { ns = shift(origStartDate, d);  if (ns > origEndDate)   ns = origEndDate }
          else                             { ne = shift(origEndDate, d);    if (ne < origStartDate) ne = origStartDate }
          if (barEl) { const px = barPx(ns, ne); barEl.style.left = `${px.left}px`; barEl.style.width = `${px.width}px` }
          if (metaEl) { const px = barPx(ns, ne); metaEl.style.left = `${px.left + px.width + 16}px` }
          tooltipText = formatBarDate(fmt(ns), fmt(ne))
        }
        setBarDrag({ cursor, tooltipText, x: me.clientX, y: me.clientY })
      }

      async function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        setBarDrag(null)
        if (viewMode === 'day') {
          if (previewColStart !== origColStart || previewColEnd !== origColEnd)
            await onUpdateProjectDates(p.id, ds[Math.max(0, Math.min(previewColStart, ds.length-1))].key, ds[Math.max(0, Math.min(previewColEnd, ds.length-1))].key)
        } else if (snapDelta !== 0) {
          const d = snapDelta * snapDays
          let ns = origStartDate, ne = origEndDate
          if (dragType === 'move')             { ns = shift(origStartDate, d);  ne = shift(origEndDate, d) }
          else if (dragType === 'resize-left') { ns = shift(origStartDate, d);  if (ns > origEndDate)   ns = origEndDate }
          else                                 { ne = shift(origEndDate, d);    if (ne < origStartDate) ne = origStartDate }
          await onUpdateProjectDates(p.id, fmt(ns), fmt(ne))
        }
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
  }, [viewStart, viewEnd, viewMode, totalCols, onUpdateProjectDates])

  return { barDrag, makeDragHandlers }
}

/** 열 인덱스 → YYYY-MM-DD 날짜 문자열 */
export function colIndexToDate(
  viewMode: ViewMode, totalCols: number, viewStart: string,
  days: DayInfo[], weeks: { weekStart: Date }[],
  colIndex: number,
): string {
  const idx = Math.max(0, Math.min(colIndex, totalCols - 1))
  if (viewMode === 'day') return days[idx]?.key ?? ''
  if (viewMode === 'week') {
    const ws = weeks[idx]?.weekStart
    if (!ws) return ''
    return `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`
  }
  return colFracToDate(viewStart, idx)
}
