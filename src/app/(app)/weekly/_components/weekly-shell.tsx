'use client'

import { useState, useEffect, useCallback } from 'react'
import { PanelLeftClose, PanelLeftOpen, FileText, RefreshCw, Settings } from 'lucide-react'
import type { WeeklyDoc, WeeklyTeam } from '../_lib/types'
import { WeeklySidebar } from './weekly-sidebar'
import { WeeklyContent } from './weekly-content'
import { WeeklyAiSummary } from './weekly-ai-summary'

export function WeeklyShell() {
  const [teams, setTeams] = useState<WeeklyTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<string>('')
  const [doc, setDoc] = useState<WeeklyDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIso, setSelectedIso] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

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

  const fetchDoc = useCallback(async (teamId: string) => {
    setLoading(true)
    setError(null)
    setDoc(null)
    setSelectedIso('')
    try {
      const res = await fetch(`/api/weekly?team=${teamId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '조회 실패' }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data: WeeklyDoc = await res.json()
      setDoc(data)
      if (data.weeks.length > 0) setSelectedIso(data.weeks[0].isoDate)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedTeam) fetchDoc(selectedTeam)
  }, [selectedTeam, fetchDoc])

  const selectedSection = doc?.weeks.find(w => w.isoDate === selectedIso) ?? null

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
            weeks={doc?.weeks ?? []}
            selectedIso={selectedIso}
            onSelect={setSelectedIso}
          />
        )}

        {teams.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 text-center">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              연동된 팀이 없어요
            </p>
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
        <div className="h-12 border-b bg-card flex items-center px-4 gap-2 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="사이드바 열기"
            >
              <PanelLeftOpen size={15} />
            </button>
          )}
          {selectedSection ? (
            <span className="text-sm font-semibold text-foreground">{selectedSection.date} 주간보고</span>
          ) : (
            <span className="text-xs font-semibold text-foreground">
              {doc?.title ?? 'Weekly'}
            </span>
          )}
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto bg-card">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={16} className="animate-spin text-ink-400" />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <p className="text-xs font-medium text-status-late">{error}</p>
              <button
                onClick={() => selectedTeam && fetchDoc(selectedTeam)}
                className="text-xs px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}

          {!loading && !error && teams.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FileText size={40} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">설정에서 팀을 추가해주세요</p>
            </div>
          )}

          {!loading && !error && teams.length > 0 && !selectedSection && doc && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FileText size={40} strokeWidth={1.5} className="opacity-20 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">주간보고가 없어요</p>
            </div>
          )}

          {!loading && !error && selectedSection && (
            <div className="p-6 max-w-[1200px]">
              <WeeklyAiSummary section={selectedSection} />
              <WeeklyContent section={selectedSection} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
