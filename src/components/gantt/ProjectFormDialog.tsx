'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GanttProject, GanttStatus } from '@/types'

const STATUSES: { value: GanttStatus; label: string }[] = [
  { value: 'in-progress', label: 'In-Progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'to-do', label: 'To-Do' },
]

const YEARS = [2024, 2025, 2026, 2027, 2028]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

interface Props {
  open: boolean
  onClose: () => void
  onSave: (fields: {
    categoryId: string
    parentId: string | null
    name: string
    status: GanttStatus
    start_month: string | null
    end_month: string | null
  }) => Promise<void>
  defaultParentId?: string | null
  isSubtask?: boolean
  editProject?: GanttProject | null
}

function splitYM(ym: string | null | undefined) {
  if (!ym) return { year: '', month: '' }
  const [y, m] = ym.split('-')
  return { year: y, month: String(parseInt(m)) }
}

export function ProjectFormDialog({ open, onClose, onSave, defaultParentId, isSubtask, editProject }: Props) {
  const [name, setName]           = useState('')
  const [status, setStatus]       = useState<GanttStatus>('to-do')
  const [startYear, setStartYear] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [endYear, setEndYear]     = useState('')
  const [endMonth, setEndMonth]   = useState('')
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (editProject) {
      setName(editProject.name)
      setStatus(editProject.status)
      const s = splitYM(editProject.start_month)
      const e = splitYM(editProject.end_month)
      setStartYear(s.year); setStartMonth(s.month)
      setEndYear(e.year);   setEndMonth(e.month)
    } else {
      setName('')
      setStatus('to-do')
      setStartYear(''); setStartMonth('')
      setEndYear('');   setEndMonth('')
    }
  }, [editProject, open])

  function buildYM(year: string, month: string): string | null {
    if (!year || !month) return null
    return `${year}-${String(month).padStart(2, '0')}`
  }

  async function handleSave() {
    if (!name.trim()) return
    setLoading(true)
    try {
      await onSave({
        categoryId: '',   // filled by parent
        parentId: editProject?.parent_id ?? defaultParentId ?? null,
        name: name.trim(),
        status,
        start_month: buildYM(startYear, startMonth),
        end_month: buildYM(endYear, endMonth),
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
          <DialogTitle>
            {editProject ? '수정' : isSubtask ? '서브태스크 추가' : '프로젝트 추가'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>이름</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={isSubtask ? '서브태스크명' : '프로젝트명'}
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
              <Label>시작</Label>
              <div className="flex gap-1">
                <Select value={startYear} onValueChange={v => setStartYear(v ?? '')}>
                  <SelectTrigger className="w-20"><SelectValue placeholder="년" /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={startMonth} onValueChange={v => setStartMonth(v ?? '')}>
                  <SelectTrigger className="w-16"><SelectValue placeholder="월" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={String(m)}>{m}월</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>종료</Label>
              <div className="flex gap-1">
                <Select value={endYear} onValueChange={v => setEndYear(v ?? '')}>
                  <SelectTrigger className="w-20"><SelectValue placeholder="년" /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={endMonth} onValueChange={v => setEndMonth(v ?? '')}>
                  <SelectTrigger className="w-16"><SelectValue placeholder="월" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={String(m)}>{m}월</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={loading || !name.trim()}>
            {loading ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
