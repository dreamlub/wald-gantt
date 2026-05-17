'use client'

import { useState, useEffect, useCallback } from 'react'
import { PanelLeftClose, PanelLeftOpen, FileText, RefreshCw, Settings } from 'lucide-react'
import type { WeeklyTeam } from '../_lib/types'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import { WeeklySidebar } from './weekly-sidebar'
import { WeeklyDashboard, DASHBOARD_TABS } from './weekly-dashboard'
import type { DashboardTab } from './weekly-dashboard'
import { getWeeklyWeeks, getWeeklyReports, getWeeklyInsight } from '@/lib/weekly-service'

function getWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  const month = d.getMonth() + 1
  const dow = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
  const firstMon = 1 + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow)
  const weekNum = Math.floor((d.getDate() - firstMon) / 7) + 1
  return `${month}월 ${weekNum}주 보고`
}

export function WeeklyShell() {
  const [teams, setTeams]               = useState<WeeklyTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<string>('')
  const [weeks, setWeeks]               = useState<string[]>([])
  const [selectedIso, setSelectedIso]   = useState<string>('')
  const [sidebarOpen, setSidebarOpen]   = useState(true)
  const [weeksLoading, setWeeksLoading] = useState(false)
  const [weeksError, setWeeksError]     = useState<string | null>(null)
  const [tab, setTab]                   = useState<DashboardTab>('all')

  // 대시보드 데이터
  const [reports, setReports]       = useState<WeeklyReport[]>([])
  const [insight, setInsight]       = useState<WeeklyInsight | null>(null)
  const [dashLoading, setDashLoading] = useState(false)

  // 팀 목록 로드
  useEffect(() => {
    fetch('/api/weekly/teams')
      .then(r => r.json())
      .then((data: WeeklyTeam[]) => {
        setTeams(data)
        if (data.length > 0) setSelectedTeam(t => t || data[0].id)
      })
      .catch(() => setTeams([]))
  }, [])

  // 팀 선택 시 DB에서 주차 목록 fetch
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
    if (team) fetchWeeks(team.label)
  }, [selectedTeam, teams, fetchWeeks])

  // 주차 선택 시 DB에서 reports + insight fetch
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
      // 빈 상태 → 대시보드에서 처리
    } finally {
      setDashLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedIso) fetchDashData(selectedIso)
  }, [selectedIso, fetchDashData])

  const handleRefresh = useCallback(() => {
    if (selectedIso) fetchDashData(selectedIso)
  }, [selectedIso, fetchDashData])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 사이드바 */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: sidebarOpen ? 240 : 0 }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0 gap-2">
          <h1 className="flex-1 text-xs font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">WEEKLY</h1>
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
            <p className="text-[11px] text-muted-foreground leading-relaxed">연동된 팀이 없어요</p>
            <a
              href="/settings?section=weekly"
              className="flex items-center gap-1 text-[11px] text-lilac-600 hover:underline"
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
          <span className="text-sm font-semibold text-foreground shrink-0">
            {selectedIso ? getWeekLabel(selectedIso) : 'Weekly'}
          </span>

          {selectedIso && (
            <div className="ml-auto flex items-center">
              {DASHBOARD_TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 h-12 text-xs font-medium border-b-2 transition-colors ${
                    tab === t.key
                      ? 'border-lilac-500 text-lilac-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
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
                reports={reports}
                insight={insight}
                reportsLoading={dashLoading}
                tab={tab}
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
