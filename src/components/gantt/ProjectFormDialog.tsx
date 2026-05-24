'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon, ChevronDown, X, Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { getProjectHistory } from '@/lib/gantt-service'
import type { GanttCategory, GanttProject, GanttStatus, Priority, ProjectHistoryEntry } from '@/types'
import { PRIORITY_OPTIONS, PRIORITY_META, PriorityBars } from '@/app/(app)/tasks/_constants'
import { toDate, toDateStr, formatHistValue, formatHistDate } from '@/lib/gantt-utils'
import { AutocompleteInput } from '@/components/AutocompleteInput'
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from '@/components/ui/drawer'

// ── 수정 이력 인라인 섹션 ────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  name: '이름', status: '상태', start_date: '시작일', end_date: '종료일',
  start_month: '시작일', end_month: '종료일', team: '팀', pm: 'PM', category: '카테고리',
}
const fmtHistVal = formatHistValue
const fmtHistDate = formatHistDate
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

  // projectId 변경 시 히스토리 fetch (외부 fetch → setState 의도된 패턴)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getProjectHistory(projectId).then(setEntries).catch(console.error).finally(() => setLoading(false))
  }, [projectId])

  const groups = groupByTime(entries)

  return (
    <div className="flex flex-col h-full">
      {loading ? (
        <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">로딩 중...</div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-28 text-ink-300 text-xs gap-1">
          <Clock size={20} className="opacity-30" />
          수정 이력이 없습니다
        </div>
      ) : groups.map((group, gi) => (
        <div key={gi} className="px-5 py-3 border-b last:border-0 hover:bg-muted transition-colors">
          <div className="text-3xs text-muted-foreground font-medium mb-1.5 tabular-nums">{fmtHistDate(group[0].changed_at)}</div>
          <div className="space-y-1">
            {group.map(entry => (
              <div key={entry.id} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-2xs text-muted-foreground font-semibold w-12 shrink-0">{FIELD_LABELS[entry.field_name] ?? entry.field_name}</span>
                <span className="text-2xs text-muted-foreground line-through">{fmtHistVal(entry.field_name, entry.old_value)}</span>
                <span className="text-3xs text-ink-300">→</span>
                <span className="text-2xs text-foreground font-medium">{fmtHistVal(entry.field_name, entry.new_value)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const STATUSES: { value: GanttStatus; label: string }[] = [
  { value: 'backlog',     label: 'Backlog' },
  { value: 'to-do',       label: 'To-Do' },
  { value: 'in-progress', label: 'In-Progress' },
  { value: 'done',        label: 'Done' },
  { value: 'pending',     label: 'Pending' },
]

type DialogTab = 'info' | 'memo' | 'history'

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
  initialTab?: DialogTab
  onDelete?: (id: string) => void
  allTeams?: string[]
  allPMs?: string[]
  initialName?: string
  initialMemo?: string
}

function parseDateText(raw: string): Date | null {
  const s = raw.trim().replace(/[-/]/g, '.')
  // YYYY.MM.DD
  const full = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/)
  if (full) {
    const d = new Date(+full[1], +full[2] - 1, +full[3])
    if (!isNaN(d.getTime()) && d.getMonth() === +full[2] - 1) return d
  }
  // MM.DD → 올해 연도
  const short = s.match(/^(\d{1,2})\.(\d{1,2})$/)
  if (short) {
    const d = new Date(new Date().getFullYear(), +short[1] - 1, +short[2])
    if (!isNaN(d.getTime()) && d.getMonth() === +short[1] - 1) return d
  }
  return null
}

function DatePickerButton({ value, onChange, placeholder, disabledDates }: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder: string
  disabledDates?: (date: Date) => boolean
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value ? format(value, 'yyyy.MM.dd') : '')

  // 달력 선택 등 외부에서 value가 바뀌면 input 텍스트 동기화
  useEffect(() => {
    setText(value ? format(value, 'yyyy.MM.dd') : '')
  }, [value])

  function commit() {
    if (!text.trim()) { onChange(undefined); return }
    const parsed = parseDateText(text)
    if (parsed) {
      onChange(parsed)
      setText(format(parsed, 'yyyy.MM.dd'))
    } else {
      // 잘못된 입력 → 이전 값으로 복원
      setText(value ? format(value, 'yyyy.MM.dd') : '')
    }
  }

  return (
    <div className="flex items-center h-8 rounded-lg border border-border bg-card focus-within:border-lilac-300 transition-colors overflow-hidden">
      <input
        className="flex-1 min-w-0 text-xs px-2.5 bg-transparent outline-none text-foreground placeholder:text-ink-300 tabular-nums"
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="shrink-0 px-2 h-full flex items-center text-muted-foreground hover:text-foreground border-l border-border transition-colors focus:outline-none">
          <CalendarIcon size={13} />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value ?? new Date()}
            onSelect={d => { onChange(d); setOpen(false) }}
            locale={ko}
            disabled={disabledDates}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function ProjectFormDialog({ open, onClose, onSave, categories, defaultCategoryId, editProject, initialTab = 'info', allTeams = [], allPMs = [], initialName, initialMemo }: Props) {
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
  const [tab, setTab]               = useState<DialogTab>('info')
  const nameRef = useRef<HTMLInputElement>(null)
  const memoRef = useRef<HTMLTextAreaElement>(null)

  // open 시 초기 탭 설정 + 포커스 (외부 트리거 기반 → 의도된 setState)
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab(initialTab)
      setTimeout(() => {
        if (initialTab === 'memo') memoRef.current?.focus()
        else nameRef.current?.focus()
      }, 50)
    }
  }, [open, initialTab])

  // editProject prop 동기화 (props 기반 폼 초기화 → 의도된 setState)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setName(initialName ?? ''); setStatus('to-do'); setPriority(2)
      setStartDate(undefined); setEndDate(undefined)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setTeam(''); setPm(''); setMemo(initialMemo ?? '')
    }
    /* eslint-enable react-hooks/set-state-in-effect */
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
    <Drawer open={open} onClose={onClose} width={440}>
        {/* Header */}
        <DrawerHeader>
          <div className="flex items-center px-5 h-12 gap-1">
            <h2 className="text-xs font-semibold text-foreground flex-1">
              {editProject ? '프로젝트 수정' : '프로젝트 추가'}
            </h2>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded">
              <X size={16} />
            </button>
          </div>
          <div className="flex px-5 gap-4">
            <button
              onClick={() => setTab('info')}
              className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                tab === 'info' ? 'border-lilac-500 text-lilac-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              정보
            </button>
            <button
              onClick={() => setTab('memo')}
              className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1 ${
                tab === 'memo' ? 'border-lilac-500 text-lilac-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              메모
              {memo.trim() && (
                <span className="w-1 h-1 rounded-full bg-lilac-400" />
              )}
            </button>
            {editProject && (
              <button
                onClick={() => setTab('history')}
                className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === 'history' ? 'border-lilac-500 text-lilac-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                이력
              </button>
            )}
          </div>
        </DrawerHeader>

        {/* Scrollable content */}
        {tab === 'info' ? (
        <form
          className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4"
          autoComplete="off"
          onSubmit={e => e.preventDefault()}
        >
          {/* 이름 */}
          <input
            ref={nameRef}
            name="project-name"
            autoComplete="off"
            className="w-full text-xs font-medium text-foreground border-b border-border focus:border-lilac-400 outline-none pb-1 placeholder:text-ink-300"
            placeholder="프로젝트 이름"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />

          {/* 카테고리 + 상태 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">카테고리</label>
              <div className="relative mt-1.5">
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="w-full text-xs border border-border rounded px-2 py-1.5 outline-none focus:border-lilac-300 appearance-none bg-card text-foreground"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="flex-1">
              <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">상태</label>
              <div className="relative mt-1.5">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as GanttStatus)}
                  className="w-full text-xs border border-border rounded px-2 py-1.5 outline-none focus:border-lilac-300 appearance-none bg-card text-foreground"
                >
                  {STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 시작일 / 종료일 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">시작일</label>
                <div className="mt-1.5">
                  <DatePickerButton
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="MM/DD 또는 YYYY.MM.DD"
                    disabledDates={endDate ? d => d > endDate : undefined}
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">종료일</label>
                <div className="mt-1.5">
                  <DatePickerButton
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="MM/DD 또는 YYYY.MM.DD"
                    disabledDates={startDate ? d => d < startDate : undefined}
                  />
                </div>
              </div>
            </div>
            {dateError && (
              <p className="text-2xs text-status-late">{dateError}</p>
            )}
          </div>

          {/* 담당팀 / PM */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">담당팀</label>
              <AutocompleteInput
                name="project-team"
                className="mt-1.5 w-full text-xs border border-border rounded px-2.5 py-1.5 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-foreground"
                placeholder="예: 개발팀"
                value={team}
                onChange={setTeam}
                suggestions={allTeams.filter(Boolean)}
              />
            </div>
            <div className="flex-1">
              <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">PM</label>
              <AutocompleteInput
                name="project-pm"
                className="mt-1.5 w-full text-xs border border-border rounded px-2.5 py-1.5 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-foreground"
                placeholder="예: 홍길동"
                value={pm}
                onChange={setPm}
                suggestions={allPMs.filter(Boolean)}
              />
            </div>
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">우선순위</label>
            <div className="flex items-center gap-1 mt-1.5">
              {PRIORITY_OPTIONS.map(opt => {
                const meta = PRIORITY_META[opt.value]
                const active = priority === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`flex items-center gap-0.5 text-2xs px-2 py-1 rounded border transition-colors
                      ${active
                        ? 'font-medium border-current'
                        : 'border-border text-muted-foreground hover:border-ink-300'}`}
                    style={active && opt.value > 0 ? { color: meta.color, borderColor: meta.color, backgroundColor: meta.color + '14' } : {}}
                  >
                    {opt.value > 0 && <PriorityBars priority={opt.value} />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

        </form>
        ) : tab === 'memo' ? (
        <DrawerBody scrollable={false} className="p-5">
          <textarea
            ref={memoRef}
            name="project-memo"
            autoComplete="off"
            className="w-full h-full text-xs border border-border rounded p-3 outline-none focus:border-lilac-300 placeholder:text-ink-300 text-foreground resize-none leading-relaxed"
            placeholder="메모를 입력하세요"
            value={memo}
            onChange={e => setMemo(e.target.value)}
          />
        </DrawerBody>
        ) : (
        <DrawerBody>
          {editProject && <ProjectHistorySection projectId={editProject.id} />}
        </DrawerBody>
        )}

        {/* Footer */}
        <DrawerFooter>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || loading}
            className="px-4 py-1.5 text-xs bg-foreground text-background rounded font-medium hover:bg-ink-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '저장 중...' : editProject ? '수정' : '저장'}
          </button>
        </DrawerFooter>
    </Drawer>
  )
}
