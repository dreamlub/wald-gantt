'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { GanttCategory, GanttProject, GanttStatus } from '@/types'

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
  }) => Promise<void>
  categories: GanttCategory[]
  defaultCategoryId?: string
  editProject?: GanttProject | null
  onDelete?: (id: string) => void
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

export function ProjectFormDialog({ open, onClose, onSave, categories, defaultCategoryId, editProject, onDelete }: Props) {
  const [categoryId, setCategoryId] = useState('')
  const [name, setName]             = useState('')
  const [status, setStatus]         = useState<GanttStatus>('to-do')
  const [startDate, setStartDate]   = useState<Date | undefined>(undefined)
  const [endDate, setEndDate]       = useState<Date | undefined>(undefined)
  const [team, setTeam]             = useState('')
  const [pm, setPm]                 = useState('')
  const [memo, setMemo]             = useState('')
  const [loading, setLoading]       = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => nameRef.current?.focus(), 50)
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
    } else {
      setCategoryId(defaultCategoryId ?? categories[0]?.id ?? '')
      setName(''); setStatus('to-do')
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
        <div className="flex items-center px-5 py-4 border-b shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 flex-1">
            {editProject ? '프로젝트 수정' : '프로젝트 추가'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
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
              <input
                className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-indigo-300 placeholder:text-gray-300 text-gray-700"
                placeholder="예: 개발팀"
                value={team}
                onChange={e => setTeam(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">PM</label>
              <input
                className="mt-1.5 w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 outline-none focus:border-indigo-300 placeholder:text-gray-300 text-gray-700"
                placeholder="예: 홍길동"
                value={pm}
                onChange={e => setPm(e.target.value)}
              />
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
