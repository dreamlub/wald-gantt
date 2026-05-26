'use client'

import { useState, useEffect, useCallback } from 'react'
import { PanelLeftClose, PanelLeftOpen, FileText, RefreshCw, Settings, CalendarDays, Sparkles, ArrowUpRight, CloudDownload } from 'lucide-react'
import type { WeeklyTeam } from '../_lib/types'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import { WeeklySidebar } from './weekly-sidebar'
import { WeeklyDashboard } from './weekly-dashboard'
import { getWeeklyWeeks, getWeeklyReports, getWeeklyInsight } from '@/lib/weekly-service'
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
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

export function WeeklyShell() {
  const [teams, setTeams]               = useState<WeeklyTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<string>('')
  const [weeks, setWeeks]               = useState<string[]>([])
  const [selectedIso, setSelectedIso]   = useState<string>('')
  const [sidebarOpen, setSidebarOpen]   = useState(true)
  const [weeksLoading, setWeeksLoading] = useState(false)
  const [weeksError, setWeeksError]     = useState<string | null>(null)
  const [showInsight, setShowInsight]   = useState(false)

  const [reports, setReports]         = useState<WeeklyReport[]>([])
  const [insight, setInsight]         = useState<WeeklyInsight | null>(null)
  const [dashLoading, setDashLoading] = useState(false)

  const prevWeekStart = selectedIso ? prevWeekOf(selectedIso) : ''

  useEffect(() => {
    fetch('/api/weekly/teams')
      .then(r => r.json())
      .then((data: WeeklyTeam[]) => {
        setTeams(data)
        if (data.length > 0) setSelectedTeam(t => t || data[0].id)
      })
      .catch(() => setTeams([]))
  }, [])

  const fetchWeeks = useCallback(async (teamLabel: string) => {
    setWeeksLoading(true)
    setWeeksError(null)
    setWeeks([])
    setSelectedIso('')
    try {
      const data = await getWeeklyWeeks(teamLabel)
      setWeeks(data)
      if (data.length > 0) setSelectedIso(data[0])
    } catch (e) {
      setWeeksError(e instanceof Error ? e.message : '주차 조회 실패')
    } finally {
      setWeeksLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedTeam || teams.length === 0) return
    const team = teams.find(t => t.id === selectedTeam)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (team) fetchWeeks(team.label)
  }, [selectedTeam, teams, fetchWeeks])

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

  const [importing, setImporting] = useState(false)
  const handleImportOutline = useCallback(async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/weekly/import-outline', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        const total: number = data.total ?? 0
        toast.success(`수집 완료 — ${total}건 저장`)
        const team = teams.find(t => t.id === selectedTeam)
        if (team) fetchWeeks(team.label)
      } else {
        toast.error(`수집 실패: ${data.error}`)
      }
    } catch {
      toast.error('수집 중 오류가 발생했습니다')
    } finally {
      setImporting(false)
    }
  }, [teams, selectedTeam, fetchWeeks])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 사이드바 */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: sidebarOpen ? 'var(--sidebar-w)' : 0 }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0 gap-2">
          <h1 className="flex-1 text-xs font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">WEEKLY</h1>
          <button
            onClick={handleImportOutline}
            disabled={importing}
            className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Outline에서 주간보고 수집"
          >
            {importing
              ? <RefreshCw size={14} className="animate-spin" />
              : <CloudDownload size={14} />
            }
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors"
            title="사이드바 닫기"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        {teams.length > 0 && (
          <WeeklySidebar
            teams={teams}
            selectedTeam={selectedTeam}
            onSelectTeam={setSelectedTeam}
            weeks={weeks}
            selectedIso={selectedIso}
            onSelect={setSelectedIso}
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
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="사이드바 열기"
            >
              <PanelLeftOpen size={15} />
            </button>
          )}

          {selectedIso ? (
            <>
              {/* 금주 날짜 */}
              <div className="flex items-center gap-1.5 text-xs bg-muted px-2.5 py-1 rounded-md">
                <CalendarDays size={11} className="text-ink-400" />
                <span className="font-medium text-foreground">{fmtHeader(selectedIso)}</span>
              </div>

              {/* 전주 날짜 */}
              {prevWeekStart && (
                <div className="flex items-center gap-1.5 text-xs text-ink-400 px-2.5 py-1 rounded-md border border-border">
                  <CalendarDays size={11} />
                  <span>전주 {fmtPrev(prevWeekStart)}</span>
                </div>
              )}

              {/* AI 요약 버튼 */}
              <button
                onClick={() => setShowInsight(v => !v)}
                className="ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-ink-800 transition-colors"
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

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto bg-background">
          {weeksLoading && (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={16} className="animate-spin text-ink-400" />
            </div>
          )}

          {!weeksLoading && weeksError && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <p className="text-xs font-medium text-status-late">{weeksError}</p>
              <button
                onClick={() => {
                  const team = teams.find(t => t.id === selectedTeam)
                  if (team) fetchWeeks(team.label)
                }}
                className="text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}

          {!weeksLoading && !weeksError && teams.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FileText size={40} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">설정에서 팀을 추가해주세요</p>
            </div>
          )}

          {!weeksLoading && !weeksError && teams.length > 0 && !selectedIso && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FileText size={40} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">수집된 주간보고가 없어요</p>
            </div>
          )}

          {!weeksLoading && !weeksError && selectedIso && (
            <div className="p-6 max-w-[1200px] mx-auto">
              <WeeklyDashboard
                weekStart={selectedIso}
                prevWeekStart={prevWeekStart}
                reports={reports}
                insight={insight}
                reportsLoading={dashLoading}
                showInsight={showInsight}
                onCloseInsight={() => setShowInsight(false)}
                onInsightUpdate={setInsight}
                onRefresh={handleRefresh}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
