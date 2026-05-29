'use client'

import { useState, useEffect, useCallback } from 'react'
import { CloudDownload, RefreshCw, Settings, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { WeeklyWeekList, type WeekData } from './weekly-week-list'
import { WeeklyCollectionDetail } from './weekly-collection-detail'
import { WeeklyContentTabs } from './weekly-content-tabs'
import { getWeeklyReports, getWeeklyInsight, analyzeWeekly } from '@/lib/weekly-service'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'

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

export function WeeklyShell() {
  const [data, setData]                 = useState<CollectionData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<string>('')

  // 리포트 / 인사이트
  const [reports, setReports]         = useState<WeeklyReport[]>([])
  const [insight, setInsight]         = useState<WeeklyInsight | null>(null)
  const [dashLoading, setDashLoading] = useState(false)

  // 수집 진행
  const [collecting, setCollecting]       = useState(false)
  const [collectingAll, setCollectingAll] = useState(false)

  // AI 분석 진행
  const [analyzing, setAnalyzing]   = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [analyzeStatus, setAnalyzeStatus]     = useState<string | null>(null)

  // ── 수집 현황 로드 ───────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/weekly/collection-status')
      const json = await res.json() as CollectionData
      setData(json)
      setSelectedWeek(prev => prev || (json.weeks[0]?.weekStart ?? ''))
    } catch {
      toast.error('수집 현황 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadStatus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 리포트/인사이트 로드 (데이터 있는 주차 선택 시) ──────────────

  const loadReports = useCallback(async (weekStart: string) => {
    setDashLoading(true)
    setReports([])
    setInsight(null)
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

  // 선택 주차 변경 시 해당 주 데이터 조회
  useEffect(() => {
    if (!selectedWeek || !data) return
    const week = data.weeks.find(w => w.weekStart === selectedWeek)
    if (week?.teams.some(t => t.hasData)) {
      loadReports(selectedWeek)
    } else {
      setReports([])
      setInsight(null)
    }
  }, [selectedWeek]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI 분석 ─────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!selectedWeek) return
    setAnalyzing(true)
    setAnalyzeProgress(5)
    try {
      const result = await analyzeWeekly(selectedWeek, msg => {
        setAnalyzeStatus(msg)
        if (msg.includes('조회'))         setAnalyzeProgress(10)
        else if (msg.includes('분석 중')) setAnalyzeProgress(p => Math.min(p + 8, 75))
        else if (msg.includes('종합'))    setAnalyzeProgress(82)
        else if (msg.includes('저장'))    setAnalyzeProgress(95)
      })
      setAnalyzeProgress(100)
      setInsight(result)
      toast.success('AI 분석 완료')
      setTimeout(() => { setAnalyzeProgress(0); setAnalyzeStatus(null) }, 1000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '분석 실패')
      setAnalyzeProgress(0)
      setAnalyzeStatus(null)
    } finally {
      setAnalyzing(false)
    }
  }, [selectedWeek])

  // ── Outline 수집 ─────────────────────────────────────────────────

  const runImport = useCallback(async (opts: { weekStart?: string } = {}) => {
    const res = await fetch('/api/weekly/import-outline', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(opts),
    })
    const result = await res.json()
    if (!result.ok) throw new Error(result.error ?? '수집 실패')
    return result.total as number
  }, [])

  const handleCollectWeek = useCallback(async () => {
    if (!selectedWeek) return
    setCollecting(true)
    try {
      const total = await runImport({ weekStart: selectedWeek })
      toast[total > 0 ? 'success' : 'info'](
        total > 0 ? `수집 완료 — ${total}건 저장` : '해당 주차에 새로 수집된 내용이 없습니다.'
      )
      await loadStatus()
      if (total > 0) loadReports(selectedWeek)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수집 중 오류')
    } finally {
      setCollecting(false)
    }
  }, [selectedWeek, runImport, loadStatus, loadReports])

  const handleCollectAll = useCallback(async () => {
    setCollectingAll(true)
    try {
      const total = await runImport({})
      toast[total > 0 ? 'success' : 'info'](
        total > 0 ? `전체 수집 완료 — ${total}건 저장` : '새로 수집된 내용이 없습니다.'
      )
      await loadStatus()
      if (total > 0 && selectedWeek) loadReports(selectedWeek)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수집 중 오류')
    } finally {
      setCollectingAll(false)
    }
  }, [runImport, loadStatus, loadReports, selectedWeek])

  // ── 파생 값 ──────────────────────────────────────────────────────

  const selectedWeekData   = data?.weeks.find(w => w.weekStart === selectedWeek)
  const hasData            = selectedWeekData?.teams.some(t => t.hasData) ?? false
  const isCollectingAny    = collecting || collectingAll || analyzing
  const collectedWeekCount = data?.weeks.filter(w => w.teams.some(t => t.hasData)).length ?? 0
  const weekCount          = data?.weeks.length ?? 0

  const prevWeekStart = selectedWeek
    ? (() => {
        const d = new Date(selectedWeek + 'T00:00:00')
        d.setDate(d.getDate() - 7)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      })()
    : ''

  // ── 렌더 ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 좌측: 주차 목록 */}
      <div className="shrink-0 border-r bg-muted flex flex-col overflow-hidden" style={{ width: 'var(--sidebar-w)' }}>
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

        {!loading && data && weekCount > 0 && (
          <div className="shrink-0 px-4 py-2 border-b border-border">
            <p className="text-2xs text-ink-400">
              최근 {weekCount}주차 · {collectedWeekCount}주 수집됨
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw size={14} className="animate-spin text-ink-400" />
          </div>
        ) : data?.teams.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-2xs text-muted-foreground">연동된 팀이 없어요</p>
            <a href="/settings?section=weekly" className="flex items-center gap-1 text-2xs text-lilac-600 hover:underline">
              <Settings size={11} />
              설정에서 추가하기
            </a>
          </div>
        ) : (
          <WeeklyWeekList
            weeks={data?.weeks ?? []}
            selectedWeek={selectedWeek}
            onSelect={setSelectedWeek}
            teamColors={TEAM_PALETTE}
          />
        )}
      </div>

      {/* 우측: 상세 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* AI 분석 진행 바 */}
        {analyzing && (
          <div className="shrink-0 border-b bg-card px-4 py-2 flex items-center gap-3">
            <RefreshCw size={11} className="animate-spin text-lilac-500 shrink-0" />
            <div className="flex-1 h-1 rounded-full bg-ink-100 overflow-hidden">
              <div
                className="h-full bg-lilac-500 rounded-full"
                style={{ width: `${analyzeProgress}%`, transition: 'width 0.5s ease-out' }}
              />
            </div>
            {analyzeStatus && (
              <span className="text-xs text-ink-400 shrink-0 max-w-[220px] truncate">{analyzeStatus}</span>
            )}
          </div>
        )}

        {!selectedWeekData ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <BookOpen size={40} strokeWidth={1.5} className="text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground">주차를 선택해 주세요</p>
          </div>
        ) : hasData ? (
          /* 수집된 주차 → 탭 뷰 (원문/요약/인사이트) */
          <WeeklyContentTabs
            week={selectedWeekData}
            teamColors={TEAM_PALETTE}
            reports={reports}
            insight={insight}
            reportsLoading={dashLoading}
            prevWeekStart={prevWeekStart}
            collecting={collecting}
            onCollect={handleCollectWeek}
            onAnalyze={handleAnalyze}
            analyzing={analyzing}
            onInsightUpdate={setInsight}
            onRefresh={() => loadReports(selectedWeek)}
          />
        ) : (
          /* 미수집 주차 → 수집 유도 */
          <WeeklyCollectionDetail
            week={selectedWeekData}
            teamColors={TEAM_PALETTE}
            collecting={collecting}
            onCollect={handleCollectWeek}
            onOpenAnalysis={() => {}}
            hasAnalysis={false}
          />
        )}
      </div>
    </div>
  )
}
