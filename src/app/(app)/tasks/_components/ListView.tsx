'use client'

import { useState } from 'react'
import { Circle, CheckCircle2, StickyNote, CornerDownRight, Paperclip, Plus, Check } from 'lucide-react'
import type { GanttTask, TaskStatus } from '@/types'
import { fmtRange, isOverdue, overdueDays, daysDiff, isLightColor } from '../_utils'
import { MemoTooltip } from '@/components/MemoTooltip'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ABBR, PriorityBars } from '../_constants'
import { labelColor } from './TaskDetailDrawer'

export type SortKey = 'title' | 'status' | 'priority' | 'assignee' | 'due_date' | 'start_date' | 'created_at' | 'updated_at'

const STATUS_ORDER: Record<TaskStatus, number> = { backlog: 0, 'to-do': 1, 'in-progress': 2, done: 3, pending: 4 }

function SortBtn({
  col, label, sortKey, sortDir, onToggle,
}: {
  col: SortKey
  label: string
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onToggle: (k: SortKey) => void
}) {
  const active = sortKey === col
  return (
    <button
      onClick={() => onToggle(col)}
      className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider hover:text-muted-foreground transition-colors
        ${active ? 'text-accent-foreground' : 'text-ink-400'}`}
    >
      {label}
      <span className={`text-[8px] ${active ? '' : 'opacity-30'}`}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )
}

interface Props {
  tasks: GanttTask[]
  assigneeColorMap: Map<string, string>
  getAssigneeKey: (t: GanttTask) => string
  onEdit: (t: GanttTask) => void
  onStatusChange: (id: string, s: TaskStatus) => void
  emptyMessage?: string
  onQuickCreate?: (title: string, status: TaskStatus) => Promise<void>
  onSubQuickCreate?: (parentId: string, title: string) => Promise<void>
  selectionMode?: boolean
  selectedIds?: Set<string>
  onSelect?: (id: string) => void
}

export function ListView({ tasks, assigneeColorMap, getAssigneeKey, onEdit, onStatusChange, emptyMessage = '태스크가 없어요', onQuickCreate, onSubQuickCreate, selectionMode, selectedIds, onSelect }: Props) {
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
    if (sortKey === 'due_date' || sortKey === 'start_date') {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (!av && !bv) return 0
      if (!av) return 1
      if (!bv) return -1
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted shrink-0">
        <div className="w-6 shrink-0 flex items-center justify-center">
          {selectionMode && (
            <button
              onClick={() => {
                const allIds = tasks.map(t => t.id)
                const allSelected = allIds.every(id => selectedIds?.has(id))
                allIds.forEach(id => {
                  const isSelected = selectedIds?.has(id) ?? false
                  if (allSelected ? isSelected : !isSelected) onSelect?.(id)
                })
              }}
              className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                tasks.length > 0 && tasks.every(t => selectedIds?.has(t.id))
                  ? 'bg-lilac-500 border-lilac-500'
                  : 'border-border hover:border-lilac-400'
              }`}
              title="전체 선택/해제"
            >
              {tasks.length > 0 && tasks.every(t => selectedIds?.has(t.id)) && <Check size={8} className="text-white" strokeWidth={3} />}
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0"><SortBtn col="title" label="태스크" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></div>
        <div className="w-8 shrink-0 text-[10px] font-semibold text-ink-400 uppercase tracking-wider">메모</div>
        <div className="w-8 shrink-0"><SortBtn col="priority" label="우선" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></div>
        <div className="w-28 shrink-0"><SortBtn col="status" label="상태" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></div>
        <div className="w-32 shrink-0"><SortBtn col="assignee" label="담당자" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></div>
        <div className="w-24 shrink-0 text-right pr-2"><SortBtn col="due_date" label="일정" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} /></div>
      </div>

      <div data-scrolltop className="flex-1 overflow-y-auto [scrollbar-gutter:stable] bg-card">
      {renderList.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-ink-400 text-xs">{emptyMessage}</div>
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
          const color     = assigneeColorMap.get(getAssigneeKey(task)) ?? 'var(--color-ink-300)'
          const assigneeName = task.type === 'mine' ? '내 할일' : (task.assignee ?? '')
          const subStats  = !isSub ? subStatsByParent.get(task.id) : undefined
          const labels    = task.labels ?? []
          rows.push(
          <div
            key={task.id}
            onClick={() => selectionMode ? onSelect?.(task.id) : onEdit(task)}
            className={`group flex items-center gap-4 px-4 py-2 border-b border-ink-150 hover:bg-muted transition-colors cursor-pointer ${isDone ? 'opacity-55' : ''} ${isSub ? 'bg-muted/40' : ''} ${selectionMode && selectedIds?.has(task.id) ? 'bg-lilac-50/40' : ''} ${overdue && !isSub ? 'bg-status-late/5' : ''}`}
          >
            <div className="w-6 shrink-0 flex items-center">
              {selectionMode ? (
                <button
                  onClick={e => { e.stopPropagation(); onSelect?.(task.id) }}
                  className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${selectedIds?.has(task.id) ? 'bg-lilac-500 border-lilac-500' : 'border-border hover:border-lilac-400'}`}
                >
                  {selectedIds?.has(task.id) && <Check size={8} className="text-white" strokeWidth={3} />}
                </button>
              ) : (
                <>
                  {isSub && <CornerDownRight size={11} className="text-ink-300 mr-0.5" />}
                  <button
                    onClick={e => { e.stopPropagation(); onStatusChange(task.id, task.status === 'done' ? 'to-do' : 'done') }}
                    className="shrink-0"
                  >
                    {isDone
                      ? <CheckCircle2 size={16} className="text-mint-500" />
                      : <Circle size={16} className="text-ink-300 hover:text-lilac-400 transition-colors" />}
                  </button>
                </>
              )}
            </div>
            <div className={`flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden ${isSub ? 'pl-4' : ''}`}>
              <span className={`text-xs truncate min-w-0 ${isDone ? 'line-through text-ink-400' : 'text-foreground'}`}>{task.title}</span>
              {overdue && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-status-late/10 text-status-late font-medium border border-status-late/15 whitespace-nowrap">
                  지연 {overdueDays(task.due_date)}일
                </span>
              )}
              {noUpdate && !overdue && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-coral-100 text-coral-500 font-medium border border-coral-100 whitespace-nowrap">
                  {daysDiff(task.updated_at)}일 무응답
                </span>
              )}
              {/* 연결 프로젝트 */}
              {task.projects && task.projects.length > 0 && (
                <>
                  <span className="text-ink-200 text-[10px] shrink-0">·</span>
                  {task.projects.slice(0, 2).map(p => (
                    <span key={p.id} className="flex items-center gap-0.5 text-[10px] bg-muted text-ink-400 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                      <Paperclip size={8} className="shrink-0" />{p.name}
                    </span>
                  ))}
                  {task.projects.length > 2 && <span className="text-[10px] text-ink-400 shrink-0">+{task.projects.length - 2}</span>}
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
              {labels.length > 4 && <span className="text-[9px] text-ink-400 shrink-0">+{labels.length - 4}</span>}
              {/* 하위 진행 */}
              {subStats && subStats.total > 0 && (
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium border whitespace-nowrap ${
                    subStats.done === subStats.total
                      ? 'bg-mint-100 text-mint-500 border-mint-100'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  {subStats.done}/{subStats.total}
                </span>
              )}
              {/* 하위 태스크 추가 — 호버 시 표시 */}
              {!isSub && onSubQuickCreate && (
                <button
                  onClick={e => { e.stopPropagation(); setSubQuickParentId(task.id); setSubQuickTitle('') }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded border border-dashed border-ink-300 text-muted-foreground hover:text-foreground hover:border-ink-400 hover:bg-muted transition-all whitespace-nowrap"
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
                  className="text-lilac-400 hover:text-accent-foreground transition-colors"
                >
                  <StickyNote size={12} />
                </button>
              )}
            </div>
            <div className="w-8 shrink-0 flex items-center justify-center" title={task.priority ? ['없음','낮음','보통','높음'][task.priority] : ''}>
              <PriorityBars priority={task.priority} />
            </div>
            <div className="w-28 shrink-0 flex items-center gap-1.5">
              <span
                className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                style={{ backgroundColor: STATUS_COLOR[task.status] }}
              >
                {STATUS_ABBR[task.status]}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">{STATUS_LABEL[task.status]}</span>
            </div>
            <div className="w-32 shrink-0 flex items-center gap-1.5">
              {assigneeName && (
                <>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[11px] text-muted-foreground truncate">{assigneeName}</span>
                </>
              )}
            </div>
            <div className={`w-24 shrink-0 text-right pr-2 text-[11px] tabular-nums ${overdue ? 'text-status-late font-medium' : 'text-ink-400'}`}>{fmtRange(task.start_date ?? null, task.due_date)}</div>
          </div>
          )
        }
        // 부모의 sub들 다음에 인라인 sub 퀵 등록 입력 (호버 sub+ 클릭 시 노출)
        if (subQuickParentId === parent.id) {
          rows.push(
            <div key={`${parent.id}-sub-quick`} className="flex items-center gap-1.5 px-4 py-2 border-b border-ink-150 bg-accent/30">
              <div className="w-6 shrink-0 flex items-center">
                <CornerDownRight size={11} className="text-lilac-400 mr-0.5" />
              </div>
              <div className="flex-1 pl-4 flex items-center gap-1.5">
                <Plus size={10} className="text-lilac-400 shrink-0" />
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
                  className="flex-1 text-[11px] outline-none placeholder:text-ink-300 bg-transparent text-foreground"
                />
              </div>
            </div>
          )
        }
        return rows
      })}

      {/* 인라인 퀵 추가 — 결과가 있을 때만 표시 */}
      {onQuickCreate && renderList.length > 0 && (quickAddOpen ? (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-ink-150 bg-accent/30">
          <Plus size={11} className="text-lilac-400 shrink-0" />
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
            className="flex-1 text-xs outline-none placeholder:text-ink-300 bg-transparent text-foreground"
          />
          <span className="text-[10px] text-ink-300 shrink-0">상세 설정은 행 클릭</span>
        </div>
      ) : (
        <button
          onClick={() => { setQuickAddOpen(true); setQuickAddTitle('') }}
          className="flex items-center gap-1.5 px-4 py-2 w-full text-left text-xs text-ink-400 hover:text-foreground hover:bg-muted transition-colors border-b border-ink-150"
        >
          <Plus size={11} /> 태스크 추가
        </button>
      ))}

      {/* 메모 hover 툴팁 */}
      {memoHover && (() => {
        const t = tasks.find(x => x.id === memoHover.taskId)
        if (!t?.memo) return null
        return <MemoTooltip memo={t.memo} x={memoHover.x} y={memoHover.y} />
      })()}
      </div>
    </div>
  )
}
