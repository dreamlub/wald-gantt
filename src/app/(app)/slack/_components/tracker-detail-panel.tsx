'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, GitBranch, Link2, Loader2, MessageSquareText, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandIcon } from '@/components/brand-icon'
import { useBrandProfiles } from '@/hooks/use-brand-profiles'
import type { HistoryItem } from '../_lib/types'
import {
  type TrackerIssueRow, type Relation,
  TYPE_META, STATUS_META, REL_META, nodeStatus, ageTxt, toBullets, cleanText,
} from './_tracker-shared'

function DetailMetric({
  icon: Icon, label, value,
}: {
  icon: typeof MessageSquareText
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon size={11} />
        {label}
      </div>
      <p className="mt-1.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function DetailEmpty() {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center">
      <div>
        <GitBranch size={20} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">왼쪽 계층에서 이슈를 선택하세요</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          선택한 이슈의 설명, 조치, 연결된 Slack 메시지 수와 관계가 여기에 표시됩니다.
        </p>
      </div>
    </div>
  )
}

export function IssueDetailPanel({
  issue, relations, evidenceCount, childCount, titleOf, onSelect, onStatusChange,
}: {
  issue: TrackerIssueRow | null
  relations: Relation[]
  evidenceCount: number
  childCount: number
  titleOf: (id: string) => string
  onSelect: (id: string) => void
  onStatusChange: (id: string, newStatus: 'open' | 'closed', includeChildren: boolean) => Promise<void>
}) {
  const profiles = useBrandProfiles()
  const [messages, setMessages] = useState<HistoryItem[]>([])
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setConfirmOpen(false)
    if (!issue) { setMessages([]); setExpandedMsgId(null); return }
    setExpandedMsgId(null)
    fetch(`/api/history?issue_id=${issue.id}&limit=50`)
      .then(r => r.json())
      .then(({ items }: { items: HistoryItem[] }) => setMessages(items ?? []))
      .catch(() => setMessages([]))
  }, [issue?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!issue) return <DetailEmpty />

  const st = nodeStatus(issue)
  const status = STATUS_META[st]
  const isClosed = issue.status === 'closed'
  const issueId = issue.id

  async function handleCloseClick() {
    if (!isClosed && childCount > 0) {
      setConfirmOpen(true)
      return
    }
    setUpdating(true)
    try { await onStatusChange(issueId, isClosed ? 'open' : 'closed', false) }
    finally { setUpdating(false) }
  }

  async function handleConfirm(includeChildren: boolean) {
    setConfirmOpen(false)
    setUpdating(true)
    try { await onStatusChange(issueId, 'closed', includeChildren) }
    finally { setUpdating(false) }
  }

  return (
    <div data-scrolltop className="h-full overflow-y-auto px-5 py-5">
      {/* 헤더 */}
      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className={cn(
            'flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
            st === 'active' ? 'bg-status-late/10 text-status-late' : st === 'warn' ? 'bg-status-warn/10 text-status-warn' : 'bg-muted text-muted-foreground',
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
            {status.label}
          </span>
          {issue.brand_name && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-ink-100 text-ink-700">
              <BrandIcon name={issue.brand_name} logoUrl={profiles.get(issue.brand_name)?.logo_url} lucideIcon={profiles.get(issue.brand_name)?.lucide_icon} size={14} />
              {issue.brand_name}
            </span>
          )}
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full border"
            style={{ color: TYPE_META[issue.type].color, borderColor: TYPE_META[issue.type].color }}
          >
            {TYPE_META[issue.type].label}
          </span>
        </div>
        <h2 className="text-lg font-bold leading-snug text-foreground">{issue.title}</h2>

        {/* 상태 토글 버튼 */}
        <div className="mt-3">
          {!confirmOpen ? (
            <button
              onClick={handleCloseClick}
              disabled={updating}
              aria-label={isClosed ? '이슈 다시 열기' : '이슈 해결 완료'}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                isClosed
                  ? 'border-ink-200 text-ink-400 hover:bg-ink-50'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 hover:border-ink-300',
                updating && 'opacity-50 pointer-events-none',
              )}
            >
              {updating
                ? <Loader2 size={12} className="animate-spin" />
                : isClosed
                  ? <RotateCcw size={12} />
                  : <CheckCircle2 size={12} />
              }
              {isClosed ? '다시 열기' : '해결 완료'}
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">자식 이슈 {childCount}건도 함께 닫을까요?</span>
              <button
                onClick={() => handleConfirm(true)}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-ink-300 text-ink-600 hover:bg-ink-50 transition-colors"
              >
                {childCount}건 포함
              </button>
              <button
                onClick={() => handleConfirm(false)}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-ink-200 text-ink-400 hover:bg-ink-50 transition-colors"
              >
                부모만
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className="text-xs text-ink-300 hover:text-ink-500 transition-colors"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 메트릭 */}
      <div className="mb-5 grid grid-cols-3 gap-2">
        <DetailMetric icon={MessageSquareText} label="Slack 연결" value={`${evidenceCount}건`} />
        <DetailMetric icon={CalendarDays} label="최근 언급" value={ageTxt(issue.last_seen)} />
        <DetailMetric icon={Link2} label="관계" value={`${relations.length}건`} />
      </div>

      {issue.body && (
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">상세 설명</h3>
          <ul className="rounded-md border bg-card px-4 py-3 space-y-2">
            {toBullets(issue.body).map((line, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
                <span className="shrink-0 text-ink-300 mt-px">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {issue.action && (
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">다음 조치</h3>
          <div className="rounded-md border border-status-late/20 bg-status-late/5 px-4 py-3">
            <p className="text-sm font-medium leading-relaxed text-status-late">{issue.action}</p>
          </div>
        </section>
      )}

      <section className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">기간</h3>
        <div className="rounded-md border bg-card px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">처음 발견</span>
            <span className="font-medium text-foreground">{issue.first_seen.slice(0, 10)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">마지막 언급</span>
            <span className="font-medium text-foreground">{issue.last_seen.slice(0, 10)}</span>
          </div>
        </div>
      </section>

      {relations.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">연결 관계</h3>
          <div className="space-y-1.5">
            {relations.map(r => {
              const outgoing = r.from_issue_id === issue.id
              const other = outgoing ? r.to_issue_id : r.from_issue_id
              const m = REL_META[r.relation_type]
              return (
                <button
                  key={r.id}
                  onClick={() => onSelect(other)}
                  className="w-full rounded-md border bg-card px-3 py-2 text-left hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {outgoing ? m.from : '←'} {m.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{titleOf(other)}</span>
                  </div>
                  {r.note && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.note}</p>}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {messages.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            슬랙 연결 <span className="normal-case font-normal text-ink-400">{messages.length}건</span>
          </h3>
          <div className="space-y-1.5">
            {messages.map(msg => {
              const expanded = expandedMsgId === msg.id
              return (
                <button
                  key={msg.id}
                  onClick={() => setExpandedMsgId(expanded ? null : msg.id)}
                  className="w-full rounded-md border bg-card px-3 py-2 text-left hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">{msg.occurred_at.slice(0, 10)}</span>
                    {msg.author && (
                      <span className="text-xs font-medium text-foreground">{msg.author}</span>
                    )}
                    {msg.channel && (
                      <span className="text-xs text-ink-400 truncate">#{msg.channel}</span>
                    )}
                  </div>
                  <p className={`text-sm text-foreground leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                    {msg.title}
                  </p>
                  {expanded && msg.body && (
                    <p className="mt-2 text-xs text-ink-500 leading-relaxed whitespace-pre-wrap border-t border-border pt-2">
                      {cleanText(msg.body)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
