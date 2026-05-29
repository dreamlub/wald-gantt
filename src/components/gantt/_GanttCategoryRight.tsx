'use client'

import { useState } from 'react'
import type { GanttCategory, GanttProject } from '@/types'
import { isLightColor } from '@/lib/gantt-utils'
import { CAT_ROW_H, PROJ_ROW_H, formatBarDate, barOpacity } from './_GanttRows'

// ── GanttCategoryRight ────────────────────────────────────────
interface GanttCategoryRightProps {
  cat: GanttCategory
  catProjs: GanttProject[]
  readOnly: boolean
  colW: number
  barCols: (p: GanttProject) => { start: number; end: number } | null
  makeDragHandlers: (p: GanttProject, dragType: 'move' | 'resize-left' | 'resize-right') => (e: React.MouseEvent) => void
  pmColorMap: Map<string, string>
  onBarCreate?: (projectId: string, colIndex: number) => void
}

// 날짜 없는 프로젝트 행: hover 시 ghost bar + 클릭으로 바 생성
function EmptyBarHint({ colW, barColor, curTop, BAR_H, projectId, onBarCreate }: {
  colW: number
  barColor: string
  curTop: number
  BAR_H: number
  projectId: string
  onBarCreate: (projectId: string, colIndex: number) => void
}) {
  const [hoverCol, setHoverCol] = useState<number | null>(null)

  function getColIndex(e: React.MouseEvent): number {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.floor((e.clientX - rect.left) / colW)
  }

  return (
    <div
      className="absolute inset-0"
      style={{ cursor: 'crosshair' }}
      onMouseMove={e => setHoverCol(getColIndex(e))}
      onMouseLeave={() => setHoverCol(null)}
      onClick={e => onBarCreate(projectId, getColIndex(e))}
    >
      {hoverCol !== null && (
        <div
          className="absolute pointer-events-none rounded"
          style={{
            top: curTop,
            left: hoverCol * colW + 4,
            width: Math.max(colW - 8, 16),
            height: BAR_H,
            border: `1.5px dashed ${barColor}`,
            backgroundColor: barColor + '18',
          }}
        />
      )}
    </div>
  )
}

