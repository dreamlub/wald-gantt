'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import type { Editor } from '@tiptap/react'

type MdStorage = { getMarkdown: () => string }
const mdStorage = (editor: Editor) =>
  (editor.storage as unknown as { markdown: MdStorage }).markdown

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
  content:        string
  onChange:       (markdown: string) => void
  placeholder?:   string
  autoFocus?:     boolean
  onCtrlEnter?:   () => void
  minHeightClass?: string
}

export function NoteEditor({
  content, onChange,
  placeholder = '메모 작성...',
  autoFocus,
  onCtrlEnter,
  minHeightClass = 'min-h-[12rem]',
}: Props) {
  // editor 인스턴스를 handleTextInput 클로저에서 참조하기 위한 ref
  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      ExitEmptyTaskItem,
      Markdown.configure({ transformPastedText: true }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    autofocus: autoFocus ? 'end' : false,
    onCreate({ editor }) { editorRef.current = editor },
    onUpdate({ editor }) {
      editorRef.current = editor
      onChange(mdStorage(editor).getMarkdown())
    },
    editorProps: {
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          onCtrlEnter?.()
          return !!onCtrlEnter
        }
        return false
      },
      // ── handleTextInput: input rule 보다 먼저 실행 ─────────────────
      // true 반환 시 텍스트 삽입·input rule 모두 취소됨
      handleTextInput(view, from, _to, text) {
        if (text !== ' ') return false

        const { state }  = view
        const { $from }  = state.selection
        const { schema } = state

        if ($from.parent.type.name !== 'paragraph') return false

        const paraStart  = $from.start($from.depth)
        const textBefore = state.doc.textBetween(paraStart, from)

        // ── Case A: bulletList > listItem > paragraph, text = `[ ]` ──
        // tiptap-markdown 이 TaskItem 기본 input rule 을 억제하므로 직접 처리.
        // delete "[ ]" → toggleList 로 bullet→task 변환 (editor 명령어 사용)
        const grandParent = $from.node($from.depth - 1)
        if (grandParent?.type.name === 'listItem' && /^\[[ xX]\]$/.test(textBefore)) {
          // 1) "[ ]" 텍스트 삭제
          view.dispatch(state.tr.delete(paraStart, from))
          // 2) bullet list → task list 변환 (editor 내부가 자동으로 포지션 처리)
          editorRef.current?.chain()
            .focus()
            .toggleList('taskList', 'taskItem')
            .run()
          return true
        }

        // ── Case B: paragraph 에서 직접 `- [ ]` 입력 ─────────────────
        if (!/^[-*] \[[ x]\]$/.test(textBefore)) return false

        const checked  = textBefore.includes('[x]')
        const paraFrom = $from.before($from.depth)
        const paraTo   = $from.after($from.depth)

        const taskNode = schema.nodes.taskList.create(null, [
          schema.nodes.taskItem.create({ checked }, [
            schema.nodes.paragraph.create(),
          ]),
        ])

        const tr = state.tr.replaceWith(paraFrom, paraTo, taskNode)
        // tr.doc 에서 새로 만든 taskItem 위치를 실제로 찾아 커서 배치
        let cursorPos = paraFrom + 3
        tr.doc.nodesBetween(paraFrom, tr.doc.content.size, (node, pos) => {
          if (node.type.name === 'taskItem') {
            cursorPos = pos + 2  // taskItem 열기(1) + paragraph 열기(1)
            return false
          }
        })
        tr.setSelection(TextSelection.create(tr.doc, cursorPos))
        view.dispatch(tr)
        return true
      },
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
          // Tiptap TaskItem: <ul data-type="taskList"> > <li data-checked="...">
          '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0',
          '[&_li[data-checked]]:flex [&_li[data-checked]]:items-start [&_li[data-checked]]:gap-2',
          '[&_li[data-checked]>label]:mt-0.5 [&_li[data-checked]>label]:shrink-0',
          '[&_li[data-checked]>div]:flex-1 [&_li[data-checked]>div>p]:my-0',
          '[&_p]:my-0.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        ].join(' '),
      },
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
