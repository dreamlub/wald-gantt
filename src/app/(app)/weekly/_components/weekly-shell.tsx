'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, RefreshCw, Settings, Sparkles, CloudDownload } from 'lucide-react'
import type { WeeklyTeam } from '../_lib/types'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import { WeeklySidebar } from './weekly-sidebar'
import { WeeklyDashboard, type WeeklyTab } from './weekly-dashboard'
import { getWeeklyMatrix, getWeeklyReports, getWeeklyInsight, analyzeWeekly } from '@/lib/weekly-service'
import { toast } from 'sonner'

function weekHeaderMeta(iso: string): { wk: string; label: string; range: string } {
  const d = new Date(iso + 'T00:00:00')
  const end = new Date(d); end.setDate(d.getDate() + 6)
  const month = d.getMonth() + 1
  const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
  const firstMon = 1 + (firstDow === 0 ? 1 : firstDow === 1 ? 0 : 8 - firstDow)
  const weekNum = Math.max(1, Math.floor((d.getDate() - firstMon) / 7) + 1)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const isoWeek = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  const md = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`
  return { wk: `W${isoWeek}`, label: `${month}월 ${weekNum}주`, range: `${md(d)} – ${md(end)}` }
}

export function WeeklyShell() {
  const [teams, setTeams]                 = useState<WeeklyTeam[]>([])
  const [weeks, setWeeks]                 = useState<string[]>([])
  const [byWeek, setByWeek]               = useState<Map<string, Map<string, WeeklyReport>>>(new Map())
  const [selectedIso, setSelectedIso]     = useState<string>('')
  const [focusedTeam, setFocusedTeam]     = useState<string | null>(null)
  const [tab, setTab]                     = useState<WeeklyTab>('raw')
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixError, setMatrixError]     = useState<string | null>(null)

  const [reports, setReports]         = useState<WeeklyReport[]>([])
  const [insight, setInsight]         = useState<WeeklyInsight | null>(null)
  const [dashLoading, setDashLoading] = useState(false)

  const [analyzing, setAnalyzing]               = useState(false)
  const [importing, setImporting]               = useState(false)
  const [collectingTeamId, setCollectingTeamId] = useState<string | null>(null)

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

  /** 주차 선택 — 원문 탭으로 (슬랙 흐름과 동일) */
  const handleSelectWeek = useCallback((weekStart: string) => {
    setFocusedTeam(null)
    setSelectedIso(weekStart)
    setTab('raw')
  }, [])

  /** 주차 + 특정 팀 선택 — 그 팀 원문만 */
  const handleSelectTeamWeek = useCallback((weekStart: string, teamLabel: string) => {
    setFocusedTeam(teamLabel)
    setSelectedIso(weekStart)
    setTab('raw')
  }, [])

  /** 선택 주차 AI 분석 → 인사이트 탭으로 */
  const handleAnalyze = useCallback(async (weekStart: string) => {
    setAnalyzing(true)
    try {
      const result = await analyzeWeekly(weekStart, () => {})
      setInsight(result)
      setTab('insight')
      fetchDashData(weekStart)
      toast.success('AI 분석 완료')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '분석 실패')
    } finally {
      setAnalyzing(false)
    }
  }, [fetchDashData])

  /** Outline 수집 — collectionId 지정 시 해당 팀만, 없으면 전체 (분석은 별도) */
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

  const visibleReports = focusedTeam ? reports.filter(r => r.team === focusedTeam) : reports

  // 최신 주차 기준 미제출 팀 수 (헤더 "미수집 수집" 버튼 문구)
  const latestWeek = weeks[0]
  const latestTeamMap = latestWeek ? byWeek.get(latestWeek) : undefined
  const missingCount = teams.filter(t => !latestTeamMap?.has(t.label)).length

  const headerMeta = selectedIso ? weekHeaderMeta(selectedIso) : null
  const selectedTeamMap = selectedIso ? byWeek.get(selectedIso) : undefined
  const selectedCollected = teams.filter(t => selectedTeamMap?.has(t.label)).length

  const busy = importing || analyzing || collectingTeamId !== null

  return (
    <div className="flex flex-1 overflow-hidden flex-col">
      {/* 상단 헤더 */}
      <div className="h-14 border-b bg-card flex items-center px-5 gap-3 shrink-0">
        <div className="flex flex-col">
          <h1 className="text-sm font-bold text-foreground">주간보고 수집</h1>
          <span className="text-2xs text-ink-400">팀별 주간보고를 주차 단위로 수집·분석</span>
        </div>
        <div className="flex items-center gap-1.5 text-2xs text-ink-500 bg-muted px-2.5 py-1 rounded-full ml-2">
          <span className="w-1.5 h-1.5 rounded-full bg-mint-500" />
          Outline 연동
        </div>
        <button
          onClick={handleImportOutline}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-md bg-foreground text-background hover:bg-ink-800 transition-colors disabled:opacity-50"
          title="전체 Outline 수집 (분석은 별도)"
        >
          {importing
            ? <RefreshCw size={13} className="animate-spin" />
            : <CloudDownload size={13} />}
          {missingCount > 0 ? `미수집 ${missingCount}팀 수집` : '전체 수집'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 */}
        <div
          className="shrink-0 border-r bg-muted flex flex-col overflow-hidden"
          style={{ width: 'var(--sidebar-w)' }}
        >
          {teams.length > 0 ? (
            <WeeklySidebar
              teams={teams}
              weeks={weeks}
              byWeek={byWeek}
              selectedIso={selectedIso}
              focusedTeam={focusedTeam}
              onSelect={handleSelectWeek}
              onSelectTeam={handleSelectTeamWeek}
              onCollectTeam={handleImportTeam}
              collectingTeamId={collectingTeamId}
              collectDisabled={busy}
            />
          ) : (
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
          {/* 주차 헤더 */}
          {headerMeta && (
            <div className="h-12 border-b bg-card flex items-center px-5 gap-2 shrink-0">
              <span className="text-sm font-bold text-foreground">{headerMeta.wk}</span>
              <span className="text-sm text-ink-500">{headerMeta.label}</span>
              <span className="text-xs text-ink-400 font-mono">{headerMeta.range}</span>
              <span className="text-4xs font-semibold px-1.5 py-0.5 rounded-2xs bg-mint-100 text-mint-500">
                {selectedCollected}팀 수집
              </span>
              {focusedTeam && (
                <button
                  onClick={() => setFocusedTeam(null)}
                  className="flex items-center gap-1 text-2xs text-lilac-600 px-2 py-0.5 rounded-md bg-lilac-100 hover:bg-lilac-200 transition-colors"
                  title="전체 팀 보기"
                >
                  {focusedTeam} ✕
                </button>
              )}
              <button
                onClick={() => selectedIso && handleAnalyze(selectedIso)}
                disabled={busy || !selectedIso}
                className="ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                title="선택한 주차 AI 분석"
              >
                {analyzing ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                AI 분석
              </button>
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
                  reports={visibleReports}
                  insight={insight}
                  reportsLoading={dashLoading}
                  tab={tab}
                  onTabChange={setTab}
                  onInsightUpdate={setInsight}
                  onRefresh={handleRefresh}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
