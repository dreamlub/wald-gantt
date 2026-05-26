'use client'

import { useState, useRef } from 'react'
import { CornerDownRight, StickyNote } from 'lucide-react'
import {
  buildWeekRange, dayOffsetInWeeks, formatYearMonth, todayStrKST,
  type WeekInfo,
} from '@/lib/gantt-utils'
import type { GanttTask } from '@/types'
import { STATUS_COLOR, PriorityBars } from '../_constants'
import { isOverdue, isStartDelayed, clampTooltipPos } from '../_utils'

interface Props {
  tasks: GanttTask[]
  onEdit: (t: GanttTask) => void
  onDateChange?: (id: string, start_date: string | null, due_date: string | null) => void
}

const WEEK_W   = 36   // px per week column
const LEFT_W_DEFAULT = 300
const LEFT_W_MIN     = 120
const LEFT_W_MAX     = 560
const YEAR_H   = 26
const MONTH_H  = 24
const WEEK_H   = 22
const ROW_H    = 36

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** "YYYY-MM-DD" → "YYYY-MM" */
function toYM(dateStr: string) { return dateStr.slice(0, 7) }

/** 날짜 기준으로 뷰 범위(월) 계산: 패딩 1개월 추가 */
function calcViewRange(dates: string[]): { startYM: string; endYM: string } {
  const sorted = [...dates].sort()
  const minYM  = toYM(sorted[0])
  const maxYM  = toYM(sorted[sorted.length - 1])

  const [sy, sm] = minYM.split('-').map(Number)
  const [ey, em] = maxYM.split('-').map(Number)

  const pad = (y: number, m: number) =>
    `${y}-${String(m).padStart(2, '0')}`

  const startM = sm - 1 < 1  ? 12 : sm - 1
  const startY = sm - 1 < 1  ? sy - 1 : sy
  const endM   = em + 1 > 12 ? 1  : em + 1
  const endY   = em + 1 > 12 ? ey + 1 : ey

  return { startYM: pad(startY, startM), endYM: pad(endY, endM) }
}

/** weeks 배열에서 연도별 그룹 */
function yearGroups(weeks: WeekInfo[]) {
  const groups: { year: number; count: number }[] = []
  for (const w of weeks) {
    if (!groups.length || groups[groups.length - 1].year !== w.year)
      groups.push({ year: w.year, count: 1 })
    else groups[groups.length - 1].count++
  }
  return groups
}

/** weeks 배열에서 월별 그룹 */
function monthGroups(weeks: WeekInfo[]) {
  const groups: { ym: string; label: string; count: number }[] = []
  for (const w of weeks) {
    const ym = formatYearMonth(w.year, w.month)
    if (!groups.length || groups[groups.length - 1].ym !== ym)
      groups.push({ ym, label: `${w.month}월`, count: 1 })
    else groups[groups.length - 1].count++
  }
  return groups
}

// 부모-자식 정렬: 부모 다음에 그 부모의 sub들이 따라오도록 (부모가 같은 목록에 있을 때만)
function reorderWithSubs(arr: GanttTask[]): { task: GanttTask; isSub: boolean }[] {
  const map = new Map(arr.map(t => [t.id, t]))
  const subsByParent = new Map<string, GanttTask[]>()
  for (const t of arr) {
    if (t.parent_id && map.has(t.parent_id)) {
      const list = subsByParent.get(t.parent_id) ?? []
      list.push(t); subsByParent.set(t.parent_id, list)
    }
  }
  const out: { task: GanttTask; isSub: boolean }[] = []
  const inserted = new Set<string>()
  for (const t of arr) {
    if (inserted.has(t.id)) continue
    if (t.parent_id && map.has(t.parent_id)) continue
    out.push({ task: t, isSub: false }); inserted.add(t.id)
    for (const sub of subsByParent.get(t.id) ?? []) {
      out.push({ task: sub, isSub: true }); inserted.add(sub.id)
    }
  }
  return out
}

