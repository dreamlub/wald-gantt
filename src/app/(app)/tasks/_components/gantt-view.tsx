'use client'

import { useState, useRef, useEffect } from 'react'
import { CornerDownRight, StickyNote } from 'lucide-react'
import { buildWeekRange, dayOffsetInWeeks, todayStrKST } from '@/lib/gantt-utils'
import type { GanttTask } from '@/types'
import { STATUS_COLOR, STATUS_ABBR, STATUS_LABEL, STATUS_GROUPS, PriorityBars } from '../_constants'
import type { TaskStatus } from '@/types'
import {
  isOverdue, isStartDelayed, clampTooltipPos,
  addDays, calcViewRange, yearGroups, monthGroups,
  reorderWithSubs, gantSortCompare, barLabel,
} from '../_utils'

interface Props {
  tasks: GanttTask[]
  onEdit: (t: GanttTask) => void
  onDateChange?: (id: string, start_date: string | null, due_date: string | null) => void
  onStatusChange?: (id: string, status: TaskStatus) => void
}

const WEEK_W        = 52
const LEFT_W_DEFAULT = 300
const LEFT_W_MIN    = 120
const LEFT_W_MAX    = 560
const YEAR_H        = 26
const MONTH_H       = 24
const WEEK_H        = 22
const ROW_H         = 36
const HEADER_H      = YEAR_H + MONTH_H + WEEK_H
const HANDLE_W      = 7

