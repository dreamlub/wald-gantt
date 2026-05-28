'use client'

import { useState, useEffect, useRef } from 'react'
import type { TaskStatus, Priority, RecurrenceRule } from '@/types'
import { toDate, toDateStr } from '@/lib/gantt-utils'
import type { FormTab, ProjectOption, Props } from './_TaskFormConstants'

export function useTaskForm({ open, onClose, onSave, editTask, defaultStatus = 'to-do', defaultProjects, onSearchProjects, labelSuggestions = [], initialTitle, initialMemo, initialTab = 'info' }: Props) {
  const [tab,       setTab]       = useState<FormTab>('info')
  const [title,     setTitle]     = useState('')
  const [status,    setStatus]    = useState<TaskStatus>('to-do')
  const [priority,  setPriority]  = useState<Priority>(2)
  const [assignee,  setAssignee]  = useState('')
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [dueDate,   setDueDate]   = useState<Date | undefined>(undefined)
  const [memo,      setMemo]      = useState('')
  const [labels,    setLabels]    = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [labelOpen,  setLabelOpen]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [recurrenceRule,     setRecurrenceRule]     = useState<RecurrenceRule | null>(null)
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1)

  const [linkedProjects, setLinkedProjects] = useState<ProjectOption[]>([])
  const [projSearch,     setProjSearch]     = useState('')
  const [projResults,    setProjResults]    = useState<ProjectOption[]>([])
  const [showProjDrop,   setShowProjDrop]   = useState(false)
  const projRef  = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const memoRef  = useRef<HTMLTextAreaElement>(null)

  // validation
  const dateError = startDate && dueDate && startDate > dueDate
    ? '시작일이 마감일보다 늦을 수 없어요' : null
  const isValid = title.trim().length > 0 && !dateError

  // open 시 탭 설정 + 포커스
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab(initialTab)
      const t = setTimeout(() => {
        if (initialTab === 'memo') memoRef.current?.focus()
        else titleRef.current?.focus()
      }, 310)
      return () => clearTimeout(t)
    }
  }, [open, initialTab])

  // open/editTask 변경 시 폼 상태 동기화 (외부 트리거 기반 → 의도된 setState)
  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    if (editTask) {
      setTitle(editTask.title)
      setStatus(editTask.status)
      setPriority(editTask.priority ?? 0)
      setAssignee(editTask.assignee ?? '')
      setStartDate(toDate(editTask.start_date))
      setDueDate(toDate(editTask.due_date))
      setMemo(editTask.memo ?? '')
      setLabels(editTask.labels ?? [])
      setLinkedProjects(editTask.projects ?? [])
      setRecurrenceRule(editTask.recurrence_rule ?? null)
      setRecurrenceInterval(editTask.recurrence_interval ?? 1)
    } else {

      setTitle(initialTitle ?? ''); setStatus(defaultStatus); setPriority(2)

      setAssignee(''); setStartDate(undefined); setDueDate(undefined); setMemo(initialMemo ?? '')
      setLabels([]); setLinkedProjects(defaultProjects ?? [])
      setRecurrenceRule(null); setRecurrenceInterval(1)
    }
    setProjSearch(''); setProjResults([]); setShowProjDrop(false); setLabelInput(''); setLabelOpen(false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editTask, defaultStatus, defaultProjects, initialTitle, initialMemo])

  useEffect(() => {
    if (!showProjDrop) return
    const timer = setTimeout(async () => {
      const results = await onSearchProjects(projSearch)
      setProjResults(results.filter(r => !linkedProjects.some(l => l.id === r.id)))
    }, projSearch.trim() ? 200 : 0)
    return () => clearTimeout(timer)
  }, [projSearch, linkedProjects, onSearchProjects, showProjDrop])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (projRef.current && !projRef.current.contains(e.target as Node))
        setShowProjDrop(false)
      if (labelRef.current && !labelRef.current.contains(e.target as Node))
        setLabelOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleSave() {
    if (!isValid) return
    setSaving(true)
    try {
      const trimmedAssignee = assignee.trim() || null
      await onSave(
        {
          title: title.trim(),
          status,
          type: trimmedAssignee ? 'delegated' : 'mine',
          assignee: trimmedAssignee,
          start_date: toDateStr(startDate),
          due_date: toDateStr(dueDate),
          memo: memo.trim() || null,
          priority,
          labels,
          recurrence_rule: recurrenceRule,
          recurrence_interval: recurrenceRule ? recurrenceInterval : null,
        },
        linkedProjects.map(p => p.id)
      )
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function addLabel() {
    const val = labelInput.trim()
    if (!val || labels.includes(val)) { setLabelInput(''); return }
    setLabels(prev => [...prev, val])
    setLabelInput('')
  }

  function linkProject(p: ProjectOption) {
    setLinkedProjects(prev => [...prev, p])
    setProjSearch(''); setProjResults([]); setShowProjDrop(false)
  }

  function unlinkProject(id: string) {
    setLinkedProjects(prev => prev.filter(p => p.id !== id))
  }

  return {
    tab, setTab,
    title, setTitle,
    status, setStatus,
    priority, setPriority,
    assignee, setAssignee,
    startDate, setStartDate,
    dueDate, setDueDate,
    memo, setMemo,
    labels, setLabels,
    labelInput, setLabelInput,
    labelOpen, setLabelOpen,
    saving,
    recurrenceRule, setRecurrenceRule,
    recurrenceInterval, setRecurrenceInterval,
    linkedProjects,
    projSearch, setProjSearch,
    projResults,
    showProjDrop, setShowProjDrop,
    projRef, labelRef, titleRef, memoRef,
    dateError, isValid,
    labelSuggestions,
    handleSave, addLabel, linkProject, unlinkProject,
  }
}
