'use client'

import { useState, useEffect, useCallback } from 'react'
import { CloudDownload, RefreshCw, Settings, BookOpen, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { WeeklyWeekList, type WeekData } from './weekly-week-list'
import { WeeklyCollectionDetail } from './weekly-collection-detail'
import { WeeklyDashboard, type WeeklyTab } from './weekly-dashboard'
import { getWeeklyReports, getWeeklyInsight, analyzeWeekly } from '@/lib/weekly-service'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'

// 팀 색상 팔레트 (sort_order 인덱스 기준)
const TEAM_PALETTE = [
  'var(--color-id-indigo)',
  'var(--color-id-purple)',
  'var(--color-id-green)',
  'var(--color-id-amber)',
  'var(--color-id-pink)',
  'var(--color-id-blue)',
  'var(--color-id-teal)',
  'var(--color-id-orange)',
]

interface CollectionData {
  teams: { id: string; label: string; sort_order: number; collection_id: string }[]
  weeks: WeekData[]
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function WeeklyShell() {
  const [data, setData]           = useState<CollectionData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<string>('')

  // 분석 관련 상태
  const [showAnalysis, setShowAnalysis]   = useState(false)
  const [tab, setTab]                     = useState<WeeklyTab>('insight')
  const [reports, setReports]             = useState<WeeklyReport[]>([])
  const [insight, setInsight]             = useState<WeeklyInsight | null>(null)
  const [dashLoading, setDashLoading]     = useState(false)

  // 수집 진행 상태
  const [collecting, setCollecting]         = useState(false)
  const [collectingAll, setCollectingAll]   = useState(false)
  const [autoAnalyzing, setAutoAnalyzing]   = useState(false)
  const [autoProgress, setAutoProgress]     = useState(0)
  const [autoStatus, setAutoStatus]         = useState<string | null>(null)

  // ── 수집 현황 로드 ───────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/weekly/collection-status')
      const json = await res.json() as CollectionData
      setData(json)
      if (!selectedWeek && json.weeks.length > 0) {
        setSelectedWeek(json.weeks[0].weekStart)
      }
    } catch {
      toast.error('수집 현황 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [selectedWeek])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 분석 데이터 로드 ─────────────────────────────────────────────

  const loadAnalysis = useCallback(async (weekStart: string) => {
    setDashLoading(true)
    try {
      const [r, i] = await Promise.all([
        getWeeklyReports(weekStart),
        getWeeklyInsight(weekStart),
      ])
      setReports(r)
      setInsight(i)
    } finally {
      setDashLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (showAnalysis && selectedWeek) loadAnalysis(selectedWeek)
  }, [showAnalysis, selectedWeek, loadAnalysis])

  // ── AI 자동 분류 ─────────────────────────────────────────────────

  const handleAutoAnalyze = useCallback(async (weekStart: string) => {
    setAutoAnalyzing(true)
    setAutoProgress(5)
    try {
      const result = await analyzeWeekly(weekStart, msg => {
        setAutoStatus(msg)
        if (msg.includes('조회'))         setAutoProgress(10)
        else if (msg.includes('분석 중')) setAutoProgress(p => Math.min(p + 8, 75))
        else if (msg.includes('종합'))    setAutoProgress(82)
        else if (msg.includes('저장'))    setAutoProgress(95)
      })
      setAutoProgress(100)
      setInsight(result)
      toast.success('AI 분류 완료')
      setTimeout(() => { setAutoProgress(0); setAutoStatus(null) }, 1000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '분석 실패')
      setAutoProgress(0); setAutoStatus(null)
    } finally {
      setAutoAnalyzing(false)
    }
  }, [])

  // ── Outline 수집 ─────────────────────────────────────────────────

  // 기존 API는 collectionId(단수)만 지원 — null이면 전체 수집
  const runImport = useCallback(async (collectionId: string | null) => {
    const res = await fetch('/api/weekly/import-outline', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(collectionId ? { collectionId } : {}),
    })
    const result = await res.json()
    if (!result.ok) throw new Error(result.error ?? '수집 실패')
    return result.total as number
  }, [])

  /** 이 주차 수집 (전체 팀 재수집 — API가 특정 주차만 수집하는 기능 없음) */
  const handleCollectWeek = useCallback(async () => {
    if (!selectedWeek) return
    setCollecting(true)
    try {
      const total = await runImport(null)
      toast.success(total > 0 ? `수집 완료 — ${total}건 저장` : '새로 수집된 내용이 없습니다')
      await loadStatus()
      if (total > 0) handleAutoAnalyze(selectedWeek)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수집 중 오류')
    } finally {
      setCollecting(false)
    }
  }, [selectedWeek, runImport, loadStatus, handleAutoAnalyze])

  /** 전체 팀 수집 */
  const handleCollectAll = useCallback(async () => {
    setCollectingAll(true)
    try {
      const total = await runImport(null)
      toast.success(total > 0 ? `수집 완료 — ${total}건 저장` : '새로 수집된 내용이 없습니다')
      const today    = new Date().toISOString().slice(0, 10)
      const monday   = getMondayOf(today)
      await loadStatus()
      if (total > 0) handleAutoAnalyze(monday)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수집 중 오류')
    } finally {
      setCollectingAll(false)
    }
  }, [runImport, loadStatus, handleAutoAnalyze])

  // ── 파생 값 ──────────────────────────────────────────────────────

  const selectedWeekData   = data?.weeks.find(w => w.weekStart === selectedWeek)
  const isCollectingAny    = collecting || collectingAll || autoAnalyzing
  const collectedWeekCount = data?.weeks.filter(w => w.teams.some(t => t.hasData)).length ?? 0
  const weekCount          = data?.weeks.length ?? 0

  // ── 렌더 ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 좌측: 주차 목록 */}
      <div className="shrink-0 border-r bg-muted flex flex-col overflow-hidden" style={{ width: 'var(--sidebar-w)' }}>
        {/* 헤더 */}
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0 gap-2">
          <BookOpen size={14} className="text-ink-400 shrink-0" />
          <h1 className="flex-1 text-sm font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap truncate">
            주간보고 수집
          </h1>
          <button
            onClick={handleCollectAll}
            disabled={isCollectingAny}
            title="전체 팀 수집"
            className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {collectingAll
              ? <RefreshCw size={14} className="animate-spin" />
              : <CloudDownload size={14} />
            }
          </button>
        </div>

        {/* 부제 */}
        {!loading && data && (
          <div className="shrink-0 px-4 py-2 border-b border-border">
            <p className="text-2xs text-ink-400">
              수집 현황 · 최근 {weekCount}주차 중 {collectedWeekCount}주 수집됨
            </p>
          </div>
        )}

        {/* 주차 목록 */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw size={14} className="animate-spin text-ink-400" />
          </div>
        )}
        {!loading && data?.weeks && (
          <WeeklyWeekList
            weeks={data.weeks}
            selectedWeek={selectedWeek}
            onSelect={setSelectedWeek}
            teamColors={TEAM_PALETTE}
          />
        )}
        {!loading && data && data.teams.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-2xs text-muted-foreground">연동된 팀이 없어요</p>
            <a href="/settings?section=weekly" className="flex items-center gap-1 text-2xs text-lilac-600 hover:underline">
              <Settings size={11} />
              설정에서 추가하기
            </a>
          </div>
        )}
      </div>

      {/* 우측: 상세 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* AI 분류 진행 바 */}
        {autoAnalyzing && (
          <div className="shrink-0 border-b bg-card px-4 py-2 flex items-center gap-3">
            <RefreshCw size={11} className="animate-spin text-lilac-500 shrink-0" />
            <div className="flex-1 h-1 rounded-full bg-ink-100 overflow-hidden">
              <div
                className="h-full bg-lilac-500 rounded-full"
                style={{ width: `${autoProgress}%`, transition: 'width 0.5s ease-out' }}
              />
            </div>
            {autoStatus && (
              <span className="text-xs text-ink-400 shrink-0 max-w-[220px] truncate">{autoStatus}</span>
            )}
          </div>
        )}

        {!selectedWeekData ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <BookOpen size={40} strokeWidth={1.5} className="text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground">주차를 선택해 주세요</p>
          </div>
        ) : showAnalysis ? (
          /* 분석 뷰 */
          <>
            <div className="shrink-0 h-12 flex items-center px-4 border-b bg-card gap-3">
              <button
                onClick={() => setShowAnalysis(false)}
                className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-foreground transition-colors"
              >
                <ArrowLeft size={12} />
                수집 현황으로
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 max-w-[1200px] mx-auto w-full">
              <WeeklyDashboard
                weekStart={selectedWeek}
                reports={reports}
                insight={insight}
                reportsLoading={dashLoading}
                tab={tab}
                onTabChange={setTab}
                onInsightUpdate={setInsight}
                onRefresh={() => loadAnalysis(selectedWeek)}
              />
            </div>
          </>
        ) : (
          /* 수집 현황 뷰 */
          <WeeklyCollectionDetail
            week={selectedWeekData}
            teamColors={TEAM_PALETTE}
            collecting={collecting}
            onCollect={handleCollectWeek}
            onOpenAnalysis={() => { setShowAnalysis(true); setTab('insight') }}
            hasAnalysis={selectedWeekData.teams.some(t => t.hasData)}
          />
        )}
      </div>
    </div>
  )
}
