'use client'

import { useState } from 'react'
import { CornerDownRight, StickyNote } from 'lucide-react'
import {
  buildWeekRange, dayOffsetInWeeks, formatYearMonth, todayStrKST,
  type WeekInfo,
} from '@/lib/gantt-utils'
import type { GanttTask } from '@/types'
import { STATUS_COLOR } from '../_constants'
import { isOverdue, isStartDelayed, clampTooltipPos } from '../_utils'

interface Props {
  tasks: GanttTask[]
  onEdit: (t: GanttTask) => void
}

const WEEK_W   = 36   // px per week column
const LEFT_W_DEFAULT = 300
const LEFT_W_MIN     = 120
const LEFT_W_MAX     = 560
const YEAR_H   = 26
const MONTH_H  = 24
const WEEK_H   = 22
const ROW_H    = 36

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

export function GanttView({ tasks, onEdit }: Props) {
  const [leftWidth, setLeftWidth] = useState(LEFT_W_DEFAULT)
  const [memoHover, setMemoHover] = useState<{ taskId: string; x: number; y: number } | null>(null)
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

  const datedTasks   = tasks.filter(t => t.start_date || t.due_date).sort(gantSortCompare)
  const undatedTasks = tasks.filter(t => !t.start_date && !t.due_date)
  const datedRows    = reorderWithSubs(datedTasks)

  // 날짜 없는 태스크만 있으면 안내
  if (datedTasks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
        <span className="text-xs">시작일 또는 마감일이 설정된 태스크가 없어요</span>
        {undatedTasks.length > 0 && (
          <span className="text-[11px] text-gray-300">{undatedTasks.length}개 태스크에 날짜를 설정해 보세요</span>
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
    <div className="flex-1 overflow-auto">
      <div className="relative" style={{ minWidth: LEFT_W + totalWidth }}>

        {/* 좌측 컬럼 리사이즈 핸들 — 전체 높이 */}
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 w-1 h-full cursor-col-resize hover:bg-indigo-300 active:bg-indigo-400 transition-colors z-30"
          style={{ left: LEFT_W - 2 }}
          title="드래그해서 폭 조절"
        />

        {/* ── 헤더 ── */}
        <div className="flex sticky top-0 z-10 bg-white border-b shadow-sm select-none">
          {/* 좌측 고정 */}
          <div className="shrink-0 border-r bg-gray-50" style={{ width: LEFT_W, height: headerH }} />

          {/* 날짜 헤더 영역 */}
          <div className="flex flex-col" style={{ width: totalWidth }}>
            {/* 연도 행 */}
            <div className="flex border-b" style={{ height: YEAR_H }}>
              {yGroups.map((g, i) => (
                <div
                  key={i}
                  className="shrink-0 flex items-center px-2 text-[11px] font-bold text-gray-600 border-r bg-gray-50"
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
                  className="shrink-0 flex items-center px-1.5 text-[11px] font-semibold text-gray-500 border-r bg-white whitespace-nowrap overflow-hidden"
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
                    className={`shrink-0 flex items-center justify-center text-[10px] border-r
                      ${isToday ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-400'}`}
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
          // 마감 지난 미완료는 빨강, 시작 지연은 앰버
          const barBg     = overdue ? '#fca5a5' : startDelayed ? '#fcd34d' : statusColor + 'bb'
          const barBorder = overdue ? '#ef4444' : startDelayed ? '#f59e0b' : statusColor

          const sx = task.start_date ? dayOffsetInWeeks(weeks, task.start_date, 'start') * WEEK_W : null
          const ex = task.due_date   ? dayOffsetInWeeks(weeks, task.due_date,   'end')   * WEEK_W : null

          const barLeft  = sx ?? ex ?? 0
          const barRight = ex ?? sx ?? WEEK_W
          const barWidth = Math.max(barRight - barLeft, WEEK_W * 0.4)

          return (
            <div
              key={task.id}
              className={`flex border-b hover:bg-gray-50 group ${isDone ? 'opacity-55' : ''} ${isSub ? 'bg-gray-50/40' : ''}`}
              style={{ height: ROW_H }}
            >
              {/* 태스크 이름 */}
              <div
                className="shrink-0 flex items-center gap-1.5 px-3 border-r"
                style={{ width: LEFT_W }}
              >
                {isSub && <CornerDownRight size={11} className="text-gray-300 shrink-0" />}
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                <button
                  onClick={() => onEdit(task)}
                  className={`text-xs truncate hover:text-indigo-600 transition-colors text-left ${
                    isDone ? 'line-through font-medium text-gray-400' :
                    task.priority === 3 ? 'font-semibold text-rose-400' :
                    task.priority === 2 ? 'font-medium text-gray-900' :
                    task.priority === 1 ? 'font-normal text-gray-600' :
                    'font-normal text-gray-400'
                  }`}
                  title={task.title}
                >
                  {task.title}
                </button>
                {task.memo && (
                  <StickyNote
                    size={10}
                    className="text-indigo-400 shrink-0"
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
                    className="absolute inset-y-0 border-r border-gray-100"
                    style={{ left: i * WEEK_W }}
                  />
                ))}

                {/* 오늘 선 */}
                {todayX >= 0 && todayX <= totalWidth && (
                  <div
                    className="absolute inset-y-0 w-px bg-indigo-400 opacity-70 z-10"
                    style={{ left: todayX }}
                  />
                )}

                {/* 바 */}
                {(() => {
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
                  const label = task.start_date && task.due_date && task.start_date !== task.due_date
                    ? fmtRange(task.start_date, task.due_date)
                    : task.start_date
                      ? fmt(task.start_date)
                      : task.due_date
                        ? fmt(task.due_date)
                        : ''
                  const showFull  = barWidth >= 100
                  const showShort = barWidth >= 52
                  const displayLabel = showFull
                    ? label
                    : showShort
                      ? (task.start_date ? fmt(task.start_date) : task.due_date ? fmt(task.due_date) : '')
                      : ''
                  return (
                    <>
                      <div
                        className="absolute top-2 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden"
                        style={{
                          left: barLeft,
                          width: barWidth,
                          height: ROW_H - 16,
                          backgroundColor: barBg,
                          border: `1.5px solid ${barBorder}`,
                          paddingLeft: 5,
                          paddingRight: 4,
                        }}
                        onClick={() => onEdit(task)}
                        title={`${task.title}${overdue ? '\n⚠ 마감 초과' : ''}${task.start_date ? `\n시작: ${task.start_date}` : ''}${task.due_date ? `\n마감: ${task.due_date}` : ''}`}
                      >
                        {displayLabel && (
                          <span
                            className="text-[10px] font-medium truncate leading-none whitespace-nowrap"
                            style={{ color: '#fff', textShadow: '0 0 3px rgba(0,0,0,0.3)' }}
                          >
                            {displayLabel}
                          </span>
                        )}
                      </div>
                      {!showShort && label && (
                        <div
                          className="absolute top-2 flex items-center pointer-events-none"
                          style={{ left: barLeft + barWidth + 4, height: ROW_H - 16 }}
                        >
                          <span className={`text-[10px] font-medium tabular-nums px-1.5 py-0.5 rounded whitespace-nowrap ${overdue ? 'text-red-500' : 'text-gray-500'}`}>
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
            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50 border-b tracking-wider">
              날짜 미설정 — {undatedTasks.length}개
            </div>
            {undatedTasks.map(task => {
              const isDone = task.status === 'done'
              return (
                <div
                  key={task.id}
                  className={`flex border-b hover:bg-gray-50 ${isDone ? 'opacity-55' : ''}`}
                  style={{ height: ROW_H }}
                >
                  <div className="shrink-0 flex items-center gap-1.5 px-3 border-r" style={{ width: LEFT_W }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[task.status] }} />
                    <button
                      onClick={() => onEdit(task)}
                      className={`text-xs truncate hover:text-indigo-600 transition-colors text-left ${
                        isDone ? 'line-through font-medium text-gray-400' :
                        task.priority === 3 ? 'font-semibold text-rose-400' :
                        task.priority === 2 ? 'font-medium text-gray-900' :
                        task.priority === 1 ? 'font-normal text-gray-600' :
                        'font-normal text-gray-400'
                      }`}
                    >
                      {task.title}
                    </button>
                    {task.memo && (
                      <StickyNote
                        size={10}
                        className="text-indigo-400 shrink-0"
                        onMouseEnter={(e) => setMemoHover({ taskId: task.id, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setMemoHover(null)}
                      />
                    )}
                  </div>
                  <div className="flex-1 flex items-center px-4">
                    <span className="text-[10px] text-gray-300">날짜 없음 — 수정해서 일정을 설정하세요</span>
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
          <div className="fixed z-[9999] pointer-events-none max-w-xs" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
            <div className="bg-gray-900 text-gray-100 text-[11px] rounded-lg shadow-xl px-3 py-2 leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-hidden">
              {t.memo}
            </div>
            <div className={`absolute ${pos.flipX ? '-right-1.5' : '-left-1.5'} ${pos.flipY ? 'bottom-3' : 'top-3'} w-3 h-3 bg-gray-900 rotate-45`} />
          </div>
        )
      })()}
    </div>
  )
}
