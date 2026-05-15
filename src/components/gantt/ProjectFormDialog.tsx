'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon, ChevronDown, X, Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { getProjectHistory } from '@/lib/gantt-service'
import type { GanttCategory, GanttProject, GanttStatus, Priority, ProjectHistoryEntry } from '@/types'
import { PRIORITY_OPTIONS, PRIORITY_META, PriorityBars } from '@/app/(app)/tasks/_constants'

function AutocompleteInput({ value, onChange, suggestions, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close])

  return (
    <div ref={containerRef} className="relative">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') close() }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-gray-200 rounded-md shadow-lg py-0.5 max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <li
              key={s}
              onPointerDown={e => { e.preventDefault(); onChange(s); close() }}
              className="px-2.5 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── 수정 이력 인라인 섹션 ────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  name: '이름', status: '상태', start_date: '시작일', end_date: '종료일',
  start_month: '시작일', end_month: '종료일', team: '팀', pm: 'PM', category: '카테고리',
}
const STATUS_LABELS: Record<string, string> = {
  'to-do': 'To-Do', 'in-progress': 'In Progress', 'pending': 'Pending', 'backlog': 'Backlog', 'done': 'Done',
}
function fmtHistVal(field: string, value: string | null): string {
  if (value === null || value === '') return '없음'
  if (field === 'status') return STATUS_LABELS[value] ?? value
  if (field === 'start_date' || field === 'end_date') { const [y, m, d] = value.split('-'); return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일` }
  if (field === 'start_month' || field === 'end_month') { const [y, m] = value.split('-'); return `${y}년 ${parseInt(m)}월` }
  return value
}
function fmtHistDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function groupByTime(entries: ProjectHistoryEntry[]): ProjectHistoryEntry[][] {
  const groups: ProjectHistoryEntry[][] = []; let cur: ProjectHistoryEntry[] = []
  for (const entry of entries) {
    if (cur.length === 0) cur.push(entry)
    else if (Math.abs(new Date(cur[0].changed_at).getTime() - new Date(entry.changed_at).getTime()) < 10_000) cur.push(entry)
    else { groups.push(cur); cur = [entry] }
  }
  if (cur.length > 0) groups.push(cur)
  return groups
}

function ProjectHistorySection({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<ProjectHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getProjectHistory(projectId).then(setEntries).catch(console.error).finally(() => setLoading(false))
  }, [projectId])

  const groups = groupByTime(entries)

  return (
    <div className="flex flex-col h-full">
      {loading ? (
        <div className="flex items-center justify-center h-20 text-gray-400 text-xs">로딩 중...</div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-28 text-gray-300 text-xs gap-1">
          <Clock size={20} className="opacity-30" />
          수정 이력이 없습니다
        </div>
      ) : groups.map((group, gi) => (
        <div key={gi} className="px-5 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors">
          <div className="text-[10px] text-gray-400 font-medium mb-1.5 tabular-nums">{fmtHistDate(group[0].changed_at)}</div>
          <div className="space-y-1">
            {group.map(entry => (
              <div key={entry.id} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-gray-500 font-semibold w-12 shrink-0">{FIELD_LABELS[entry.field_name] ?? entry.field_name}</span>
                <span className="text-[11px] text-gray-400 line-through">{fmtHistVal(entry.field_name, entry.old_value)}</span>
                <span className="text-[10px] text-gray-300">→</span>
                <span className="text-[11px] text-gray-700 font-medium">{fmtHistVal(entry.field_name, entry.new_value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const STATUSES: { value: GanttStatus; label: string }[] = [
  { value: 'to-do',       label: 'To-Do' },
  { value: 'in-progress', label: 'In-Progress' },
  { value: 'pending',     label: 'Pending' },
  { value: 'backlog',     label: 'Backlog' },
  { value: 'done',        label: 'Done' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSave: (fields: {
    categoryId: string
    parentId: string | null
    name: string
    status: GanttStatus
    start_date: string | null
    end_date: string | null
    team: string | null
    pm: string | null
    memo: string | null
    priority: Priority
  }) => Promise<void>
  categories: GanttCategory[]
  defaultCategoryId?: string
  editProject?: GanttProject | null
  onDelete?: (id: string) => void
  allTeams?: string[]
  allPMs?: string[]
}

function toDate(dateStr: string | null | undefined): Date | undefined {
  if (!dateStr) return undefined
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? undefined : d
}

function toDateStr(d: Date | undefined): string | null {
  if (!d) return null
  return format(d, 'yyyy-MM-dd')
}

function DatePickerButton({ value, onChange, placeholder, disabledDates }: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder: string
  disabledDates?: (date: Date) => boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs h-8 font-normal transition-colors hover:bg-gray-50 focus:outline-none focus:border-indigo-300">
        <CalendarIcon size={13} className="text-gray-400 shrink-0" />
        {value
          ? <span className="text-gray-700">{format(value, 'yyyy.MM.dd', { locale: ko })}</span>
          : <span className="text-gray-300">{placeholder}</span>
        }
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value}
          onSelect={d => { onChange(d); setOpen(false) }}
          locale={ko}
          disabled={disabledDates}
        />
      </PopoverContent>
    </Popover>
  )
}

export function ProjectFormDialog({ open, onClose, onSave, categories, defaultCategoryId, editProject, onDelete, allTeams = [], allPMs = [] }: Props) {
  const [categoryId, setCategoryId] = useState('')
  const [name, setName]             = useState('')
  const [status, setStatus]         = useState<GanttStatus>('to-do')
  const [startDate, setStartDate]   = useState<Date | undefined>(undefined)
  const [endDate, setEndDate]       = useState<Date | undefined>(undefined)
  const [team, setTeam]             = useState('')
  const [pm, setPm]                 = useState('')
  const [memo, setMemo]             = useState('')
  const [priority, setPriority]     = useState<Priority>(2)
  const [loading, setLoading]       = useState(false)
  const [tab, setTab]               = useState<'info' | 'history'>('info')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setTab('info'); setTimeout(() => nameRef.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    if (editProject) {
      setCategoryId(editProject.category_id)
      setName(editProject.name)
      setStatus(editProject.status)
      setStartDate(toDate(editProject.start_date))
      setEndDate(toDate(editProject.end_date))
      setTeam(editProject.team ?? '')
      setPm(editProject.pm ?? '')
      setMemo(editProject.memo ?? '')
      setPriority(editProject.priority ?? 0)
    } else {
      setCategoryId(defaultCategoryId ?? categories[0]?.id ?? '')
      setName(''); setStatus('to-do'); setPriority(2)
      setStartDate(undefined); setEndDate(undefined)
      setTeam(''); setPm(''); setMemo('')
    }
  }, [editProject, open, defaultCategoryId, categories])

  const dateError = startDate && endDate && startDate > endDate
    ? '종료일은 시작일 이후여야 합니다.' : null

  const isValid = name.trim().length > 0 && !!categoryId && !dateError

  async function handleSave() {
    if (!isValid) return
    setLoading(true)
    try {
      await onSave({
        categoryId,
        parentId: editProject?.parent_id ?? null,
        name: name.trim(),
        status,
        start_date: toDateStr(startDate),
        end_date: toDateStr(endDate),
        team: team.trim() || null,
        pm: pm.trim() || null,
        memo: memo.trim() || null,
        priority,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div
        className={`absolute right-0 top-0 h-full w-[440px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="shrink-0 border-b">
          <div className="flex items-center px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-800 flex-1">
              {editProject ? '프로젝트 수정' : '프로젝트 추가'}
            </h2>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
              <X size={16} />
            </button>
          </div>
          {editProject && (
            <div className="flex px-5 gap-4">
              <button
                onClick={() => setTab('info')}
                className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === 'info' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                정보
              </button>
              <button
                onClick={() => setTab('history')}
                className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === 'history' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                이력
              </button>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        {tab === 'info' ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* 이름 */}
          <input
            ref={nameRef}
            className="w-full text-sm font-medium text-gray-800 border-b border-gray-200 focus:border-indigo-400 outline-none pb-1 placeholder:text-gray-300"
            placeholder="프로젝트 이름"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />

          {/* 카테고리 + 상태 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">카테고리</label>
              <div className="relative mt-1.5">
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-indigo-300 appearance-none bg-white text-gray-700"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as GanttStatus)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-indigo-300 appearance-none bg-white text-gray-700"
                >
                  {STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 시작일 / 종료일 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">시작일</label>
                <div className="mt-1.5">
                  <DatePickerButton
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="날짜 선택"
                    disabledDates={endDate ? d => d > endDate : undefined}
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">종료일</label>
                <div className="mt-1.5">
                  <DatePickerButton
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="날짜 선택"
                    disabledDates={startDate ? d => d < startDate : undefined}
                  />
                </div>
              </div>
            </div>
            {dateError && (
              <p className="text-[11px] text-red-500">{dateError}</p>
            )}
          </div>

          {/* 담당팀 / PM */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">담당팀</label>
              <AutocompleteInput
                className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-indigo-300 placeholder:text-gray-300 text-gray-700"
                placeholder="예: 개발팀"
                value={team}
                onChange={setTeam}
                suggestions={allTeams.filter(Boolean)}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">PM</label>
              <AutocompleteInput
                className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-indigo-300 placeholder:text-gray-300 text-gray-700"
                placeholder="예: 홍길동"
                value={pm}
                onChange={setPm}
                suggestions={allPMs.filter(Boolean)}
              />
            </div>
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">우선순위</label>
            <div className="flex items-center gap-1 mt-1.5">
              {PRIORITY_OPTIONS.map(opt => {
                const meta = PRIORITY_META[opt.value]
                const active = priority === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex items-center gap-0.5 text-[11px] px-2 py-1 rounded border transition-colors
                      ${active
                        ? 'font-medium border-current'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                    style={active && opt.value > 0 ? { color: meta.color, borderColor: meta.color, backgroundColor: meta.color + '14' } : {}}
                  >
                    {opt.value > 0 && <PriorityBars priority={opt.value} />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">메모</label>
            <textarea
              className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-2 outline-none focus:border-indigo-300 placeholder:text-gray-300 text-gray-700 resize-none"
              placeholder="메모를 입력하세요"
              rows={3}
              value={memo}
              onChange={e => setMemo(e.target.value)}
            />
          </div>

        </div>
        ) : (
        <div className="flex-1 overflow-y-auto">
          {editProject && <ProjectHistorySection projectId={editProject.id} />}
        </div>
        )}

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t flex items-center gap-2">
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || loading}
            className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '저장 중...' : editProject ? '수정' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
