'use client'

import { useEffect, useRef, useState } from 'react'
import { X, StickyNote } from 'lucide-react'
import type { GanttProject } from '@/types'

interface Props {
  project: GanttProject | null
  onClose: () => void
  onSave: (projectId: string, memo: string) => Promise<void>
}

export function MemoPanel({ project, onClose, onSave }: Props) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (project) {
      setValue(project.memo ?? '')
      setSaved(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [project?.id])

  async function handleSave() {
    if (!project) return
    setSaving(true)
    await onSave(project.id, value)
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 800)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  if (!project) return null

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white border-l shadow-xl z-50 flex flex-col">
        {/* 헤더 */}
        <div className="h-12 flex items-center gap-2.5 px-4 border-b shrink-0">
          <StickyNote size={14} className="text-gray-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-800 flex-1 truncate">메모</span>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* 프로젝트명 */}
        <div className="px-4 py-3 border-b shrink-0">
          <div className="text-xs font-medium text-gray-700 truncate">{project.name}</div>
        </div>

        {/* textarea */}
        <div className="flex-1 flex flex-col p-4 min-h-0">
          <textarea
            ref={textareaRef}
            className="flex-1 w-full text-sm text-gray-700 resize-none border border-gray-200 rounded-md p-3 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 placeholder-gray-300"
            placeholder="메모를 입력하세요..."
            value={value}
            onChange={e => { setValue(e.target.value); setSaved(false) }}
            onKeyDown={handleKeyDown}
          />

          {/* 저장 버튼 */}
          <div className="flex items-center justify-end gap-2 mt-3 shrink-0">
            <span className={`text-xs text-green-500 transition-opacity duration-300 ${saved ? 'opacity-100' : 'opacity-0'}`}>
              저장됨
            </span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-500 text-white rounded-md hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
          <p className="text-[10px] text-gray-300 mt-1.5 text-right">Ctrl+S로 저장</p>
        </div>
      </div>
    </>
  )
}
