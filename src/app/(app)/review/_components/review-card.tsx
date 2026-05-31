'use client'

import { useState } from 'react'
import type { ReviewCandidate, ReviewStatus } from '@/types'

export interface TaskDraft {
  title: string
  memo: string | null
  due_date: string | null
  priority: number | null
  project_ids?: string[]
}

interface Project {
  id: string
  name: string
}

interface Props {
  candidate: ReviewCandidate
  projects: Project[]
  onAction: (id: string, status: ReviewStatus, task?: TaskDraft) => Promise<void>
  readonly?: boolean
}

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  daily_report: { label: 'Daily',   className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  weekly:       { label: 'Weekly',  className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  note:         { label: 'Note',    className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
}

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  high:   { label: '높음', className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
  medium: { label: '보통', className: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' },
  low:    { label: '낮음', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
}

function toPriorityNum(p: ReviewCandidate['priority']): number | null {
  if (p === 'high') return 3
  if (p === 'medium') return 2
  if (p === 'low') return 1
  return null
}

export function ReviewCard({ candidate, projects, onAction, readonly = false }: Props) {
  const [expanded, setExpanded]           = useState(false)
  const [draftTitle, setDraftTitle]       = useState(candidate.title)
  const [draftMemo, setDraftMemo]         = useState(candidate.memo ?? '')
  const [draftDueDate, setDraftDueDate]   = useState(candidate.due_date ?? '')
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [submitting, setSubmitting]       = useState(false)

  const sourceBadge   = SOURCE_BADGE[candidate.source]
  const priorityBadge = candidate.priority ? PRIORITY_BADGE[candidate.priority] : null

  function toggleProject(id: string) {
    setSelectedProjects(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  async function handleCreate() {
    if (!draftTitle.trim()) return
    setSubmitting(true)
    try {
      await onAction(candidate.id, 'created', {
        title: draftTitle.trim(),
        memo: draftMemo.trim() || null,
        due_date: draftDueDate || null,
        priority: toPriorityNum(candidate.priority),
        project_ids: selectedProjects.length > 0 ? selectedProjects : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      {/* 상단: 배지 + 브랜드 */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          {sourceBadge && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${sourceBadge.className}`}>
              {sourceBadge.label}
            </span>
          )}
          {priorityBadge && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${priorityBadge.className}`}>
              {priorityBadge.label}
            </span>
          )}
        </div>
        {candidate.brand && (
          <span className="ml-auto text-xs text-ink-400 shrink-0">{candidate.brand}</span>
        )}
      </div>

      {/* 제목 */}
      <p className="font-semibold text-sm text-foreground leading-snug">{candidate.title}</p>

      {/* 메모 */}
      {candidate.memo && (
        <p className="text-sm text-ink-500 line-clamp-2 leading-relaxed">{candidate.memo}</p>
      )}

      {/* 메타 */}
      <div className="flex items-center gap-3 text-xs text-ink-400">
        {candidate.source_date && <span>{candidate.source_date}</span>}
        {candidate.due_date && <span>마감 {candidate.due_date}</span>}
        {candidate.estimated_minutes != null && (
          <span>약 {candidate.estimated_minutes}분</span>
        )}
        {candidate.evidence_count > 1 && (
          <span className="text-ink-300">{candidate.evidence_count}건 관련</span>
        )}
      </div>

      {/* readonly(검토 완료 탭) 상태 표시 */}
      {readonly && (
        <div className="text-xs text-ink-400 pt-1">
          {candidate.status === 'created' && candidate.task_id
            ? <span className="text-mint-600">✓ 태스크 생성됨</span>
            : candidate.status === 'snoozed'
              ? <span>보류됨</span>
              : <span>무시됨</span>
          }
          {candidate.reviewed_at && (
            <span className="ml-2">{candidate.reviewed_at.slice(0, 10)}</span>
          )}
        </div>
      )}

      {/* 액션 버튼 (pending 탭에서만) */}
      {!readonly && !expanded && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setExpanded(true)}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-80 transition-opacity"
          >
            태스크 만들기
          </button>
          <button
            onClick={() => onAction(candidate.id, 'snoozed')}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-border text-ink-500 hover:bg-muted transition-colors"
          >
            보류
          </button>
          <button
            onClick={() => onAction(candidate.id, 'ignored')}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-ink-400 hover:text-ink-600 transition-colors"
          >
            무시
          </button>
        </div>
      )}

      {/* 인라인 태스크 생성 폼 */}
      {!readonly && expanded && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border mt-1">
          <input
            type="text"
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            placeholder="제목"
            className="w-full text-sm px-3 py-1.5 border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-lilac-300 placeholder:text-ink-300"
          />
          <textarea
            value={draftMemo}
            onChange={e => setDraftMemo(e.target.value)}
            placeholder="메모 (선택)"
            rows={2}
            className="w-full text-sm px-3 py-1.5 border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-lilac-300 placeholder:text-ink-300 resize-none"
          />
          <input
            type="date"
            value={draftDueDate}
            onChange={e => setDraftDueDate(e.target.value)}
            className="w-full text-sm px-3 py-1.5 border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-lilac-300"
          />

          {/* 프로젝트 연결 */}
          {projects.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-400 font-medium">프로젝트 연결 (선택)</span>
              <div className="flex flex-wrap gap-1.5">
                {projects.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProject(p.id)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      selectedProjects.includes(p.id)
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border text-ink-500 hover:border-ink-400 hover:text-foreground'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!draftTitle.trim() || submitting}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              생성
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="px-3 py-1.5 rounded-md text-sm font-medium border border-border text-ink-500 hover:bg-muted transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
