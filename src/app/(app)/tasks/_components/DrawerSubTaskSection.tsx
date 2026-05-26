'use client'

import { useState, useRef } from 'react'
import { Plus, CheckCircle2, Circle } from 'lucide-react'
import type { GanttTask, TaskStatus } from '@/types'
import { fmtDate } from '../_utils'

interface Props {
  task: GanttTask
  subTasks: GanttTask[]
  onStatusChange: (id: string, s: TaskStatus) => void
  onAddSubTask: (parentId: string, title: string, status: TaskStatus) => Promise<void>
}

export function DrawerSubTaskSection({ task, subTasks, onStatusChange, onAddSubTask }: Props) {
  const [addingSub, setAddingSub] = useState(false)
  const [subInput,  setSubInput]  = useState('')
  const subInputRef = useRef<HTMLInputElement>(null)

  const doneCount = subTasks.filter(t => t.status === 'done').length

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-3xs font-semibold text-ink-400 uppercase tracking-wider flex-1">
          하위 태스크{subTasks.length > 0 && ` (${doneCount}/${subTasks.length})`}
        </label>
      </div>
      {subTasks.length > 0 && (
        <div className="flex flex-col gap-0.5 mb-2">
          {subTasks.map(sub => (
            <div key={sub.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted">
              <button
                onClick={() => onStatusChange(sub.id, sub.status === 'done' ? 'to-do' : 'done')}
                className="shrink-0"
              >
                {sub.status === 'done'
                  ? <CheckCircle2 size={13} className="text-mint-500" />
                  : <Circle size={13} className="text-ink-300 hover:text-lilac-400 transition-colors" />
                }
              </button>
              <span className={`flex-1 text-xs ${sub.status === 'done' ? 'line-through text-ink-400' : 'text-ink-700'}`}>
                {sub.title}
              </span>
              {sub.due_date && (
                <span className="text-3xs text-ink-400 tabular-nums shrink-0">{fmtDate(sub.due_date)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {addingSub ? (
        <div className="flex items-center gap-1.5 border border-dashed border-lilac-300 rounded-md px-3 py-1.5 bg-accent/30">
          <Plus size={11} className="text-lilac-400 shrink-0" />
          <input
            ref={subInputRef}
            autoFocus
            value={subInput}
            onChange={e => setSubInput(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const t = subInput.trim()
                if (!t) return
                await onAddSubTask(task.id, t, task.status)
                setSubInput('')
                subInputRef.current?.focus()
              }
              if (e.key === 'Escape') { setAddingSub(false); setSubInput('') }
            }}
            onBlur={() => { if (!subInput.trim()) { setAddingSub(false); setSubInput('') } }}
            placeholder="하위 태스크 제목 후 Enter, Esc 취소"
            className="flex-1 text-2xs outline-none placeholder:text-ink-300 bg-transparent text-foreground"
          />
        </div>
      ) : (
        <button
          onClick={() => setAddingSub(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-border text-2xs text-ink-400 hover:text-foreground hover:border-ink-400 transition-colors"
        >
          <Plus size={11} /> 하위 태스크 추가
        </button>
      )}
    </div>
  )
}
