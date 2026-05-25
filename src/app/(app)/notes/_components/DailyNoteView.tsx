'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Pencil, Eye, FilePlus, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { readNote, writeNote } from '@/lib/daily-note'

interface Props {
  handle: FileSystemDirectoryHandle
  date: Date
}

type SaveState = 'idle' | 'saving' | 'saved'

export function DailyNoteView({ handle, date }: Props) {
  const [content,   setContent]   = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [editMode,  setEditMode]  = useState(false)
  const [draft,     setDraft]     = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 날짜 바뀔 때마다 노트 로드
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setEditMode(false)
    setDraft('')
    setSaveState('idle')
    readNote(handle, date).then(text => {
      setContent(text)
      setLoading(false)
    })
  }, [handle, date])

  const save = useCallback(async (text: string) => {
    setSaveState('saving')
    await writeNote(handle, date, text)
    setContent(text)
    setSaveState('saved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveState('idle'), 2000)
  }, [handle, date])

  function enterEdit(initial?: string) {
    setDraft(initial ?? content ?? '')
    setEditMode(true)
  }

  async function exitEdit() {
    if (draft !== content) await save(draft)
    setEditMode(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save(draft)
    }
    if (e.key === 'Escape') exitEdit()
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-ink-300">로딩 중...</div>
  }

  // 편집 모드
  if (editMode) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted shrink-0">
          <span className="text-2xs text-muted-foreground">Ctrl+S 저장 · Esc 닫기</span>
          <div className="flex items-center gap-2">
            {saveState === 'saving' && <span className="text-2xs text-ink-400">저장 중...</span>}
            {saveState === 'saved'  && <span className="text-2xs text-mint-500 flex items-center gap-1"><Check size={11} />저장됨</span>}
            <button
              onClick={exitEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-foreground text-background hover:bg-ink-800 transition-colors"
            >
              <Eye size={12} /> 미리보기
            </button>
          </div>
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 resize-none p-5 text-sm font-mono leading-relaxed outline-none bg-background text-foreground placeholder:text-ink-300"
          placeholder="오늘 일지를 작성하세요..."
          spellCheck={false}
        />
      </div>
    )
  }

  // 노트 없음
  if (content === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <FilePlus size={36} strokeWidth={1.5} className="text-ink-200" />
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">이 날 노트가 없어요</p>
          <p className="text-xs mt-1 text-ink-300">새 노트를 만들어 볼까요?</p>
        </div>
        <button
          onClick={() => enterEdit('')}
          className="px-4 py-2 rounded-lg bg-foreground text-background text-xs font-medium hover:bg-ink-800 transition-colors"
        >
          노트 만들기
        </button>
      </div>
    )
  }

  // 뷰 모드
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted shrink-0">
        <span className="text-2xs text-muted-foreground">{dateToFilename(date)}</span>
        <button
          onClick={() => enterEdit()}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
        >
          <Pencil size={12} /> 편집
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-background">
        <div className="max-w-2xl mx-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-5 first:mt-0 text-foreground">{children}</h1>,
              h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-4 first:mt-0 text-foreground">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold mb-1.5 mt-3 first:mt-0 text-foreground">{children}</h3>,
              p:  ({ children }) => <p className="text-sm leading-relaxed mb-3 text-foreground">{children}</p>,
              ul: ({ children }) => <ul className="mb-3 pl-5 text-sm space-y-1 list-disc text-foreground">{children}</ul>,
              ol: ({ children }) => <ol className="mb-3 pl-5 text-sm space-y-1 list-decimal text-foreground">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed text-foreground">{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-lilac-300 pl-3 my-2 text-sm text-muted-foreground italic">
                  {children}
                </blockquote>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.includes('language-')
                if (isBlock) return (
                  <code className="block bg-muted rounded p-3 text-xs font-mono leading-relaxed my-2 overflow-x-auto text-foreground">{children}</code>
                )
                return <code className="bg-muted rounded px-1.5 py-0.5 text-xs font-mono text-foreground">{children}</code>
              },
              pre: ({ children }) => <pre className="my-2">{children}</pre>,
              hr:  () => <hr className="my-4 border-border" />,
              a:   ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-lilac-500 hover:underline">{children}</a>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-3">
                  <table className="text-xs border-collapse w-full">{children}</table>
                </div>
              ),
              th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold bg-muted text-foreground">{children}</th>,
              td: ({ children }) => <td className="border border-border px-2 py-1 text-foreground">{children}</td>,
              input: ({ type, checked }) => type === 'checkbox'
                ? <input type="checkbox" checked={checked} readOnly className="mr-1.5 accent-lilac-500" />
                : null,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

function dateToFilename(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.md`
}
