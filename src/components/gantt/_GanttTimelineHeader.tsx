import type { WeekInfo, DayInfo } from '@/lib/gantt-utils'
import { MONTH_LABELS } from '@/lib/gantt-utils'
import { YEAR_H, MONTH_H, TODAY_H, DOW_LABELS, type ViewMode } from './_GanttConstants'

interface Props {
  viewMode: ViewMode
  colW: number
  totalWidth: number
  months: string[]
  weeks: WeekInfo[]
  days: DayInfo[]
  yearGroups: { year: number; count: number }[]
  monthGroups: { ym: string; label: string; count: number }[]
  todayYM: string
  todayStr: string
  todayX: number | null
}

export function GanttTimelineHeader({
  viewMode, colW, totalWidth,
  months, weeks, days,
  yearGroups, monthGroups,
  todayYM, todayStr, todayX,
}: Props) {
  return (
    <div style={{ width: totalWidth }}>
      {/* 연도 행 */}
      <div className="flex border-b" style={{ height: YEAR_H }}>
        {yearGroups.map(({ year, count }) => (
          <div key={year} className="text-xs font-bold text-foreground px-3 flex items-center border-r bg-muted" style={{ width: colW * count }}>
            {year}
          </div>
        ))}
      </div>

      {/* 월 행 */}
      <div className="flex border-b" style={{ height: MONTH_H }}>
        {viewMode === 'month' ? (
          months.map(ym => (
            <div
              key={ym}
              className={`text-center text-xs border-r shrink-0 font-medium flex items-center justify-center ${ym === todayYM ? 'text-status-late' : 'text-muted-foreground'}`}
              style={{ width: colW }}
            >
              {MONTH_LABELS[parseInt(ym.split('-')[1]) - 1]}
            </div>
          ))
        ) : (
          monthGroups.map(({ ym, label, count }) => (
            <div
              key={ym}
              className="text-xs border-r shrink-0 font-semibold flex items-center px-2 text-muted-foreground bg-muted"
              style={{ width: colW * count }}
            >
              {label}
            </div>
          ))
        )}
      </div>

      {/* TODAY / 주 레이블 / 일 레이블 행 */}
      <div className="flex" style={{ height: TODAY_H }}>
        {viewMode === 'month' ? (
          <div className="relative w-full">
            {todayX !== null && (
              <div className="absolute text-4xs font-bold text-status-late tracking-widest" style={{ left: todayX, transform: 'translateX(-50%)', top: 2 }}>
                TODAY
              </div>
            )}
          </div>
        ) : viewMode === 'week' ? (
          weeks.map((w, i) => {
            const isToday = todayX !== null && todayX >= i * colW && todayX < (i + 1) * colW
            return (
              <div
                key={w.key}
                className={`text-center border-r shrink-0 flex items-center justify-center text-3xs font-medium ${isToday ? 'bg-lilac-100 text-lilac-600 font-semibold' : 'text-muted-foreground'}`}
                style={{ width: colW }}
              >
                {w.weekStart.getDate()}
              </div>
            )
          })
        ) : (
          days.map(d => {
            const isToday = d.key === todayStr
            return (
              <div
                key={d.key}
                className={`text-center border-r shrink-0 flex flex-col items-center justify-center ${
                  isToday ? 'text-status-late' : d.isWeekend ? 'text-ink-300 bg-muted/50' : 'text-muted-foreground'
                }`}
                style={{ width: colW }}
              >
                <span className="text-6xs leading-none">{DOW_LABELS[d.date.getDay()]}</span>
                <span className={`text-5xs leading-none mt-0.5 ${isToday ? 'font-bold' : 'font-medium'}`}>{d.day}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
