import { useRef, useEffect } from 'react'
import { buildWeekRange, buildDayRange, monthOffset } from '@/lib/gantt-utils'
import { COL_WIDTH, WEEK_COL_WIDTH, DAY_COL_WIDTH, type ViewMode } from './_GanttConstants'

export function useGanttScroll(viewMode: ViewMode, viewStart: string, viewEnd: string) {
  const leftRef         = useRef<HTMLDivElement>(null)
  const leftPanelRef    = useRef<HTMLDivElement>(null)
  const rightRef        = useRef<HTMLDivElement>(null)
  const headerRef       = useRef<HTMLDivElement>(null)
  const stickyScrollRef = useRef<HTMLDivElement>(null)

  // 스크롤 동기화
  function onRightScroll() {
    if (leftRef.current && rightRef.current)
      leftRef.current.scrollTop = rightRef.current.scrollTop
    if (headerRef.current && rightRef.current)
      headerRef.current.scrollLeft = rightRef.current.scrollLeft
    if (stickyScrollRef.current && rightRef.current)
      stickyScrollRef.current.scrollLeft = rightRef.current.scrollLeft
  }

  function onStickyScroll() {
    if (rightRef.current && stickyScrollRef.current)
      rightRef.current.scrollLeft = stickyScrollRef.current.scrollLeft
    if (headerRef.current && stickyScrollRef.current)
      headerRef.current.scrollLeft = stickyScrollRef.current.scrollLeft
  }

  // 왼쪽 패널 휠: non-passive 리스너로 등록해야 preventDefault 가능
  useEffect(() => {
    const el = leftPanelRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      if (!rightRef.current) return
      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 16
      else if (e.deltaMode === 2) dy *= rightRef.current.clientHeight
      rightRef.current.scrollTop += dy
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // 뷰 모드 변경 시 today로 스크롤
  useEffect(() => {
    if (!rightRef.current) return
    const cw = viewMode === 'week' ? WEEK_COL_WIDTH : viewMode === 'day' ? DAY_COL_WIDTH : COL_WIDTH
    const now = new Date()
    let scrollX = 0
    if (viewMode === 'month') {
      scrollX = Math.max(0, monthOffset(viewStart, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`) * cw - 200)
    } else if (viewMode === 'week') {
      const ws = buildWeekRange(viewStart, viewEnd)
      const idx = ws.findIndex(w => { const e = new Date(w.weekStart); e.setDate(e.getDate() + 7); return now >= w.weekStart && now < e })
      scrollX = idx >= 0 ? Math.max(0, idx * cw - 200) : 0
    } else {
      const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const ds = buildDayRange(viewStart, viewEnd)
      const idx = ds.findIndex(d => d.key === nowStr)
      scrollX = idx >= 0 ? Math.max(0, idx * cw - 200) : 0
    }
    rightRef.current.scrollLeft = scrollX
    if (headerRef.current) headerRef.current.scrollLeft = scrollX
  }, [viewMode, viewStart, viewEnd])

  return {
    leftRef, leftPanelRef, rightRef, headerRef, stickyScrollRef,
    onRightScroll, onStickyScroll,
  }
}
