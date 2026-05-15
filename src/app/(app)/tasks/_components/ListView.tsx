'use client'

import { useState } from 'react'
import { Circle, CheckCircle2, StickyNote, CornerDownRight, Paperclip, Plus } from 'lucide-react'
import type { GanttTask, TaskStatus } from '@/types'
import { fmtRange, isOverdue, overdueDays, daysDiff, clampTooltipPos, isLightColor } from '../_utils'
import { STATUS_COLOR, STATUS_LABEL } from '../_constants'
import { labelColor } from './TaskDetailDrawer'

export type SortKey = 'title' | 'status' | 'priority' | 'assignee' | 'due_date' | 'start_date' | 'created_at' | 'updated_at'

const STATUS_ORDER: Record<TaskStatus, number> = { backlog: 0, 'to-do': 1, 'in-progress': 2, done: 3, pending: 4 }

interface Props {
  tasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  onEdit: (t: GanttTask) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  emptyMessage?: string
  onQuickCreate?: (title: string, status: TaskStatus) => Promise<void>
  onSubQuickCreate?: (parentId: string, title: string) => Promise<void>
}

export function ListView({ tasks, assigneeColorMap, getAssigneeKey, onEdit, onStatusChange, emptyMessage = '태스크가 없어요', onQuickCreate, onSubQuickCreate }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('due_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [memoHover, setMemoHover] = useState<{ taskId: string; x: number; y: number } | null>(null)
  const [quickAddOpen,  setQuickAddOpen]  = useState(false)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [subQuickParentId, setSubQuickParentId] = useState<string | null>(null)
  const [subQuickTitle,    setSubQuickTitle]    = useState('')

  async function commitSubQuickAdd(parentId: string) {
    if (!onSubQuickCreate) return
    const title = subQuickTitle.trim()
    if (!title) { setSubQuickParentId(null); setSubQuickTitle(''); return }
    await onSubQuickCreate(parentId, title)
    setSubQuickTitle('')
  }
  function cancelSubQuickAdd() { setSubQuickParentId(null); setSubQuickTitle('') }

  // 하위태스크 통계 — 부모ID → {total, done}
  const subStatsByParent = new Map<string, { total: number; done: number }>()
  for (const t of tasks) {
    if (!t.parent_id) continue
    const cur = subStatsByParent.get(t.parent_id) ?? { total: 0, done: 0 }
    cur.total++
    if (t.status === 'done') cur.done++
    subStatsByParent.set(t.parent_id, cur)
  }

  async function commitQuickCreate() {
    if (!onQuickCreate) return
    const title = quickAddTitle.trim()
    if (!title) { setQuickAddOpen(false); setQuickAddTitle(''); return }
    await onQuickCreate(title, 'to-do')
    setQuickAddTitle('')
    // 입력창 유지로 연속 등록
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // 부모-자식 그룹핑: top-level은 정렬 순서대로, 각 부모 뒤에 그 부모의 sub들을 붙임
  function reorderWithSubs(arr: GanttTask[]): { task: GanttTask; isSub: boolean }[] {
    const map = new Map(arr.map(t => [t.id, t]))
    const subsByParent = new Map<string, GanttTask[]>()
    for (const t of arr) {
      if (t.parent_id && map.has(t.parent_id)) {
        const list = subsByParent.get(t.parent_id) ?? []
        list.push(t)
        subsByParent.set(t.parent_id, list)
      }
    }
    const out: { task: GanttTask; isSub: boolean }[] = []
    const inserted = new Set<string>()
    for (const t of arr) {
      if (inserted.has(t.id)) continue
      // 부모가 같은 목록에 있는 sub은 건너뜀 (부모를 통해 삽입됨)
      if (t.parent_id && map.has(t.parent_id)) continue
      out.push({ task: t, isSub: false })
      inserted.add(t.id)
      for (const sub of subsByParent.get(t.id) ?? []) {
        out.push({ task: sub, isSub: true })
        inserted.add(sub.id)
      }
    }
    return out
  }

  const sorted = [...tasks].sort((a, b) => {
    // 일정(마감일) 정렬: 날짜 없는 항목은 정렬 방향과 무관하게 항상 뒤로
    if (sortKey === 'due_date') {
      const aNull = !a.due_date
      const bNull = !b.due_date
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1
      if (a.due_date! < b.due_date!) return sortDir === 'asc' ? -1 : 1
      if (a.due_date! > b.due_date!) return sortDir === 'asc' ? 1 : -1
      return 0
    }
    let va: string | number = 0, vb: string | number = 0
    if (sortKey === 'status') { va = STATUS_ORDER[a.status]; vb = STATUS_ORDER[b.status] }
    else if (sortKey === 'priority') { va = a.priority ?? 0; vb = b.priority ?? 0 }
    else if (sortKey === 'assignee') {
      va = a.type === 'mine' ? '내 할일' : (a.assignee ?? '')
      vb = b.type === 'mine' ? '내 할일' : (b.assignee ?? '')
    }
    else { va = (a[sortKey] as string) ?? ''; vb = (b[sortKey] as string) ?? '' }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const renderList = reorderWithSubs(sorted)

  // 부모-자식 그룹: 각 부모 다음에 sub 입력창을 끼워넣기 위해
  type Group = { parent: GanttTask; subs: GanttTask[] }
  const groups: Group[] = []
  {
    let cur: Group | null = null
    for (const { task, isSub } of renderList) {
      if (!isSub) {
        if (cur) groups.push(cur)
        cur = { parent: task, subs: [] }
      } else if (cur) {
        cur.subs.push(task)
      }
    }
    if (cur) groups.push(cur)
  }

  function SortBtn({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col
    return (
      <button
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider hover:text-gray-600 transition-colors
          ${active ? 'text-indigo-600' : 'text-gray-400'}`}
      >
        {label}
        <span className={`text-[8px] ${active ? '' : 'opacity-30'}`}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-4 px-4 py-2 border-b bg-gray-50 shrink-0 sticky top-0 z-10">
        <div className="w-6 shrink-0" />
        <div className="flex-1 min-w-0"><SortBtn col="title" label="태스크" /></div>
        <div className="w-8 shrink-0 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">메모</div>
        <div className="w-28 shrink-0"><SortBtn col="status" label="상태" /></div>
        <div className="w-32 shrink-0"><SortBtn col="assignee" label="담당자" /></div>
        <div className="w-24 shrink-0 text-right pr-2"><SortBtn col="due_date" label="일정" /></div>
      </div>

      {renderList.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-xs">{emptyMessage}</div>
      ) : groups.flatMap(({ parent, subs }) => {
        const rows: React.ReactNode[] = []
        const items: { task: GanttTask; isSub: boolean }[] = [
          { task: parent, isSub: false },
          ...subs.map(s => ({ task: s, isSub: true })),
        ]
        for (const { task, isSub } of items) {
          const overdue   = isOverdue(task.due_date, task.status)
          const isDone    = task.status === 'done'
          const noUpdate  = daysDiff(task.updated_at) >= 7 && !isDone
          const color     = assigneeColorMap.get(getAssigneeKey(task)) ?? '#9ca3af'
          const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')
          const subStats  = !isSub ? subStatsByParent.get(task.id) : undefined
          const labels    = task.labels ?? []
          rows.push(
          <div
            key={task.id}
            onClick={() => onEdit(task)}
            className={`group flex items-center gap-4 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${isDone ? 'opacity-55' : ''} ${isSub ? 'bg-gray-50/40' : ''}`}
          >
            <div className="w-6 shrink-0 flex items-center">
              {isSub && <CornerDownRight size={11} className="text-gray-300 mr-0.5" />}
              <button
                onClick={e => { e.stopPropagation(); onStatusChange(task.id, task.status === 'done' ? 'to-do' : 'done') }}
                className="shrink-0"
              >
                {isDone
                  ? <CheckCircle2 size={16} className="text-green-400" />
                  : <Circle size={16} className="text-gray-300 hover:text-indigo-400 transition-colors" />}
              </button>
            </div>
            <div className={`flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden ${isSub ? 'pl-4' : ''}`}>
              <span className={`text-xs truncate min-w-0 ${
                isDone ? 'line-through text-gray-400' :
                task.priority === 3 ? 'font-semibold text-rose-400' :
                task.priority === 2 ? 'font-medium text-gray-900' :
                task.priority === 1 ? 'font-normal text-gray-600' :
                'font-normal text-gray-400'
              }`}>{task.title}</span>
              {overdue && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium border border-red-100 whitespace-nowrap">
                  지연 {overdueDays(task.due_date)}일
                </span>
              )}
              {noUpdate && !overdue && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-500 font-medium border border-orange-100 whitespace-nowrap">
                  {daysDiff(task.updated_at)}일 무응답
                </span>
              )}
              {/* 연결 프로젝트 */}
              {task.projects && task.projects.length > 0 && (
                <>
                  <span className="text-gray-200 text-[10px] shrink-0">·</span>
                  {task.projects.slice(0, 2).map(p => (
                    <span key={p.id} className="flex items-center gap-0.5 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                      <Paperclip size={8} className="shrink-0" />{p.name}
                    </span>
                  ))}
                  {task.projects.length > 2 && <span className="text-[10px] text-gray-400 shrink-0">+{task.projects.length - 2}</span>}
                </>
              )}
              {/* 라벨 */}
              {labels.slice(0, 4).map(l => {
                const bg = labelColor(l)
                return (
                  <span
                    key={l}
                    className="shrink-0 text-[9px] leading-none px-1 py-[3px] rounded font-medium whitespace-nowrap"
                    style={{ backgroundColor: bg, color: isLightColor(bg) ? '#1f2937' : '#ffffff' }}
                  >
                    {l}
                  </span>
                )
              })}
              {labels.length > 4 && <span className="text-[9px] text-gray-400 shrink-0">+{labels.length - 4}</span>}
              {/* 하위 진행 */}
              {subStats && subStats.total > 0 && (
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium border whitespace-nowrap ${
                    subStats.done === subStats.total
                      ? 'bg-green-50 text-green-600 border-green-100'
                      : 'bg-gray-50 text-gray-500 border-gray-100'
                  }`}
                >
                  {subStats.done}/{subStats.total}
                </span>
              )}
              {/* 하위 태스크 추가 — 호버 시 표시 */}
              {!isSub && onSubQuickCreate && (
                <button
                  onClick={e => { e.stopPropagation(); setSubQuickParentId(task.id); setSubQuickTitle('') }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-100 transition-all whitespace-nowrap"
                  title="하위 태스크 추가"
                >
                  sub +
                </button>
              )}
            </div>
            <div className="w-8 shrink-0 flex items-center justify-center">
              {task.memo && (
                <button
                  onClick={e => { e.stopPropagation(); onEdit(task) }}
                  onMouseEnter={e => setMemoHover({ taskId: task.id, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setMemoHover(null)}
                  className="text-indigo-400 hover:text-indigo-600 transition-colors"
                >
                  <StickyNote size={12} />
                </button>
              )}
            </div>
            <div className="w-28 shrink-0 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[task.status] }} />
              <span className="text-[11px] text-gray-600 truncate">{STATUS_LABEL[task.status]}</span>
            </div>
            <div className="w-32 shrink-0 flex items-center gap-1.5">
              {assigneeName && (
                <>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[11px] text-gray-500 truncate">{assigneeName}</span>
                </>
              )}
            </div>
            <div className={`w-24 shrink-0 text-right pr-2 text-[11px] tabular-nums ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{fmtRange(task.start_date ?? null, task.due_date)}</div>
          </div>
          )
        }
        // 부모의 sub들 다음에 인라인 sub 퀵 등록 입력 (호버 sub+ 클릭 시 노출)
        if (subQuickParentId === parent.id) {
          rows.push(
            <div key={`${parent.id}-sub-quick`} className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-50 bg-indigo-50/30">
              <div className="w-6 shrink-0 flex items-center">
                <CornerDownRight size={11} className="text-indigo-400 mr-0.5" />
              </div>
              <div className="flex-1 pl-4 flex items-center gap-1.5">
                <Plus size={10} className="text-indigo-400 shrink-0" />
                <input
                  autoFocus
                  value={subQuickTitle}
                  onChange={e => setSubQuickTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitSubQuickAdd(parent.id) }
                    if (e.key === 'Escape') cancelSubQuickAdd()
                  }}
                  onBlur={() => { if (!subQuickTitle.trim()) cancelSubQuickAdd() }}
                  placeholder="하위 태스크 제목 후 Enter, Esc 취소"
                  className="flex-1 text-[11px] outline-none placeholder:text-gray-300 bg-transparent text-gray-800"
                />
              </div>
            </div>
          )
        }
        return rows
      })}

      {/* 인라인 퀵 추가 — 결과가 있을 때만 표시 */}
      {onQuickCreate && renderList.length > 0 && (quickAddOpen ? (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-50 bg-indigo-50/30">
          <Plus size={11} className="text-indigo-400 shrink-0" />
          <input
            autoFocus
            value={quickAddTitle}
            onChange={e => setQuickAddTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitQuickCreate() }
              if (e.key === 'Escape') { setQuickAddOpen(false); setQuickAddTitle('') }
            }}
            onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddOpen(false); setQuickAddTitle('') } }}
            placeholder="제목 입력 후 Enter, Esc로 취소 (기본 To-Do)"
            className="flex-1 text-xs outline-none placeholder:text-gray-300 bg-transparent text-gray-800"
          />
          <span className="text-[10px] text-gray-300 shrink-0">상세 설정은 행 클릭</span>
        </div>
      ) : (
        <button
          onClick={() => { setQuickAddOpen(true); setQuickAddTitle('') }}
          className="flex items-center gap-1.5 px-4 py-2 w-full text-left text-xs text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-colors border-b border-gray-50"
        >
          <Plus size={11} /> 태스크 추가
        </button>
      ))}

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