export function GanttView({ tasks, onEdit, onDateChange, onStatusChange }: Props) {
  const [leftWidth, setLeftWidth] = useState(LEFT_W_DEFAULT)
  const [memoHover, setMemoHover] = useState<{ taskId: string; x: number; y: number } | null>(null)
  const [localDates, setLocalDates] = useState<Map<string, { start_date: string | null; due_date: string | null }>>(new Map())
  const [dragDelta, setDragDelta] = useState<{ taskId: string; days: number } | null>(null)
  const draggedRef = useRef(false)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const LEFT_W = leftWidth

  const datedTasks   = tasks.filter(t => t.start_date || t.due_date).sort(gantSortCompare)
  const undatedTasks = tasks.filter(t => !t.start_date && !t.due_date)
  const datedRows    = reorderWithSubs(datedTasks)

  const allDates  = datedTasks.flatMap(t => [t.start_date, t.due_date].filter(Boolean) as string[])
  const viewRange = allDates.length > 0 ? calcViewRange(allDates) : null
  const weeks     = viewRange ? buildWeekRange(viewRange.startYM, viewRange.endYM) : []
  const todayStr  = todayStrKST()
  const todayFrac = weeks.length > 0 ? dayOffsetInWeeks(weeks, todayStr, 'start') : 0
  const todayX    = todayFrac * WEEK_W
  const totalWidth = weeks.length * WEEK_W

  useEffect(() => {
    if (!scrollRef.current || todayX <= 0) return
    const target = LEFT_W + todayX - scrollRef.current.clientWidth / 2
    scrollRef.current.scrollLeft = Math.max(0, target)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToToday() {
    if (!scrollRef.current) return
    const target = LEFT_W + todayX - scrollRef.current.clientWidth / 2
    scrollRef.current.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }

  function onResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = leftWidth
    function onMove(ev: MouseEvent) {
      setLeftWidth(Math.max(LEFT_W_MIN, Math.min(LEFT_W_MAX, startW + ev.clientX - startX)))
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

  function onBarMouseDown(task: GanttTask, mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) {
    if (!onDateChange) return
    e.preventDefault(); e.stopPropagation()
    draggedRef.current = false
    const startX = e.clientX
    const origStart = task.start_date
    const origEnd   = task.due_date
    let current = { start_date: origStart, due_date: origEnd }

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      if (Math.abs(dx) > 3) draggedRef.current = true
      const days = Math.round(dx * 7 / WEEK_W)
      let ns = origStart, ne = origEnd
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
      if (draggedRef.current) setDragDelta({ taskId: task.id, days })
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (draggedRef.current && onDateChange) onDateChange(task.id, current.start_date, current.due_date)
      setLocalDates(prev => { const n = new Map(prev); n.delete(task.id); return n })
      setDragDelta(null)
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

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

  const yGroups = yearGroups(weeks)
  const mGroups = monthGroups(weeks)

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-card">
      <div className="relative" style={{ minWidth: LEFT_W + totalWidth }}>

        {/* 좌측 컬럼 리사이즈 핸들 */}
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 w-1 h-full cursor-col-resize hover:bg-lilac-300 active:bg-lilac-400 transition-colors z-30"
          style={{ left: LEFT_W - 2 }}
          title="드래그해서 폭 조절"
        />

        {/* ── 헤더 ── */}
        <div className="flex sticky top-0 z-20 bg-card border-b shadow-sm select-none">
          <div
            className="shrink-0 sticky left-0 z-10 border-r bg-muted flex items-end justify-end px-2 pb-1.5"
            style={{ width: LEFT_W, height: HEADER_H }}
          >
            <button
              onClick={scrollToToday}
              className="text-xs px-2 py-0.5 rounded bg-lilac-400/20 hover:bg-lilac-400/40 text-lilac-600 dark:text-lilac-300 transition-colors"
            >
              오늘
            </button>
          </div>

          <div className="flex flex-col" style={{ width: totalWidth }}>
            <div className="flex border-b" style={{ height: YEAR_H }}>
              {yGroups.map((g, i) => (
                <div key={i} className="shrink-0 flex items-center px-2 text-2xs font-bold text-muted-foreground border-r bg-muted" style={{ width: g.count * WEEK_W }}>
                  {g.year}
                </div>
              ))}
            </div>
            <div className="flex border-b" style={{ height: MONTH_H }}>
              {mGroups.map((g, i) => (
                <div key={i} className="shrink-0 flex items-center px-1.5 text-2xs font-semibold text-muted-foreground border-r bg-card whitespace-nowrap overflow-hidden" style={{ width: g.count * WEEK_W }}>
                  {g.label}
                </div>
              ))}
            </div>
            <div className="flex" style={{ height: WEEK_H }}>
              {weeks.map((w, i) => {
                const isToday = todayFrac >= i && todayFrac < i + 1
                return (
                  <div
                    key={w.key}
                    className={`shrink-0 flex items-center justify-center text-xs border-r ${isToday ? 'bg-accent text-accent-foreground font-semibold' : 'text-ink-400'}`}
                    style={{ width: WEEK_W }}
                  >
                    {w.weekStart.getDate()}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── 태스크 행 ── */}
        {datedRows.map(({ task, isSub }) => {
          const isDone       = task.status === 'done'
          const overdue      = isOverdue(task.due_date, task.status)
          const startDelayed = !overdue && isStartDelayed(task.start_date, task.status)
          const statusColor  = STATUS_COLOR[task.status]
          const borderC = overdue ? 'var(--color-status-late)' : startDelayed ? 'var(--color-status-warn)' : statusColor
          const barBg   = `color-mix(in srgb, ${borderC} 73%, transparent)`

          const effStart  = localDates.get(task.id)?.start_date ?? task.start_date
          const effEnd    = localDates.get(task.id)?.due_date   ?? task.due_date
          const esx       = effStart ? dayOffsetInWeeks(weeks, effStart, 'start') * WEEK_W : null
          const eex       = effEnd   ? dayOffsetInWeeks(weeks, effEnd,   'end')   * WEEK_W : null
          const eBarLeft  = esx ?? eex ?? 0
          const eBarRight = eex ?? esx ?? WEEK_W
          const eBarWidth = Math.max(eBarRight - eBarLeft, WEEK_W * 0.4)
          const label     = barLabel(effStart, effEnd)
          const showFull  = eBarWidth >= WEEK_W * 2
          const showShort = eBarWidth >= WEEK_W
          const displayLabel = showFull ? label : showShort ? (effStart ? barLabel(effStart, null) : barLabel(null, effEnd)) : ''
          const delta = dragDelta?.taskId === task.id ? dragDelta.days : null

          return (
            <div
              key={task.id}
              className={`flex border-b hover:bg-muted group ${isDone ? 'opacity-55' : ''} ${isSub ? 'bg-muted/40' : 'bg-card'}`}
              style={{ height: ROW_H }}
            >
              <div
                className={`shrink-0 sticky left-0 z-10 flex items-center gap-1.5 border-r bg-inherit ${isSub ? 'pl-6 pr-3' : 'px-3'}`}
                style={{ width: LEFT_W }}
              >
                {isSub && <CornerDownRight size={11} className="text-ink-300 shrink-0" />}
                <button
                  type="button"
                  onClick={() => { const order = STATUS_GROUPS.map(g => g.status); onStatusChange?.(task.id, order[(order.indexOf(task.status) + 1) % order.length]) }}
                  aria-label={STATUS_LABEL[task.status]}
                  title={STATUS_LABEL[task.status]}
                  className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-5xs font-bold text-white hover:scale-110 transition-transform"
                  style={{ backgroundColor: statusColor }}
                >
                  {STATUS_ABBR[task.status]}
                </button>
                <button
                  onClick={() => onEdit(task)}
                  className={`text-sm truncate hover:text-accent-foreground transition-colors text-left ${isDone ? 'line-through text-ink-400' : 'text-foreground'}`}
                  title={task.title}
                >
                  {task.title}
                </button>
                {(task.priority ?? 0) > 0 && <PriorityBars priority={task.priority} />}
                {task.memo && (
                  <StickyNote
                    size={10}
                    className="text-lilac-400 shrink-0"
                    onMouseEnter={e => setMemoHover({ taskId: task.id, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setMemoHover(null)}
                  />
                )}
              </div>

              <div className="relative flex-1" style={{ height: ROW_H }}>
                {weeks.map((_, i) => (
                  <div key={i} className="absolute inset-y-0 border-r border-border" style={{ left: i * WEEK_W }} />
                ))}
                {todayX >= 0 && todayX <= totalWidth && (
                  <div className="absolute inset-y-0 w-px bg-lilac-400 opacity-70 z-10" style={{ left: todayX }} />
                )}

                <div className="absolute top-2 select-none" style={{ left: eBarLeft, width: eBarWidth, height: ROW_H - 16 }}>
                  <div
                    className="absolute inset-0 rounded pointer-events-none"
                    style={{ backgroundColor: barBg, border: `1.5px solid ${borderC}` }}
                  />
                  {delta !== null && delta !== 0 && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs bg-foreground text-background px-1.5 py-0.5 rounded whitespace-nowrap z-20 pointer-events-none">
                      {delta > 0 ? `+${delta}일` : `${delta}일`}
                    </div>
                  )}
                  {effStart && onDateChange && (
                    <div
                      className="absolute left-0 top-0 bottom-0 z-10 cursor-ew-resize rounded-l hover:bg-white/20"
                      style={{ width: HANDLE_W }}
                      onMouseDown={e => onBarMouseDown(task, 'resize-start', e)}
                    />
                  )}
                  {effEnd && onDateChange && (
                    <div
                      className="absolute right-0 top-0 bottom-0 z-10 cursor-ew-resize rounded-r hover:bg-white/20"
                      style={{ width: HANDLE_W }}
                      onMouseDown={e => onBarMouseDown(task, 'resize-end', e)}
                    />
                  )}
                  <div
                    className={`absolute inset-0 flex items-center overflow-hidden z-0 ${onDateChange ? 'cursor-grab hover:opacity-90' : 'cursor-pointer hover:opacity-80'} transition-opacity`}
                    style={{ paddingLeft: effStart && onDateChange ? HANDLE_W + 2 : 5, paddingRight: effEnd && onDateChange ? HANDLE_W + 2 : 4 }}
                    onMouseDown={onDateChange ? e => onBarMouseDown(task, 'move', e) : undefined}
                    onClick={() => { if (!draggedRef.current) onEdit(task) }}
                    title={`${task.title}${overdue ? '\n⚠ 마감 초과' : ''}${effStart ? `\n시작: ${effStart}` : ''}${effEnd ? `\n마감: ${effEnd}` : ''}`}
                  >
                    {displayLabel && (
                      <span className="text-xs font-medium truncate leading-none whitespace-nowrap" style={{ color: 'white', textShadow: '0 0 3px rgba(0,0,0,0.3)' }}>
                        {displayLabel}
                      </span>
                    )}
                  </div>
                </div>

                {!showShort && label && (
                  <div className="absolute top-2 flex items-center pointer-events-none" style={{ left: eBarLeft + eBarWidth + 4, height: ROW_H - 16 }}>
                    <span className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded whitespace-nowrap ${overdue ? 'text-status-late' : 'text-muted-foreground'}`}>
                      {label}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* ── 날짜 없는 태스크 ── */}
        {undatedTasks.length > 0 && (
          <>
            <div className="flex border-b bg-muted">
              <div
                className="sticky left-0 z-10 px-3 py-1.5 text-sm font-semibold text-ink-400 uppercase tracking-wider bg-muted"
                style={{ width: LEFT_W }}
              >
                날짜 미설정 — {undatedTasks.length}개
              </div>
              <div className="flex-1" />
            </div>
            {undatedTasks.map(task => {
              const isDone = task.status === 'done'
              return (
                <div key={task.id} className={`flex border-b hover:bg-muted bg-card ${isDone ? 'opacity-55' : ''}`} style={{ height: ROW_H }}>
                  <div className="shrink-0 sticky left-0 z-10 flex items-center gap-1.5 px-3 border-r bg-inherit" style={{ width: LEFT_W }}>
                    <button
                      type="button"
                      onClick={() => { const order = STATUS_GROUPS.map(g => g.status); onStatusChange?.(task.id, order[(order.indexOf(task.status) + 1) % order.length]) }}
                      aria-label={STATUS_LABEL[task.status]}
                      title={STATUS_LABEL[task.status]}
                      className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-5xs font-bold text-white hover:scale-110 transition-transform"
                      style={{ backgroundColor: STATUS_COLOR[task.status] }}
                    >
                      {STATUS_ABBR[task.status]}
                    </button>
                    <button
                      onClick={() => onEdit(task)}
                      className={`text-sm truncate hover:text-accent-foreground transition-colors text-left ${isDone ? 'line-through text-ink-400' : 'text-foreground'}`}
                    >
                      {task.title}
                    </button>
                    {task.memo && (
                      <StickyNote
                        size={10}
                        className="text-lilac-400 shrink-0"
                        onMouseEnter={e => setMemoHover({ taskId: task.id, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setMemoHover(null)}
                      />
                    )}
                    <span className="ml-auto shrink-0 text-xs text-ink-300">날짜 없음</span>
                  </div>
                  <div className="flex-1" />
                </div>
              )
            })}
          </>
        )}
      </div>

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
