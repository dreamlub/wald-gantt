'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import type { Editor } from '@tiptap/react'

// tiptap-markdown 스토리지 타입 (공식 타입 선언 미제공)
type MdStorage = { getMarkdown: () => string }
const mdStorage = (editor: Editor) =>
  (editor.storage as unknown as { markdown: MdStorage }).markdown

// tiptap-markdown 의 `- [ ] ` 입력 규칙이 커서를 잘못 배치하는 버그 우회:
// 스페이스 키를 먼저 가로채 직접 taskItem 노드를 만들고 커서를 내부에 배치한다.
const TaskListSpaceFix = Extension.create({
  name: 'taskListSpaceFix',
  priority: 9999,
  addKeyboardShortcuts() {
    return {
      ' ': ({ editor }) => {
        const { state, view } = editor
        const { $from } = state.selection

        if ($from.parent.type.name !== 'paragraph') return false

        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
        if (!/^[-*] \[[ x]\]$/.test(textBefore)) return false

        const checked  = textBefore.includes('[x]')
        const { schema } = state
        const from = $from.before($from.depth)
        const to   = $from.after($from.depth)

        const taskNode = schema.nodes.taskList.create(null, [
          schema.nodes.taskItem.create({ checked }, [
            schema.nodes.paragraph.create(),
          ]),
        ])

        const tr = state.tr.replaceWith(from, to, taskNode)
        // taskList(1) → taskItem(1) → paragraph(1) → 커서 위치
        tr.setSelection(TextSelection.create(tr.doc, from + 3))
        view.dispatch(tr)
        return true
      },
    }
  },
})

// 빈 체크박스에서 Enter → 리스트 탈출
const ExitEmptyTaskItem = Extension.create({
  name: 'exitEmptyTaskItem',
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection
        if ($from.parent.type.name !== 'taskItem') return false
        if ($from.parent.textContent.trim() !== '') return false
        return editor.commands.liftListItem('taskItem')
      },
    }
  },
})

interface Props {
  content:      string
  onChange:     (markdown: string) => void
  placeholder?: string
  autoFocus?:   boolean
  /** Ctrl+Enter 를 가로채 저장 동작 실행 (HardBreak 기본 동작 억제) */
  onCtrlEnter?: () => void
  /** 에디터 최소 높이 Tailwind 클래스 (기본 'min-h-[12rem]') */
  minHeightClass?: string
}

export function NoteEditor({
  content, onChange,
  placeholder = '메모 작성...',
  autoFocus,
  onCtrlEnter,
  minHeightClass = 'min-h-[12rem]',
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      TaskListSpaceFix,
      ExitEmptyTaskItem,
      Markdown.configure({ transformPastedText: true }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      handleKeyDown: onCtrlEnter
        ? (_view, event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              onCtrlEnter()
              return true // HardBreak 기본 동작 억제
            }
            return false
          }
        : undefined,
      attributes: {
        class: [
          `outline-none ${minHeightClass} text-sm text-foreground leading-relaxed`,
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1',
          '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1',
          '[&_li]:leading-relaxed [&_li_p]:my-0',
          '[&_h1]:text-base [&_h1]:font-bold [&_h1]:my-1',
          '[&_h2]:text-sm [&_h2]:font-bold [&_h2]:my-1',
          '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:my-1',
          '[&_strong]:font-semibold [&_em]:italic',
          '[&_code]:bg-black/10 [&_code]:dark:bg-white/10 [&_code]:rounded [&_code]:px-1 [&_code]:text-xs [&_code]:font-mono',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-ink-300 [&_blockquote]:pl-3 [&_blockquote]:text-ink-400 [&_blockquote]:italic [&_blockquote]:my-1',
          '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0',
          '[&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2',
          '[&_li[data-type=taskItem]>label]:mt-0.5 [&_li[data-type=taskItem]>label]:shrink-0',
          '[&_li[data-type=taskItem]>div]:flex-1 [&_li[data-type=taskItem]>div>p]:my-0',
          '[&_p]:my-0.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        ].join(' '),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(mdStorage(editor).getMarkdown())
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = mdStorage(editor).getMarkdown()
    if (current !== content) editor.commands.setContent(content, { emitUpdate: false })
  }, [content, editor])

  return (
    <div className="[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:text-ink-300 [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:h-0">
      <EditorContent editor={editor} />
    </div>
  )
}
