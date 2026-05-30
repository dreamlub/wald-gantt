'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { ReviewCandidate, ReviewStatus } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { ReviewCard } from './review-card'

interface TaskDraft {
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

type StatusTab = 'pending' | 'snoozed' | 'created' | 'ignored'

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'pending',  label: '검토 대기' },
  { key: 'snoozed',  label: '보류' },
  { key: 'created',  label: '생성됨' },
  { key: 'ignored',  label: '무시됨' },
]

export function ReviewShell() {
  const [candidates, setCandidates]   = useState<ReviewCandidate[]>([])
  const [projects, setProjects]       = useState<Project[]>([])
  const [loading, setLoading]         = useState(true)
  const [populating, setPopulating]   = useState(false)
  const [activeTab, setActiveTab]     = useState<StatusTab>('pending')
  const [filterSource, setFilterSource]     = useState<string>('all')
  const [filterBrand, setFilterBrand]       = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')

  // 프로젝트 목록 (태스크 생성 시 프로젝트 연결용)
  useEffect(() => {
    async function loadProjects() {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: member } = await sb
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single()
      if (!member) return
      const { data } = await sb
        .from('gantt_projects')
        .select('id, name')
        .eq('workspace_id', member.workspace_id)
        .is('deleted_at', null)
        .order('name')
      setProjects((data ?? []) as Project[])
    }
    void loadProjects()
  }, [])

  const fetchCandidates = useCallback(async (tab: StatusTab) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/review/candidates?status=${tab}`)
      if (res.ok) {
        setCandidates(await res.json() as ReviewCandidate[])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchCandidates(activeTab)
  }, [activeTab, fetchCandidates])

  async function handlePopulate() {
    setPopulating(true)
    try {
      const res = await fetch('/api/review/populate', { method: 'POST' })
      const body = await res.json() as { inserted?: number; error?: string }
      if (!res.ok) {
        toast.error(body.error ?? '후보 수집 실패')
        return
      }
      toast.success(`후보 ${body.inserted ?? 0}건 수집 완료`)
      await fetchCandidates(activeTab)
    } finally {
      setPopulating(false)
    }
  }

  async function handleAction(id: string, status: ReviewStatus, task?: TaskDraft) {
    const res = await fetch(`/api/review/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, task }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      toast.error(body.error ?? '처리에 실패했습니다')
      return
    }
    if (status === 'created') toast.success('태스크가 생성되었습니다')
    // 현재 탭에서 처리된 항목만 즉시 제거 (pending → 다른 탭으로 이동)
    setCandidates(prev => prev.filter(c => c.id !== id))
  }

  const brands = [...new Set(candidates.map(c => c.brand).filter((b): b is string => Boolean(b)))]

  const filtered = candidates.filter(c => {
    if (filterSource !== 'all' && c.source !== filterSource) return false
    if (filterBrand !== 'all' && c.brand !== filterBrand) return false
    if (filterPriority !== 'all' && c.priority !== filterPriority) return false
    return true
  })

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* 헤더 */}
      <div className="h-12 flex items-center gap-3 px-5 border-b bg-card shrink-0">
        <h1 className="text-sm font-semibold text-foreground">Review Inbox</h1>
        {!loading && activeTab === 'pending' && filtered.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-foreground text-background text-xs font-medium">
            {filtered.length}
          </span>
        )}
        <button
          onClick={handlePopulate}
          disabled={populating || loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border text-ink-500 hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={populating ? 'animate-spin' : ''} />
          후보 수집
        </button>
      </div>

      {/* 상태 탭 */}
      <div className="flex items-center gap-0 px-5 border-b bg-card shrink-0">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-ink-400 hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 필터바 */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b shrink-0">
        <select
          value={filterSource}
          onChange={e => setFilterSource(e.target.value)}
          className="text-sm px-2 py-1 border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-lilac-300"
        >
          <option value="all">전체 소스</option>
          <option value="daily_report">Daily</option>
          <option value="weekly">Weekly</option>
        </select>

        <select
          value={filterBrand}
          onChange={e => setFilterBrand(e.target.value)}
          className="text-sm px-2 py-1 border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-lilac-300"
        >
          <option value="all">전체 브랜드</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="text-sm px-2 py-1 border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-lilac-300"
        >
          <option value="all">전체 우선순위</option>
          <option value="high">높음</option>
          <option value="medium">보통</option>
          <option value="low">낮음</option>
        </select>
      </div>

      {/* 카드 목록 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-ink-400">
            불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1 text-sm text-ink-400">
            <span>
              {activeTab === 'pending'
                ? '검토할 후보가 없습니다. 후보 수집을 눌러주세요.'
                : `${STATUS_TABS.find(t => t.key === activeTab)?.label} 항목이 없습니다.`}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-2xl">
            {filtered.map(c => (
              <ReviewCard
                key={c.id}
                candidate={c}
                projects={projects}
                onAction={handleAction}
                readonly={activeTab !== 'pending'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
