'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { FileText } from 'lucide-react'
import type { WeeklyReport, WeeklyReportSource } from '@/types/index'
import { fmtDatetime } from './weekly-dashboard-parts'

const SOURCE_LABEL: Record<WeeklyReportSource, string> = {
  outline:  'Outline',
  team_doc: '팀 문서',
  biz_lead: 'Biz Lead',
}

// ── 마크다운 렌더러 ───────────────────────────────────────────────

const MD_CLASSES = `
  text-sm text-foreground leading-relaxed max-w-none
  [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 [&_h1:first-child]:mt-0
  [&_h2]:text-sm  [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2:first-child]:mt-0 [&_h2]:text-ink-500
  [&_h3]:text-sm  [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3:first-child]:mt-0
  [&_p]:mb-2 [&_p:last-child]:mb-0
  [&_ul]:mb-2 [&_ul]:space-y-0.5
  [&_ol]:mb-2 [&_ol]:pl-4 [&_ol]:list-decimal [&_ol]:space-y-0.5
  [&_li]:leading-relaxed
  [&_strong]:font-semibold [&_em]:italic
  [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:text-xs [&_code]:font-mono
  [&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:font-mono [&_pre]:mb-2
  [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-ink-400 [&_blockquote]:mb-2
  [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:mb-3
  [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-muted [&_th]:font-semibold [&_th]:text-left
  [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top
  [&_hr]:border-border [&_hr]:my-3
`.replace(/\n/g, ' ').trim()

// 짝 없는 * 제거 — 유효한 **bold** / *italic* 는 플레이스홀더로 보호 후 복원
function cleanAsterisks(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, '\x00$1\x01')
    .replace(/\*\*/g, '')
    .replace(/\*([^*\n]+?)\*/g, '\x02$1\x03')
    .replace(/\*/g, '')
    .replace(/\x00/g, '**').replace(/\x01/g, '**')
    .replace(/\x02/g, '*').replace(/\x03/g, '*')
}

// Outline 원문 전처리:
//   <br>→\n / ==highlight== 제거 / 짝없는 * 제거
//   구분선 없는 파이프 행(| 팀 | 내용 |) → **팀** + 내용 텍스트로 변환
function preprocessMd(content: string): string {
  const lines = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/==(.+?)==/g, '$1')
    .split('\n')

  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 리스트·헤딩 → 그대로
    if (/^([*\-+]|\d+\.)\s/.test(line) || /^#{1,6}\s/.test(line)) {
      out.push(line); i++; continue
    }

    // 파이프 행 블록 수집
    if (/^\s*\|/.test(line)) {
      const block: string[] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        block.push(lines[i]); i++
      }
      // GFM 구분선(|---|) 포함이면 정상 테이블 → 그대로 유지
      if (block.some(l => /^\s*\|[\s|:\-]{3,}\|/.test(l))) {
        out.push(...block)
      } else {
        // 구분선 없음 → **col1** + 나머지 내용 형식으로 변환
        for (const row of block) {
          const cells = row.split('|').slice(1, -1).map(c => c.trim()).filter(c => c.length > 0)
          if (cells.length === 0) continue
          if (cells.length === 1) { out.push(cleanAsterisks(cells[0])); continue }
          out.push(`**${cells[0]}**`)
          out.push(cleanAsterisks(cells.slice(1).join(' ')))
        }
      }
      continue
    }

    // 일반 줄 → 별표 정리
    out.push(cleanAsterisks(line))
    i++
  }

  return out.join('\n')
}

function Md({ content }: { content: string }) {
  return (
    <div className={MD_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
        {preprocessMd(content)}
      </ReactMarkdown>
    </div>
  )
}

// ── 테이블 파싱 ───────────────────────────────────────────────────

interface ParsedSection {
  preTable:  string
  rows:      { author: string; content: string }[]
  postTable: string
}

/**
 * "| 구분 | 내용 |" 형식의 마크다운 테이블을 감지해서 행별로 추출.
 * Outline 주간보고서는 테이블 셀 안에 <br>으로 줄바꿈하기 때문에
 * 셀 단위로 추출 후 <br>→\n 변환해야 제대로 렌더된다.
 */
function parseTable(raw: string): ParsedSection | null {
  const lines = raw.split('\n')

  // 헤더 행 탐색 (| ... 구분 ... | 또는 | ... | 형태)
  const headerIdx = lines.findIndex(l => /^\|/.test(l.trim()) && /내용|구분/.test(l))
  if (headerIdx === -1) return null

  // 구분선 행 확인 (|---|---|)
  const sepIdx = headerIdx + 1
  if (sepIdx >= lines.length || !/^\|[\s|:\-]+\|/.test(lines[sepIdx].trim())) return null

  // 데이터 행 수집
  const rows: { author: string; content: string }[] = []
  let i = sepIdx + 1
  while (i < lines.length && /^\|/.test(lines[i].trim())) {
    // | 로 split, 앞뒤 빈 조각 제거
    const parts = lines[i].split('|')
    const cells = parts.slice(1, parts.length - 1).map(c => c.trim())
    if (cells.length >= 2) {
      const author  = cells[0]
      const content = cells.slice(1).join('|').replace(/<br\s*\/?>/gi, '\n').trim()
      rows.push({ author, content })
    }
    i++
  }

  if (rows.length === 0) return null

  return {
    preTable:  lines.slice(0, headerIdx).join('\n').trim(),
    rows,
    postTable: lines.slice(i).join('\n').trim(),
  }
}

// ── 보고서 본문 렌더러 ────────────────────────────────────────────

function ReportBody({ content }: { content: string }) {
  const parsed = parseTable(content)

  if (!parsed) {
    return <Md content={content} />
  }

  return (
    <div className="space-y-1">
      {parsed.preTable && <Md content={parsed.preTable} />}

      {/* 테이블을 인물별 블록으로 렌더 */}
      <div className="space-y-5">
        {parsed.rows.map((row, idx) => (
          <div key={idx}>
            {row.author && (
              <div className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2 pb-1 border-b border-border">
                {row.author}
              </div>
            )}
            <Md content={row.content} />
          </div>
        ))}
      </div>

      {parsed.postTable && <Md content={parsed.postTable} />}
    </div>
  )
}

// ── 카드 컴포넌트 ─────────────────────────────────────────────────

export function WeeklyRawView({ reports }: { reports: WeeklyReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
        <FileText size={36} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">이 주차에 수집된 원본이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {reports.map(r => (
        <article key={r.id} className="rounded-xl border border-border bg-card overflow-hidden">
          {/* 카드 헤더 */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border text-2xs text-ink-400">
            <FileText size={12} className="text-ink-400" />
            <span className="font-medium text-ink-500">{SOURCE_LABEL[r.source] ?? r.source}</span>
            {r.author && <><span>·</span><span>{r.author}</span></>}
            <span>·</span>
            <span className="font-mono">{fmtDatetime(r.updated_at)}</span>
          </div>
          {/* 본문 */}
          <div className="px-5 py-5 border-l-4 border-lilac-200">
            <div className="text-base font-bold text-foreground mb-4">
              {r.team} / 주간업무보고
            </div>
            {r.raw_content
              ? <ReportBody content={r.raw_content} />
              : <p className="text-sm text-ink-400">원본 내용이 비어 있습니다.</p>
            }
          </div>
        </article>
      ))}
    </div>
  )
}
