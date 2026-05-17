'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { WeekSection } from '../_lib/types'

interface Props {
  section: WeekSection
}

// Outline exports multiline table cells as content on the next line, which breaks GFM.
// This merges continuation lines back into the table row they belong to.
function fixMultilineTableCells(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0
  let expectedPipes = 0
  let inTable = false

  while (i < lines.length) {
    const line = lines[i]
    const isTableLine = line.trim().startsWith('|')
    const isSeparator = /^\s*\|[\s\-:|]+\|/.test(line)

    if (!isTableLine) {
      if (inTable) inTable = false
      result.push(line)
      i++
      continue
    }

    if (!inTable && !isSeparator) {
      expectedPipes = (line.match(/\|/g) ?? []).length
      inTable = true
      result.push(line)
      i++
      continue
    }

    if (isSeparator) {
      result.push(line)
      i++
      continue
    }

    // Data row: merge following non-table lines into the last cell.
    // Blank lines inside a cell are skipped if more cell content follows.
    let current = line.trimEnd()
    while (i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim()

      if (nextTrimmed.startsWith('|')) break

      // Blank line: look ahead to decide whether to skip or stop
      if (nextTrimmed === '') {
        let j = i + 2
        while (j < lines.length && lines[j].trim() === '') j++
        // Stop if next non-blank is a table row or end of text
        if (j >= lines.length || lines[j].trim().startsWith('|')) break
        i++ // skip blank line, continue merging
        continue
      }

      i++
      const continuation = nextTrimmed
      // Convert list markers (*, -) to inline bullet character
      const inlineContent = continuation.replace(/^[*-] /, '• ')
      const nowPipes = (current.match(/\|/g) ?? []).length
      if (nowPipes < expectedPipes) {
        current = current + ' ' + inlineContent + ' |'
      } else {
        const lastPipe = current.lastIndexOf('|')
        current = current.slice(0, lastPipe).trimEnd() + '<br>' + inlineContent + ' |'
      }
    }

    result.push(current)
    i++
  }

  return result.join('\n')
}

function processContent(content: string): string {
  return fixMultilineTableCells(content)
    .replace(/==(.*?)==/g, '**$1**')
}

export function WeeklyContent({ section }: Props) {
  const processed = processContent(section.content)

  return (
    <div className="overflow-x-auto">
      <div
        className="
          [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs
          [&_thead]:bg-muted
          [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink-500 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide
          [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_td]:leading-relaxed
          [&_td:first-child]:w-[120px] [&_td:first-child]:min-w-[120px] [&_td:first-child]:font-semibold [&_td:first-child]:text-foreground [&_td:first-child]:whitespace-nowrap [&_td:first-child]:bg-muted/40
          [&_td:last-child]:text-ink-700
          [&_p]:mb-2 [&_p:last-child]:mb-0
          [&_strong]:font-semibold [&_strong]:text-foreground
          [&_a]:text-lilac-600 [&_a]:underline [&_a]:underline-offset-2
          [&_li]:mb-0.5
          [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc
          [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal
        "
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
        >
          {processed}
        </ReactMarkdown>
      </div>
    </div>
  )
}