export function GanttCategoryRight({
  cat, catProjs, readOnly, colW, barCols, makeDragHandlers, pmColorMap, onBarCreate,
}: GanttCategoryRightProps) {
  const barColor = cat.color
  const barTextColor = isLightColor(barColor) ? 'rgba(0,0,0,0.75)' : 'white'
  const barTextShadow = isLightColor(barColor) ? 'none' : '0 0 3px rgba(0,0,0,0.3)'

  return (
    <div>
      <div className="border-b" style={{ height: CAT_ROW_H, backgroundColor: 'var(--muted)' }} />

      {catProjs.map(project => {
        const cols        = barCols(project)
        const isMilestone = project.is_milestone
        const isBacklog   = !isMilestone && project.status === 'backlog'
        const isChild     = !!project.parent_id

        const BAR_H      = isChild ? 14 : 20
        const curTop     = (PROJ_ROW_H - BAR_H) / 2
        const barWidth   = (cols ? cols.end - cols.start : 0) * colW - 8
        const dateText   = (project.start_date && project.end_date) ? formatBarDate(project.start_date, project.end_date) : ''
        const dateFitsInside = dateText.length > 0 && barWidth >= dateText.length * 5.5 + 14

        // 마일스톤: cols.start 컬럼 중앙에 다이아몬드 마커
        if (isMilestone) {
          const DIAMOND = 14
          return (
            <div
              key={project.id}
              className="relative border-b"
              style={{ height: PROJ_ROW_H }}
            >
              {cols && (
                <div
                  data-bar-id={project.id}
                  className="absolute"
                  style={{
                    top: (PROJ_ROW_H - DIAMOND) / 2,
                    left: cols.start * colW + colW / 2 - DIAMOND / 2,
                    width: DIAMOND,
                    height: DIAMOND,
                    cursor: readOnly ? 'default' : 'grab',
                  }}
                  onMouseDown={readOnly ? undefined : makeDragHandlers(project, 'move')}
                >
                  {/* 다이아몬드 도형 */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundColor: barColor,
                      transform: 'rotate(45deg)',
                      borderRadius: 2,
                    }}
                  />
                  {/* 날짜 레이블 */}
                  {project.end_date && (
                    <span
                      className="absolute text-3xs whitespace-nowrap text-muted-foreground pointer-events-none tabular-nums"
                      style={{ left: DIAMOND + 8, top: (DIAMOND - 10) / 2 }}
                    >
                      {project.end_date.slice(5).replace('-', '/')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        }

        return (
          <div
            key={project.id}
            className="relative border-b"
            style={{ height: PROJ_ROW_H, backgroundColor: isBacklog ? 'var(--color-ink-100)' : 'transparent' }}
          >
            {!cols && !readOnly && onBarCreate && (
              <EmptyBarHint
                colW={colW}
                barColor={barColor}
                curTop={curTop}
                BAR_H={BAR_H}
                projectId={project.id}
                onBarCreate={onBarCreate}
              />
            )}
            {cols && (
              <>
                <div
                  data-bar-id={project.id}
                  className="absolute rounded overflow-hidden flex items-center"
                  style={{
                    top: curTop,
                    left: cols.start * colW + 4,
                    width: barWidth,
                    height: BAR_H,
                    backgroundColor: barColor + 'aa',
                    border: `1.5px solid ${barColor}`,
                    paddingLeft: 5,
                    paddingRight: 4,
                    cursor: readOnly ? 'default' : 'grab',
                  }}
                  onMouseDown={readOnly ? undefined : makeDragHandlers(project, 'move')}
                >
                  {project.progress > 0 && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ width: `${project.progress}%`, backgroundColor: barColor, opacity: 0.75 }}
                    />
                  )}
                  {!readOnly && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 rounded-l cursor-ew-resize z-10"
                      onMouseDown={e => { e.stopPropagation(); makeDragHandlers(project, 'resize-left')(e) }}
                    />
                  )}
                  {dateFitsInside && (
                    <span
                      className="relative z-10 text-3xs font-medium tabular-nums whitespace-nowrap leading-none pointer-events-none select-none"
                      style={{ color: barTextColor, textShadow: isLightColor(barColor) ? '0 0 3px rgba(255,255,255,0.8)' : '0 0 3px rgba(0,0,0,0.5)' }}
                    >
                      {dateText}
                    </span>
                  )}
                  {!readOnly && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 rounded-r cursor-ew-resize"
                      onMouseDown={e => { e.stopPropagation(); makeDragHandlers(project, 'resize-right')(e) }}
                    />
                  )}
                </div>

                {((!dateFitsInside && dateText) || project.team || project.pm) && (
                  <div
                    data-bar-meta-id={project.id}
                    className="absolute flex items-center gap-3 pointer-events-none"
                    style={{
                      left: cols.end * colW + 12,
                      top: curTop + BAR_H / 2,
                      transform: 'translateY(-50%)',
                    }}
                  >
                    {!dateFitsInside && dateText && (
                      <span className="text-3xs font-medium tabular-nums whitespace-nowrap text-muted-foreground">
                        {dateText}
                      </span>
                    )}
                    {project.team && (
                      <span className="text-3xs font-medium whitespace-nowrap flex items-center gap-1 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: barColor }} />
                        {project.team}
                      </span>
                    )}
                    {project.pm && (
                      <span className="text-3xs font-medium whitespace-nowrap flex items-center gap-1 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pmColorMap.get(project.pm) ?? 'var(--color-ink-300)' }} />
                        {project.pm}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <div className="border-b border-border" style={{ height: PROJ_ROW_H }} />
      )}
    </div>
  )
}
