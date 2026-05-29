'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, RefreshCw, Settings, CalendarDays, Sparkles, ArrowUpRight, CloudDownload } from 'lucide-react'
import type { WeeklyTeam } from '../_lib/types'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import { WeeklySidebar } from './weekly-sidebar'
import { WeeklyDashboard } from './weekly-dashboard'
import { getWeeklyMatrix, getWeeklyReports, getWeeklyInsight, analyzeWeekly } from '@/lib/weekly-service'
import { addDaysYMD } from '@/lib/kst'
import { toast } from 'sonner'

function fmtHeader(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function fmtPrev(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function prevWeekOf(isoDate: string): string {
  return addDaysYMD(isoDate, -7)
}

export function WeeklyShell() {
  const [teams, setTeams]               = useState<WeeklyTeam[]>([])
  const [weeks, setWeeks]               = useState<string[]>([])
  const [byWeek, setByWeek]             = useState<Map<string, Map<string, WeeklyReport>>>(new Map())
  const [selectedIso, setSelectedIso]   = useState<string>('')
  const [focusedTeam, setFocusedTeam]   = useState<string | null>(null)  // 사이드바에서 특정 팀 클릭 시 그 팀만 원본
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixError, setMatrixError]   = useState<string | null>(null)
  const [showInsight, setShowInsight]   = useState(false)
  const [showRaw, setShowRaw]           = useState(false)

  const [reports, setReports]         = useState<WeeklyReport[]>([])
  const [insight, setInsight]         = useState<WeeklyInsight | null>(null)
  const [dashLoading, setDashLoading] = useState(false)

  // AI 분석 진행 상태
  const [autoAnalyzing, setAutoAnalyzing]             = useState(false)
  const [autoAnalyzeProgress, setAutoAnalyzeProgress] = useState(0)
  const [autoAnalyzeStatus, setAutoAnalyzeStatus]     = useState<string | null>(null)

  const prevWeekStart = selectedIso ? prevWeekOf(selectedIso) : ''

  useEffect(() => {
    fetch('/api/weekly/teams')
      .then(r => r.json())
      .then((data: WeeklyTeam[]) => setTeams(data))
      .catch(() => setTeams([]))
  }, [])

  /** 전체 팀×주차 매트릭스 로드 — 사이드바 수집 현황의 데이터 소스 */
  const loadMatrix = useCallback(async (selectAfter?: string): Promise<string[]> => {
    setMatrixLoading(true)
    setMatrixError(null)
    try {
      const { weeks: ws, byWeek: bw } = await getWeeklyMatrix()
      setWeeks(ws)
      setByWeek(bw)
      const next = selectAfter && ws.includes(selectAfter) ? selectAfter : ws[0]
      if (next) setSelectedIso(next)
      return ws
    } catch (e) {
      setMatrixError(e instanceof Error ? e.message : '수집 현황 조회 실패')
      return []
    } finally {
      setMatrixLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMatrix()
  }, [loadMatrix])

  const fetchDashData = useCallback(async (weekStart: string) => {
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
    } catch {
      // 빈 상태 유지
    } finally {
      setDashLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedIso) fetchDashData(selectedIso)
  }, [selectedIso, fetchDashData])

  const handleRefresh = useCallback(() => {
    if (selectedIso) fetchDashData(selectedIso)
  }, [selectedIso, fetchDashData])

  /** 주차 선택 — 원본을 기본 화면으로 표시 (슬랙 흐름과 동일) */
  const handleSelectWeek = useCallback((weekStart: string) => {
    setFocusedTeam(null)
    setSelectedIso(weekStart)
    setShowRaw(true)
    setShowInsight(false)
  }, [])

  /** 주차 + 특정 팀 선택 — 그 팀 원본만 표시 */
  const handleSelectTeamWeek = useCallback((weekStart: string, teamLabel: string) => {
    setFocusedTeam(teamLabel)
    setSelectedIso(weekStart)
    setShowRaw(true)
    setShowInsight(false)
  }, [])

  /** 선택 주차 AI 분석 — 'AI 요약' / 분석 버튼으로 수동 실행 */
  const handleAnalyze = useCallback(async (weekStart: string) => {
    setAutoAnalyzing(true)
    setAutoAnalyzeProgress(5)
    setAutoAnalyzeStatus(null)
    try {
      const result = await analyzeWeekly(weekStart, (msg) => {
        setAutoAnalyzeStatus(msg)
        if (msg.includes('조회'))         setAutoAnalyzeProgress(10)
        else if (msg.includes('분석 중')) setAutoAnalyzeProgress(p => Math.min(p + 8, 75))
        else if (msg.includes('종합'))    setAutoAnalyzeProgress(82)
        else if (msg.includes('저장'))    setAutoAnalyzeProgress(95)
      })
      setAutoAnalyzeProgress(100)
      setInsight(result)
      setShowRaw(false)
      setShowInsight(true)
      fetchDashData(weekStart)
      toast.success('AI 분류 완료')
      setTimeout(() => { setAutoAnalyzeProgress(0); setAutoAnalyzeStatus(null) }, 1000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '분석 실패')
      setAutoAnalyzeProgress(0)
      setAutoAnalyzeStatus(null)
    } finally {
      setAutoAnalyzing(false)
    }
  }, [fetchDashData])

  const [importing, setImporting]               = useState(false)
  const [collectingTeamId, setCollectingTeamId] = useState<string | null>(null)

  /** Outline 수집 — collectionId 지정 시 해당 팀만, 없으면 전체 팀 수집 (분석은 별도) */
  const runImport = useCallback(async (collectionId: string | null) => {
    try {
      const res = await fetch('/api/weekly/import-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectionId ? { collectionId } : {}),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(`수집 실패: ${data.error}`)
        return
      }
      const total: number = data.total ?? 0
      const results: { quarterDocsFound: string[] }[] = data.results ?? []
      const docCount = results.reduce((s: number, r: { quarterDocsFound: string[] }) => s + r.quarterDocsFound.length, 0)
      if (total === 0 && docCount === 0) {
        toast.warning('수집된 분기 문서가 없습니다. Outline 문서 제목을 확인해 주세요.')
      } else if (total === 0) {
        toast.warning(`분기 문서 ${docCount}개를 찾았지만 섹션이 없습니다. 날짜 형식(## YYYY-MM-DD)을 확인해 주세요.`)
      } else {
        toast.success(`수집 완료 — ${total}건 저장`)
      }
      // 수집만 수행 — 분석은 사용자가 별도 실행. 매트릭스만 갱신.
      await loadMatrix(selectedIso || undefined)
    } catch {
      toast.error('수집 중 오류가 발생했습니다')
    }
  }, [loadMatrix, selectedIso])

  const handleImportOutline = useCallback(async () => {
    setImporting(true)
    try { await runImport(null) } finally { setImporting(false) }
  }, [runImport])

  const handleImportTeam = useCallback(async (team: WeeklyTeam) => {
    setCollectingTeamId(team.id)
    try { await runImport(team.collection_id) } finally { setCollectingTeamId(null) }
  }, [runImport])

  // 사이드바에서 특정 팀을 골랐으면 그 팀 원본만, 아니면 전체
  const visibleReports = focusedTeam ? reports.filter(r => r.team === focusedTeam) : reports

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 사이드바 */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden"
        style={{ width: 'var(--sidebar-w)' }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0 gap-2">
          <h1 className="flex-1 text-sm font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">WEEKLY</h1>
          <button
            onClick={handleImportOutline}
            disabled={importing || autoAnalyzing}
            className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="전체 Outline 수집 (분석은 별도)"
          >
            {importing
              ? <RefreshCw size={14} className="animate-spin" />
              : <CloudDownload size={14} />
            }
          </button>
          <button
            onClick={() => selectedIso && handleAnalyze(selectedIso)}
            disabled={!selectedIso || importing || autoAnalyzing}
            className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="선택한 주차 AI 분석"
          >
            {autoAnalyzing
              ? <RefreshCw size={14} className="animate-spin" />
              : <Sparkles size={14} />
            }
          </button>
        </div>

        {teams.length > 0 && (
          <WeeklySidebar
            teams={teams}
            weeks={weeks}
            byWeek={byWeek}
            selectedIso={selectedIso}
            onSelect={handleSelectWeek}
            onSelectTeam={handleSelectTeamWeek}
            onCollectTeam={handleImportTeam}
            collectingTeamId={collectingTeamId}
            collectDisabled={importing || autoAnalyzing || collectingTeamId !== null}
          />
        )}

        {teams.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 text-center">
            <p className="text-2xs text-muted-foreground leading-relaxed">연동된 팀이 없어요</p>
            <a
              href="/settings?section=weekly"
              className="flex items-center gap-1 text-2xs text-lilac-600 hover:underline"
            >
              <Settings size={11} />
              설정에서 추가하기
            </a>
          </div>
        )}
      </div>

      {/* 메인 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="h-12 border-b bg-card flex items-center px-4 gap-3 shrink-0">
          {selectedIso ? (
            <>
              <div className="flex items-center gap-1.5 text-xs bg-muted px-2.5 py-1 rounded-md">
                <CalendarDays size={11} className="text-ink-400" />
                <span className="font-medium text-foreground">{fmtHeader(selectedIso)}</span>
              </div>

              {prevWeekStart && (
                <div className="flex items-center gap-1.5 text-xs text-ink-400 px-2.5 py-1 rounded-md border border-border">
                  <CalendarDays size={11} />
                  <span>전주 {fmtPrev(prevWeekStart)}</span>
                </div>
              )}

              {focusedTeam && (
                <button
                  onClick={() => setFocusedTeam(null)}
                  className="flex items-center gap-1 text-xs text-lilac-600 px-2 py-1 rounded-md bg-lilac-100 hover:bg-lilac-200 transition-colors"
                  title="전체 팀 보기"
                >
                  {focusedTeam} ✕
                </button>
              )}

              <button
                onClick={() => { setShowRaw(true); setShowInsight(false) }}
                className={`ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${showRaw ? 'border-lilac-400 bg-lilac-100 text-lilac-600' : 'border-border text-foreground hover:bg-muted'}`}
              >
                <FileText size={11} />
                원본
              </button>
              <button
                onClick={() => { setShowInsight(true); setShowRaw(false) }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-ink-800 transition-colors"
              >
                <Sparkles size={11} />
                AI 요약
                <ArrowUpRight size={11} />
              </button>
            </>
          ) : (
            <span className="text-sm font-semibold text-foreground">Weekly</span>
          )}
        </div>

        {/* AI 분석 진행 표시 */}
        {autoAnalyzing && (
          <div className="border-b bg-card px-4 py-2 flex items-center gap-3 shrink-0">
            <RefreshCw size={11} className="animate-spin text-lilac-500 shrink-0" />
            <div className="flex-1 relative h-1 rounded-full bg-ink-100 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 h-full bg-lilac-500"
                style={{ width: `${autoAnalyzeProgress}%`, transition: 'width 0.5s ease-out' }}
              />
            </div>
            {autoAnalyzeStatus && (
              <span className="text-xs text-ink-400 shrink-0 max-w-[220px] truncate">{autoAnalyzeStatus}</span>
            )}
          </div>
        )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto bg-background">
          {matrixLoading && (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={16} className="animate-spin text-ink-400" />
            </div>
          )}

          {!matrixLoading && matrixError && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <p className="text-xs font-medium text-status-late">{matrixError}</p>
              <button
                onClick={() => loadMatrix(selectedIso || undefined)}
                className="text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}

          {!matrixLoading && !matrixError && teams.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FileText size={40} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">설정에서 팀을 추가해주세요</p>
            </div>
          )}

          {!matrixLoading && !matrixError && teams.length > 0 && !selectedIso && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FileText size={40} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">수집된 주간보고가 없어요</p>
            </div>
          )}

          {!matrixLoading && !matrixError && selectedIso && (
            <div className="p-6 max-w-[1200px] mx-auto">
              <WeeklyDashboard
                weekStart={selectedIso}
                prevWeekStart={prevWeekStart}
                reports={visibleReports}
                insight={insight}
                reportsLoading={dashLoading}
                showInsight={showInsight}
                onCloseInsight={() => setShowInsight(false)}
                onInsightUpdate={setInsight}
                onRefresh={handleRefresh}
                showRaw={showRaw}
                onCloseRaw={() => setShowRaw(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
