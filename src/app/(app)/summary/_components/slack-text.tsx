'use client'

import React from 'react'

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function slackMrkdwnToHtml(text: string): string {
  // 1. decode Slack HTML entities first
  let html = text
    .replace(/&amp;/g, '\x00AMP\x00')
    .replace(/&lt;/g, '\x00LT\x00')
    .replace(/&gt;/g, '\x00GT\x00')

  // 2. code block (먼저 처리해서 내부를 보호)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    const safe = escHtml(code.trim()
      .replace(/\x00AMP\x00/g, '&')
      .replace(/\x00LT\x00/g, '<')
      .replace(/\x00GT\x00/g, '>'))
    return `<pre class="bg-muted rounded px-2 py-1 my-1 text-xs overflow-x-auto whitespace-pre"><code>${safe}</code></pre>`
  })

  // 3. inline code
  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    const safe = escHtml(code
      .replace(/\x00AMP\x00/g, '&')
      .replace(/\x00LT\x00/g, '<')
      .replace(/\x00GT\x00/g, '>'))
    return `<code class="bg-muted rounded px-1 text-xs font-mono">${safe}</code>`
  })

  // 4. Slack link tokens  <URL|label>  <URL>  <@USER>  <#CHANNEL|name>
  html = html.replace(/<([^>]+)>/g, (_, inner) => {
    // restore entities inside brackets
    inner = inner
      .replace(/\x00AMP\x00/g, '&')
      .replace(/\x00LT\x00/g, '<')
      .replace(/\x00GT\x00/g, '>')

    if (inner.startsWith('@')) {
      return `<span class="text-blue-600 dark:text-blue-400 font-medium">@${escHtml(inner.slice(1))}</span>`
    }
    if (inner.startsWith('#')) {
      const name = inner.includes('|') ? inner.split('|')[1] : inner.slice(1)
      return `<span class="text-blue-600 dark:text-blue-400">#${escHtml(name)}</span>`
    }
    if (inner.startsWith('!')) {
      return `<span class="text-orange-500 font-medium">@${escHtml(inner.slice(1))}</span>`
    }
    const pipeIdx = inner.indexOf('|')
    if (pipeIdx !== -1) {
      const url = inner.slice(0, pipeIdx)
      const label = escHtml(inner.slice(pipeIdx + 1))
      const safeUrl = escHtml(url)
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 underline underline-offset-2">${label}</a>`
    }
    if (inner.startsWith('http')) {
      const safeUrl = escHtml(inner)
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 underline underline-offset-2">${safeUrl}</a>`
    }
    // fallback: restore as text
    return escHtml(inner)
  })

  // 5. remaining entity placeholders → escaped text
  html = html
    .replace(/\x00AMP\x00/g, '&amp;')
    .replace(/\x00LT\x00/g, '&lt;')
    .replace(/\x00GT\x00/g, '&gt;')

  // 6. bold / italic / strikethrough (line-scoped, avoid greedy across lines)
  html = html.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>')
  html = html.replace(/~([^~\n]+)~/g, '<del>$1</del>')

  // 7. blockquote: lines starting with &gt; (already converted) — but we replaced entities before, so match literal >
  //    Actually after step 5 &gt; is re-encoded, but the original Slack > was decoded to \x00GT\x00 and re-encoded to &gt;
  //    Lines in Slack that start with > are blockquotes — they come through as literal > in raw text
  html = html.replace(/^(&gt;|>) ?(.*)$/gm, (_, _q, content) =>
    `<blockquote class="border-l-2 border-border pl-2 text-ink-500 italic my-0.5">${content}</blockquote>`
  )

  // 8. newlines → <br> (outside of pre blocks)
  html = html.replace(/\n/g, '<br>')

  return html
}

interface SlackTextProps {
  text: string
  className?: string
}

export function SlackText({ text, className }: SlackTextProps) {
  const html = slackMrkdwnToHtml(text)
  return (
    <div
      className={className}
      // text comes from our own Slack workspace via API, mrkdwn→HTML conversion escapes user content
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
