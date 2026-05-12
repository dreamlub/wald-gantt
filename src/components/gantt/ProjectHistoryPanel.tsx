'use client'

import { useEffect, useState } from 'react'
import { X, Clock } from 'lucide-react'
import { getProjectHistory } from '@/lib/gantt-service'
import type { GanttProject, ProjectHistoryEntry } from '@/types'

interface Props {
  project: GanttProject | null
  onClose: () => void
}

const FIELD_LABELS: Record<string, string> = {
  name:        '이름',
  status:      '상태',
  start_date:  '시작일',
  end_date:    '종료일',
  start_month: '시작일',  // 이전 필드명 호환
  end_month:   '종료일',  // 이전 필드명 호환
  team:        '팀',
  pm:          'PM',
  category:    '카테고리',
}

const STATUS_LABELS: Record<string, string> = {
  'to-do':       'To-Do',
  'in-progress': 'In Progress',
  'pending':     'Pending',
  'backlog':     'Backlog',
  'done':        'Done',
}

function formatValue(field: string, value: string | null): string {
  if (value === null || value === '') return '없음'
  if (field === 'status') return STATUS_LABELS[value] ?? value
  if (field === 'start_date' || field === 'end_date') {
    const [y, m, d] = value.split('-')
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`
  }
  if (field === 'start_month' || field === 'end_month') {
    const [y, m] = value.split('-')
    return `${y}년 ${parseInt(m)}월`
  }
  return value
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 10초 이내 변경은 같은 그룹으로 묶음
function groupByTime(entries: ProjectHistoryEntry[]): ProjectHistoryEntry[][] {
  const groups: ProjectHistoryEntry[][] = []
  let cur: ProjectHistoryEntry[] = []

  for (const entry of entries) {
    if (cur.length === 0) {
      cur.push(entry)
    } else {
      const diff = Math.abs(
        new Date(cur[0].changed_at).getTime() - new Date(entry.changed_at).getTime()
      )
      if (diff < 10_000) cur.push(entry)
      else { groups.push(cur); cur = [entry] }
    }
  }
  if (cur.length > 0) groups.push(cur)
  return groups
}

export function ProjectHistoryPanel({ project, onClose }: Props) {
  const [entries, setEntries] = useState<ProjectHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!project) { setEntries([]); return }
    setLoading(true)
    getProjectHistory(project.id)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [project?.id])

  if (!project) return null

  const groups = groupByTime(entries)

  return (
    <>
      {/* 배경 클릭 시 닫기 */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* 패널 */}
      <div className="fixed right-0 top-0 h-full w-72 bg-white border-l shadow-xl z-50 flex flex-col">
        {/* 헤더 */}
        <div className="h-12 flex items-center gap-2.5 px-4 border-b shrink-0">
          <Clock size={14} className="text-gray-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-800 truncate flex-1">{project.name}</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
            <X size={15} />
          </button>
        </div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2 border-b bg-gray-50 shrink-0">
          수정 이력
        </div>

        {/* 이력 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-gray-400 text-xs">로딩 중...</div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-gray-400 text-xs gap-1">
              <Clock size={20} className="opacity-30" />
              수정 이력이 없습니다
            </div>
          ) : (
            <div>
              {groups.map((group, gi) => (
                <div key={gi} className="px-4 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <div className="text-[10px] text-gray-400 font-medium mb-2 tabular-nums">
                    {formatDate(group[0].changed_at)}
                  </div>
                  <div className="space-y-1.5">
                    {group.map(entry => (
                      <div key={entry.id} className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-gray-500 font-semibold w-12 shrink-0">
                          {FIELD_LABELS[entry.field_name] ?? entry.field_name}
                        </span>
                        <span className="text-[11px] text-gray-400 line-through">
                          {formatValue(entry.field_name, entry.old_value)}
                        </span>
                        <span className="text-[10px] text-gray-300">→</span>
                        <span className="text-[11px] text-gray-700 font-medium">
                          {formatValue(entry.field_name, entry.new_value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
