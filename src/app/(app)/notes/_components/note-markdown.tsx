'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeRaw from 'rehype-raw'

interface Props {
  content:  string
  onToggle?: (index: number, checked: boolean) => void
}

// \n\n\n 이상 연속 빈 줄 → 추가 빈 줄마다 <br> 삽입 (rehype-raw가 HTML로 처리)
function preserveBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, match => {
    const extra = match.length - 2
    return '\n\n' + '<br />\n'.repeat(extra)
  })
}

// remark-gfm 은 `- [ ]`(내용 없음)을 task item으로 인식하지 못함 (GFM 스펙: 내용 필수).
// zero-width space(​)를 삽입해 remark-gfm 이 task item으로 파싱하도록 유도.
function fixEmptyTaskItems(content: string): string {
  return content.replace(/^([ \t]*[-*] \[[ x]\])\s*$/gm, '$1 ​')
}

export function NoteMarkdown({ content, onToggle }: Props) {
  let idx = 0
  return (
    <div className={`
      text-sm text-foreground leading-relaxed max-w-none
      [&_p]:mb-1 [&_p:last-child]:mb-0
      [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-1
      [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-1
      [&_li]:leading-relaxed
      [&_strong]:font-semibold [&_em]:italic
      [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-1
      [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-1
      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1
      [&_code]:bg-black/10 [&_code]:dark:bg-white/10 [&_code]:rounded [&_code]:px-1 [&_code]:text-xs [&_code]:font-mono
      [&_blockquote]:border-l-2 [&_blockquote]:border-ink-300 [&_blockquote]:pl-3 [&_blockquote]:text-ink-400 [&_blockquote]:italic [&_blockquote]:mb-1
    `}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
        components={{
          input({ type, checked }) {
            if (type !== 'checkbox') return null
            const i = idx++
            return (
              <input
                type="checkbox"
                checked={checked}
                disabled={!onToggle}
                onChange={e => onToggle?.(i, e.target.checked)}
                className="mr-1.5 accent-lilac-500 align-middle"
                style={{ cursor: onToggle ? 'pointer' : 'default' }}
              />
            )
          },
        }}
      >
        {fixEmptyTaskItems(preserveBlankLines(content))}
      </ReactMarkdown>
    </div>
  )
}

export function toggleCheckbox(content: string, index: number, checked: boolean): string {
  let count = 0
  return content.replace(/^(\s*[-*]\s)\[([ x])\]/gm, (match, prefix) => {
    if (count++ === index) return `${prefix}[${checked ? 'x' : ' '}]`
    return match
  })
}

export function parseCheckboxStats(content: string): { total: number; checked: number } {
  const total   = (content.match(/^[-*]\s\[[ x]\]/gm) ?? []).length
  const checked = (content.match(/^[-*]\s\[x\]/gm) ?? []).length
  return { total, checked }
}
