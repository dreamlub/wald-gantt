'use client'

import { GanttChart } from '@/components/gantt/GanttChart'
import type { GanttBoard, GanttCategory, GanttProject } from '@/types'

const now = new Date()
const CUR_YEAR  = now.getFullYear()
const VIEW_START = `${CUR_YEAR - 1}-01`
const VIEW_END   = `${CUR_YEAR + 2}-12`

interface Props {
  board: GanttBoard
  categories: GanttCategory[]
  projects: GanttProject[]
}

export function ShareView({ board, categories, projects }: Props) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="h-12 bg-card border-b flex items-center px-4 gap-3 shrink-0 z-20">
        <span className="text-base font-bold text-foreground">Waldlust Gantt Manager</span>
        <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-1 rounded">읽기 전용</span>
      </header>
      <main className="flex-1 overflow-hidden bg-background">
        <GanttChart
          categories={categories}
          projects={projects}
          viewStart={VIEW_START}
          viewEnd={VIEW_END}
          boardName={board.name}
          readOnly
          onAddCategory={async () => {}}
          onUpdateCategory={async () => {}}
          onDeleteCategory={async () => {}}
          onAddProject={() => {}}
          onEditProject={() => {}}
          onDeleteProject={() => {}}
          onShowHistory={() => {}}
          onOpenMemo={() => {}}
          onUpdateProjectDates={async () => {}}
          onUpdateProjectName={async () => {}}
          onUpdateProjectStatus={async () => {}}
          onMoveProject={async () => {}}
        />
      </main>
    </div>
  )
}
