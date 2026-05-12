'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { GanttCategory, GanttProject, GanttStatus } from '@/types'

const STATUSES: { value: GanttStatus; label: string }[] = [
  { value: 'to-do', label: 'To-Do' },
  { value: 'in-progress', label: 'In-Progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'done', label: 'Done' },
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
  }) => Promise<void>
  categories: GanttCategory[]
  defaultCategoryId?: string
  editProject?: GanttProject | null
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

function DatePickerButton({ value, onChange, placeholder }: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex w-full items-center justify-start gap-1.5 rounded-lg border border-border bg-background px-2 text-xs h-8 font-normal transition-colors hover:bg-muted"
      >
        <CalendarIcon size={13} className="text-gray-400 shrink-0" />
        {value ? format(value, 'yyyy.MM.dd', { locale: ko }) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value}
          onSelect={d => { onChange(d); setOpen(false) }}
          locale={ko}
        />
      </PopoverContent>
    </Popover>
  )
}

export function ProjectFormDialog({ open, onClose, onSave, categories, defaultCategoryId, editProject }: Props) {
  const [categoryId, setCategoryId] = useState('')
  const [name, setName]             = useState('')
  const [status, setStatus]         = useState<GanttStatus>('to-do')
  const [startDate, setStartDate]   = useState<Date | undefined>(undefined)
  const [endDate, setEndDate]       = useState<Date | undefined>(undefined)
  const [team, setTeam]             = useState('')
  const [pm, setPm]                 = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (editProject) {
      setCategoryId(editProject.category_id)
      setName(editProject.name)
      setStatus(editProject.status)
      setStartDate(toDate(editProject.start_date))
      setEndDate(toDate(editProject.end_date))
      setTeam(editProject.team ?? '')
      setPm(editProject.pm ?? '')
    } else {
      setCategoryId(defaultCategoryId ?? categories[0]?.id ?? '')
      setName(''); setStatus('to-do')
      setStartDate(undefined); setEndDate(undefined)
      setTeam(''); setPm('')
    }
  }, [editProject, open, defaultCategoryId, categories])

  async function handleSave() {
    if (!name.trim() || !categoryId) return
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
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editProject ? '프로젝트 수정' : '프로젝트 추가'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>카테고리</Label>
            <Select value={categoryId} onValueChange={v => setCategoryId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="카테고리 선택">
                  {categoryId && (() => {
                    const cat = categories.find(c => c.id === categoryId)
                    return cat ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </span>
                    ) : null
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>이름</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="프로젝트명"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          <div className="space-y-1.5">
            <Label>상태</Label>
            <Select value={status} onValueChange={v => setStatus(v as GanttStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>시작일</Label>
              <DatePickerButton
                value={startDate}
                onChange={setStartDate}
                placeholder="날짜 선택"
              />
            </div>
            <div className="space-y-1.5">
              <Label>종료일</Label>
              <DatePickerButton
                value={endDate}
                onChange={setEndDate}
                placeholder="날짜 선택"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>담당팀</Label>
              <Input value={team} onChange={e => setTeam(e.target.value)} placeholder="예: 개발팀" />
            </div>
            <div className="space-y-1.5">
              <Label>PM</Label>
              <Input value={pm} onChange={e => setPm(e.target.value)} placeholder="예: 홍길동" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={loading || !name.trim() || !categoryId}>
            {loading ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
