'use client'

import { useState } from 'react'
import { ArrowUpRight, Check, Pin, PinOff, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Note, NoteLink } from '@/types'
import { NOTE_COLORS, ColorPicker } from './note-color-picker'
import { NoteEditor } from './note-editor'
import { updateNote } from '@/lib/note-service'
import { addTask } from '@/lib/task-service'
import { getOrCreateWorkspace } from '@/lib/gantt-service'

type NotePatch = Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'links'>>

interface Props {
  note:     Note
  onUpdate: (id: string, patch: NotePatch) => void
  onDelete: (id: string) => void
  onClose:  () => void
}

export function NoteEditModal({ note, onUpdate, onDelete, onClose }: Props) {
  const [title,        setTitle]        = useState(note.title)
  const [content,      setContent]      = useState(note.content)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle,    setTaskTitle]    = useState('')
  const [linking,      setLinking]      = useState(false)
  const router = useRouter()

  const links = note.links ?? []

  function commit() {
    const t = title.trim()
    const c = content.trim()
    if (t !== note.title || c !== note.content) onUpdate(note.id, { title: t, content: c })
    onClose()
  }

  async function handleCreateTask() {
    if (linking) return
    const t = taskTitle.trim() || title.trim() || '(제목 없음)'
    setLinking(true)
    try {
      const workspace = await getOrCreateWorkspace()
      const task = await addTask(workspace.id, {
        title:      t,
        status:     'to-do',
        type:       'mine',
        assignee:   null,
        start_date: null,
        due_date:   null,
        memo:       content.trim() || null,
        priority:   0,
        labels:     [],
      })
      const newLink: NoteLink = { type: 'task', id: task.id, title: task.title }
      const updated = [...links, newLink]
      await updateNote(note.id, { links: updated })
      onUpdate(note.id, { links: updated })
      setShowTaskForm(false)
      setTaskTitle('')
      toast.success(`태스크 "${task.title}" 생성됐습니다.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as Record<string, unknown>)?.message as string ?? '알 수 없는 오류'
      toast.error(`태스크 생성 실패: ${msg}`)
    } finally {
      setLinking(false)
    }
  }

  async function handleRemoveLink(linkId: string) {
    if (linking) return
    setLinking(true)
    const updated = links.filter(l => l.id !== linkId)
    try {
      await updateNote(note.id, { links: updated })
      onUpdate(note.id, { links: updated })
    } catch {
      toast.error('링크 해제에 실패했습니다.')
    } finally {
      setLinking(false)
    }
  }

  const bg = NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.default.bg

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) commit() }}
    >
      <div
        onKeyDown={e => {
          if (e.key === 'Escape') commit()
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit()
        }}
        className={`w-full max-w-2xl flex flex-col rounded-2xl border border-border shadow-2xl overflow-hidden ${bg}`}
        style={{ maxHeight: '80vh' }}
      >
        {/* 제목 */}
        <div className="px-6 pt-6 pb-3 shrink-0">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full bg-transparent text-base font-semibold text-foreground placeholder:text-ink-300 outline-none"
          />
        </div>

        {/* 연결된 아이템 배지 */}
        {links.length > 0 && (
          <div className="px-6 pb-3 flex flex-wrap gap-2 shrink-0">
            {links.map(link => (
              <span
                key={link.id}
                className="inline-flex items-center gap-1 bg-lilac-50 dark:bg-lilac-950/40 border border-lilac-200 dark:border-lilac-800 rounded-full px-2.5 py-1 text-xs text-lilac-700 dark:text-lilac-300"
              >
                <ArrowUpRight size={10} />
                <button
                  onClick={() => router.push('/tasks')}
                  className="hover:underline max-w-[18rem] truncate"
                  title={`/tasks 에서 확인: ${link.title}`}
                >
                  {link.title}
                </button>
                <button
                  onClick={() => void handleRemoveLink(link.id)}
                  className="ml-0.5 text-lilac-400 hover:text-foreground"
                  title="링크 해제"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 본문 — Tiptap WYSIWYG */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
          <NoteEditor
            content={content}
            onChange={setContent}
            autoFocus={false}
          />
        </div>

        {/* 태스크 등록 인라인 폼 */}
        {showTaskForm && (
          <div className="shrink-0 px-5 py-3 border-t border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04]">
            <p className="text-xs font-semibold text-ink-400 mb-2">태스크로 등록</p>
            <input
              autoFocus
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleCreateTask()
                if (e.key === 'Escape') { setShowTaskForm(false); setTaskTitle('') }
              }}
              placeholder={title || '태스크 제목'}
              className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-lilac-300 text-foreground placeholder:text-ink-300"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { setShowTaskForm(false); setTaskTitle('') }}
                className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
              >취소</button>
              <button
                onClick={() => void handleCreateTask()}
                disabled={linking}
                className="text-xs px-3 py-1.5 rounded-lg bg-foreground text-background font-medium hover:bg-ink-800 disabled:opacity-50 transition-colors"
              >
                {linking ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        )}

        {/* 하단 툴바 */}
        <div className="shrink-0 flex items-center gap-1 px-5 py-3 border-t border-black/10 dark:border-white/10">
          <ColorPicker value={note.color} onChange={color => onUpdate(note.id, { color })} />
          <div className="flex-1" />

          <button
            onClick={() => { setShowTaskForm(v => !v); if (!showTaskForm) setTaskTitle(title.trim()) }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              showTaskForm
                ? 'bg-lilac-100 dark:bg-lilac-900/40 text-lilac-700 dark:text-lilac-300'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <ArrowUpRight size={12} />
            태스크 등록
          </button>

          <div className="w-px h-4 bg-border/60 mx-1" />
          <button
            onClick={() => onUpdate(note.id, { pinned: !note.pinned })}
            title={note.pinned ? '고정 해제' : '상단 고정'}
            className="p-1.5 rounded-full text-ink-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            onClick={() => { onDelete(note.id); onClose() }}
            title="삭제"
            className="p-1.5 rounded-full text-ink-400 hover:text-status-late hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <div className="w-px h-4 bg-border/60 mx-1" />
          <button
            onClick={commit}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-foreground text-background hover:bg-ink-800 transition-colors"
          >
            <Check size={12} />
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