// 시작일 → 마감일 → sort_order 순 오름차순
function gantSortCompare(a: GanttTask, b: GanttTask): number {
  const FAR = '9999-12-31'
  const aPrimary = a.start_date ?? a.due_date ?? FAR
  const bPrimary = b.start_date ?? b.due_date ?? FAR
  if (aPrimary !== bPrimary) return aPrimary < bPrimary ? -1 : 1
  const aSecondary = a.due_date ?? FAR
  const bSecondary = b.due_date ?? FAR
  if (aSecondary !== bSecondary) return aSecondary < bSecondary ? -1 : 1
  return (a.sort_order ?? 0) - (b.sort_order ?? 0)
}

export function GanttView({ tasks, onEdit, onDateChange }: Props) {
  const [leftWidth, setLeftWidth] = useState(LEFT_W_DEFAULT)
  const [memoHover, setMemoHover] = useState<{ taskId: string; x: number; y: number } | null>(null)
  const [localDates, setLocalDates] = useState<Map<string, { start_date: string | null; due_date: string | null }>>(new Map())
  const draggedRef = useRef(false)
  const LEFT_W = leftWidth

  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = leftWidth
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      setLeftWidth(Math.max(LEFT_W_MIN, Math.min(LEFT_W_MAX, startW + dx)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function onBarMouseDown(
    task: GanttTask,
    mode: 'move' | 'resize-start' | 'resize-end',
    e: React.MouseEvent,
  ) {
    if (!onDateChange) return
    e.preventDefault()
    e.stopPropagation()
    draggedRef.current = false
    const startX = e.clientX
    const origStart = task.start_date
    const origEnd   = task.due_date
    let current = { start_date: origStart, due_date: origEnd }

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      if (Math.abs(dx) > 3) draggedRef.current = true
      const days = Math.round(dx * 7 / WEEK_W)
      let ns = origStart
      let ne = origEnd
      if (mode === 'move') {
        if (ns) ns = addDays(ns, days)
        if (ne) ne = addDays(ne, days)
      } else if (mode === 'resize-start' && ns) {
        ns = addDays(ns, days)
        if (ne && ns > ne) ns = ne
      } else if (mode === 'resize-end' && ne) {
        ne = addDays(ne, days)
        if (ns && ne < ns) ne = ns
      }
      current = { start_date: ns, due_date: ne }
      setLocalDates(prev => new Map(prev).set(task.id, current))
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (draggedRef.current && onDateChange) {
        onDateChange(task.id, current.start_date, current.due_date)
      }
      setLocalDates(prev => { const n = new Map(prev); n.delete(task.id); return n })
    }

    // eslint-disable-next-line react-hooks/immutability
    document.body.style.userSelect = 'none'
    // eslint-disable-next-line react-hooks/immutability
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const datedTasks   = tasks.filter(t => t.start_date || t.due_date).sort(gantSortCompare)
  const undatedTasks = tasks.filter(t => !t.start_date && !t.due_date)
  const datedRows    = reorderWithSubs(datedTasks)

  // 날짜 없는 태스크만 있으면 안내
  if (datedTasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-ink-400 gap-2">
        <span className="text-sm">시작일 또는 마감일이 설정된 태스크가 없어요</span>
        {undatedTasks.length > 0 && (
          <span className="text-sm text-ink-300">{undatedTasks.length}개 태스크에 날짜를 설정해 보세요</span>
        )}
      </div>
    )
  }

  const allDates = datedTasks.flatMap(t =>
    [t.start_date, t.due_date].filter(Boolean) as string[]
  )
  const { startYM, endYM } = calcViewRange(allDates)
  const weeks = buildWeekRange(startYM, endYM)

  const yGroups = yearGroups(weeks)
  const mGroups = monthGroups(weeks)

  const totalWidth = weeks.length * WEEK_W

  // 오늘 위치
  const todayStr = todayStrKST()
  const todayFrac = dayOffsetInWeeks(weeks, todayStr, 'start')
  const todayX = todayFrac * WEEK_W

  const headerH = YEAR_H + MONTH_H + WEEK_H

  return (
    <div className="flex-1 overflow-auto bg-card">
      <div className="relative" style={{ minWidth: LEFT_W + totalWidth }}>

        {/* 좌측 컬럼 리사이즈 핸들 — 전체 높이 */}
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 w-1 h-full cursor-col-resize hover:bg-lilac-300 active:bg-lilac-400 transition-colors z-30"
          style={{ left: LEFT_W - 2 }}
          title="드래그해서 폭 조절"
        />

        {/* ── 헤더 ── */}
        <div className="flex sticky top-0 z-20 bg-card border-b shadow-sm select-none">
          {/* 좌측 고정 */}
          <div className="shrink-0 sticky left-0 z-10 border-r bg-muted" style={{ width: LEFT_W, height: headerH }} />

          {/* 날짜 헤더 영역 */}
          <div className="flex flex-col" style={{ width: totalWidth }}>
            {/* 연도 행 */}
            <div className="flex border-b" style={{ height: YEAR_H }}>
              {yGroups.map((g, i) => (
                <div
                  key={i}
                  className="shrink-0 flex items-center px-2 text-2xs font-bold text-muted-foreground border-r bg-muted"
                  style={{ width: g.count * WEEK_W }}
                >
                  {g.year}
                </div>
              ))}
            </div>

            {/* 월 행 */}
            <div className="flex border-b" style={{ height: MONTH_H }}>
              {mGroups.map((g, i) => (
                <div
                  key={i}
                  className="shrink-0 flex items-center px-1.5 text-2xs font-semibold text-muted-foreground border-r bg-card whitespace-nowrap overflow-hidden"
                  style={{ width: g.count * WEEK_W }}
                >
                  {g.label}
                </div>
              ))}
            </div>

            {/* 주 행 */}
            <div className="flex" style={{ height: WEEK_H }}>
              {weeks.map((w, i) => {
                const ws  = w.weekStart
                const lbl = `${ws.getDate()}`
                const isToday = todayFrac >= i && todayFrac < i + 1
                return (
                  <div
                    key={w.key}
                    className={`shrink-0 flex items-center justify-center text-xs border-r
                      ${isToday ? 'bg-accent text-accent-foreground font-semibold' : 'text-ink-400'}`}
                    style={{ width: WEEK_W }}
                  >
                    {lbl}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── 태스크 행 ── */}
        {datedRows.map(({ task, isSub }) => {
          const isDone   = task.status === 'done'
          const overdue  = isOverdue(task.due_date, task.status)
          const startDelayed = !overdue && isStartDelayed(task.start_date, task.status)
          const statusColor = STATUS_COLOR[task.status]
          // Schedule(GanttChart) 동일 패턴: 73% 알파 배경 + 솔리드 보더
          const borderC   = overdue ? 'var(--color-status-late)' : startDelayed ? 'var(--color-status-warn)' : statusColor
          const barBg     = `color-mix(in srgb, ${borderC} 73%, transparent)`
          const barBorder = borderC

          return (
            <div
              key={task.id}
              className={`flex border-b hover:bg-muted group ${isDone ? 'opacity-55' : ''} ${isSub ? 'bg-muted/40' : 'bg-card'}`}
              style={{ height: ROW_H }}
            >
              {/* 태스크 이름 */}
              <div
                className="shrink-0 sticky left-0 z-10 flex items-center gap-1.5 px-3 border-r bg-inherit"
                style={{ width: LEFT_W }}
              >
                {isSub && <CornerDownRight size={11} className="text-ink-300 shrink-0" />}
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                <button
                  onClick={() => onEdit(task)}
                  className={`text-xs truncate hover:text-accent-foreground transition-colors text-left ${isDone ? 'line-through font-medium text-ink-400' : 'text-foreground'}`}
                  title={task.title}
                >
                  {task.title}
                </button>
                {(task.priority ?? 0) > 0 && <PriorityBars priority={task.priority} />}
                {task.memo && (
                  <StickyNote
                    size={10}
                    className="text-lilac-400 shrink-0"
                    onMouseEnter={(e) => setMemoHover({ taskId: task.id, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setMemoHover(null)}
                  />
                )}
              </div>

              {/* 간트 영역 */}
              <div className="relative flex-1" style={{ height: ROW_H }}>
                {/* 주 구분선 */}
                {weeks.map((_, i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 border-r border-border"
                    style={{ left: i * WEEK_W }}
                  />
                ))}

                {/* 오늘 선 */}
                {todayX >= 0 && todayX <= totalWidth && (
                  <div
                    className="absolute inset-y-0 w-px bg-lilac-400 opacity-70 z-10"
                    style={{ left: todayX }}
                  />
                )}

                {/* 바 */}
                {(() => {
                  const effStart = localDates.get(task.id)?.start_date ?? task.start_date
                  const effEnd   = localDates.get(task.id)?.due_date   ?? task.due_date
                  const esx = effStart ? dayOffsetInWeeks(weeks, effStart, 'start') * WEEK_W : null
                  const eex = effEnd   ? dayOffsetInWeeks(weeks, effEnd,   'end')   * WEEK_W : null
                  const eBarLeft  = esx ?? eex ?? 0
                  const eBarRight = eex ?? esx ?? WEEK_W
                  const eBarWidth = Math.max(eBarRight - eBarLeft, WEEK_W * 0.4)

                  const fmt = (d: string) => {
                    const [, m, day] = d.split('-').map(Number)
                    return `${m}/${day}`
                  }
                  const fmtRange = (s: string, e: string) => {
                    const [, sm, sd] = s.split('-').map(Number)
                    const [, em, ed] = e.split('-').map(Number)
                    if (sm === em) return `${sm}/${sd} ~ ${ed}`
                    return `${sm}/${sd} ~ ${em}/${ed}`
                  }
                  const label = effStart && effEnd && effStart !== effEnd
                    ? fmtRange(effStart, effEnd)
                    : effStart ? fmt(effStart) : effEnd ? fmt(effEnd) : ''
                  const showFull  = eBarWidth >= 100
                  const showShort = eBarWidth >= 52
                  const displayLabel = showFull
                    ? label
                    : showShort ? (effStart ? fmt(effStart) : effEnd ? fmt(effEnd) : '') : ''

                  const titleTip = `${task.title}${overdue ? '\n⚠ 마감 초과' : ''}${effStart ? `\n시작: ${effStart}` : ''}${effEnd ? `\n마감: ${effEnd}` : ''}`
                  const HANDLE_W = 7

                  return (
                    <>
                      <div
                        className="absolute top-2 select-none"
                        style={{ left: eBarLeft, width: eBarWidth, height: ROW_H - 16 }}
                      >
                        {/* 바 배경 */}
                        <div
                          className="absolute inset-0 rounded pointer-events-none"
                          style={{ backgroundColor: barBg, border: `1.5px solid ${barBorder}` }}
                        />
                        {/* 왼쪽 리사이즈 핸들 (start_date 있을 때만) */}
                        {effStart && onDateChange && (
                          <div
                            className="absolute left-0 top-0 bottom-0 z-10 cursor-ew-resize rounded-l hover:bg-white/20"
                            style={{ width: HANDLE_W }}
                            onMouseDown={e => onBarMouseDown(task, 'resize-start', e)}
                          />
                        )}
                        {/* 오른쪽 리사이즈 핸들 (due_date 있을 때만) */}
                        {effEnd && onDateChange && (
                          <div
                            className="absolute right-0 top-0 bottom-0 z-10 cursor-ew-resize rounded-r hover:bg-white/20"
                            style={{ width: HANDLE_W }}
                            onMouseDown={e => onBarMouseDown(task, 'resize-end', e)}
                          />
                        )}
                        {/* 중앙 — 이동 드래그 + 클릭 편집 */}
                        <div
                          className={`absolute inset-0 flex items-center overflow-hidden z-0 ${onDateChange ? 'cursor-grab hover:opacity-90' : 'cursor-pointer hover:opacity-80'} transition-opacity`}
                          style={{ paddingLeft: effStart && onDateChange ? HANDLE_W + 2 : 5, paddingRight: effEnd && onDateChange ? HANDLE_W + 2 : 4 }}
                          onMouseDown={onDateChange ? e => onBarMouseDown(task, 'move', e) : undefined}
                          onClick={() => { if (!draggedRef.current) onEdit(task) }}
                          title={titleTip}
                        >
                          {displayLabel && (
                            <span
                              className="text-xs font-medium truncate leading-none whitespace-nowrap"
                              style={{ color: 'white', textShadow: '0 0 3px rgba(0,0,0,0.3)' }}
                            >
                              {displayLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {!showShort && label && (
                        <div
                          className="absolute top-2 flex items-center pointer-events-none"
                          style={{ left: eBarLeft + eBarWidth + 4, height: ROW_H - 16 }}
                        >
                          <span className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded whitespace-nowrap ${overdue ? 'text-status-late' : 'text-muted-foreground'}`}>
                            {label}
                          </span>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          )
        })}

        {/* ── 날짜 없는 태스크 ── */}
        {undatedTasks.length > 0 && (
          <>
            <div className="sticky left-0 z-10 px-3 py-1.5 text-sm font-semibold text-ink-400 uppercase bg-muted border-b tracking-wider" style={{ width: LEFT_W }}>
              날짜 미설정 — {undatedTasks.length}개
            </div>
            {undatedTasks.map(task => {
              const isDone = task.status === 'done'
              return (
                <div
                  key={task.id}
                  className={`flex border-b hover:bg-muted bg-card ${isDone ? 'opacity-55' : ''}`}
                  style={{ height: ROW_H }}
                >
                  <div className="shrink-0 sticky left-0 z-10 flex items-center gap-1.5 px-3 border-r bg-inherit" style={{ width: LEFT_W }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[task.status] }} />
                    <button
                      onClick={() => onEdit(task)}
                      className={`text-xs truncate hover:text-accent-foreground transition-colors text-left ${
                        isDone ? 'line-through font-medium text-ink-400' :
                        task.priority === 3 ? 'font-semibold text-rose-500' :
                        task.priority === 2 ? 'font-medium text-foreground' :
                        task.priority === 1 ? 'font-normal text-muted-foreground' :
                        'font-normal text-ink-400'
                      }`}
                    >
                      {task.title}
                    </button>
                    {task.memo && (
                      <StickyNote
                        size={10}
                        className="text-lilac-400 shrink-0"
                        onMouseEnter={(e) => setMemoHover({ taskId: task.id, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setMemoHover(null)}
                      />
                    )}
                  </div>
                  <div className="flex-1 flex items-center px-4">
                    <span className="text-sm text-ink-300">날짜 없음 — 수정해서 일정을 설정하세요</span>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* 메모 hover 툴팁 */}
      {memoHover && (() => {
        const t = tasks.find(x => x.id === memoHover.taskId)
        if (!t?.memo) return null
        const pos = clampTooltipPos(memoHover.x, memoHover.y)
        return (
          <div className="fixed z-tooltip pointer-events-none max-w-xs" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
            <div className="bg-foreground text-background text-2xs rounded-lg shadow-xl px-3 py-2 leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-hidden">
              {t.memo}
            </div>
            <div className={`absolute ${pos.flipX ? '-right-1.5' : '-left-1.5'} ${pos.flipY ? 'bottom-3' : 'top-3'} w-3 h-3 bg-foreground rotate-45`} />
          </div>
        )
      })()}
    </div>
  )
}
