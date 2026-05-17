'use client'

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import type { TaskHistoryEntry } from '@/types'
import { getTaskHistory } from '@/lib/gantt-service'

const HIST_FIELD_LABELS: Record<string, string> = {
  title: '제목', status: '상태', type: '구분',
  assignee: '담당자', start_date: '시작일', due_date: '마감일', priority: '우선순위',
}
const HIST_STATUS_LABELS: Record<string, string> = {
  'to-do': 'To-Do', 'in-progress': 'In Progress', 'pending': 'Pending', 'backlog': 'Backlog', 'done': 'Done',
}
const HIST_TYPE_LABELS: Record<string, string> = { mine: '내 할일', delegated: '업무지시' }
const HIST_PRIORITY_LABELS: Record<string, string> = { '0': '없음', '1': '낮음', '2': '보통', '3': '높음' }

function fmtHistVal(field: string, value: string | null): string {
  if (value === null || value === '') return '없음'
  if (field === 'status')   return HIST_STATUS_LABELS[value] ?? value
  if (field === 'type')     return HIST_TYPE_LABELS[value] ?? value
  if (field === 'priority') return HIST_PRIORITY_LABELS[value] ?? value
  if (field === 'start_date' || field === 'due_date') {
    const [y, m, d] = value.split('-')
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`
  }
  return value
}

function fmtHistDate(iso: string): string {
  const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function groupHistByTime(entries: TaskHistoryEntry[]): TaskHistoryEntry[][] {
  const groups: TaskHistoryEntry[][] = []; let cur: TaskHistoryEntry[] = []
  for (const e of entries) {
    if (cur.length === 0) cur.push(e)
    else if (Math.abs(new Date(cur[0].changed_at).getTime() - new Date(e.changed_at).getTime()) < 10_000) cur.push(e)
    else { groups.push(cur); cur = [e] }
  }
  if (cur.length > 0) groups.push(cur)
  return groups
}

export function TaskHistorySection({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<TaskHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  // taskId가 바뀔 때 히스토리 fetch (외부 fetch → setState 의도된 패턴)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getTaskHistory(taskId).then(setEntries).catch(console.error).finally(() => setLoading(false))
  }, [taskId])

  const groups = groupHistByTime(entries)

  return (
    <div className="flex flex-col">
      {loading ? (
        <div className="flex items-center justify-center h-20 text-ink-400 text-xs">로딩 중...</div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-28 text-ink-300 text-xs gap-1">
          <Clock size={20} className="opacity-30" />
          수정 이력이 없습니다
        </div>
      ) : groups.map((group, gi) => (
        <div key={gi} className="px-5 py-3 border-b last:border-0 hover:bg-muted transition-colors">
          <div className="text-[10px] text-ink-400 font-medium mb-1.5 tabular-nums">{fmtHistDate(group[0].changed_at)}</div>
          <div className="space-y-1">
            {group.map(entry => (
              <div key={entry.id} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground font-semibold w-12 shrink-0">{HIST_FIELD_LABELS[entry.field_name] ?? entry.field_name}</span>
                <span className="text-[11px] text-ink-400 line-through">{fmtHistVal(entry.field_name, entry.old_value)}</span>
                <span className="text-[10px] text-ink-300">→</span>
                <span className="text-[11px] text-ink-700 font-medium">{fmtHistVal(entry.field_name, entry.new_value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
