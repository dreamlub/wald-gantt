'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { BookOpen, RefreshCw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { WeeklyWeekList, type WeekData, type BrandItem } from './weekly-week-list'
import { WeeklyCollectionDetail } from './weekly-collection-detail'
import { WeeklyContentTabs } from './weekly-content-tabs'
import { getWeeklyReports, getWeeklyInsight } from '@/lib/weekly-service'
import type { WeeklyReport, WeeklyInsight, WeeklyReportSummary } from '@/types/index'
import { useBrandAliases } from '@/hooks/use-brand-aliases'

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
  const aliasMap = useBrandAliases()
  const [data, setData]                 = useState<CollectionData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [selectedWeek, setSelectedWeek] = useState<string>('')

  // 리포트 / 인사이트
  const [reports, setReports]         = useState<WeeklyReport[]>([])
  const [insight, setInsight]         = useState<WeeklyInsight | null>(null)
  const [dashLoading, setDashLoading] = useState(false)

  // 수집 진행
  const [collecting, setCollecting] = useState(false)

  // 브랜드 필터
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)

  // ── 수집 현황 로드 ───────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/weekly/collection-status')
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as CollectionData
      setData(json)
      setSelectedWeek(prev => prev || (json.weeks[0]?.weekStart ?? ''))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수집 현황 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { void loadStatus() }, [])

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
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!selectedWeek || !data) return
    const week = data.weeks.find(w => w.weekStart === selectedWeek)
    if (week?.teams.some(t => t.hasData)) {
      loadReports(selectedWeek)
    } else {
      setReports([])
      setInsight(null)
    }
  }, [selectedWeek])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

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

  // ── 파생 값 ──────────────────────────────────────────────────────

  // 주차 선택 시 브랜드 필터 초기화
  const handleSelectWeek = useCallback((week: string) => {
    setSelectedWeek(week)
    setSelectedBrand(null)
  }, [])

  // 브랜드 목록 (요약 데이터에서 추출)
  const brandList = useMemo((): BrandItem[] => {
    const map = new Map<string, { count: number; hasBlocked: boolean }>()
    for (const r of reports) {
      const summary = r.summary as unknown as WeeklyReportSummary | null
      for (const item of [...(summary?.items ?? []), ...(summary?.diff_summary?.dropped_items ?? [])]) {
        const raw  = item.brand ?? '기타'
        const name = aliasMap.get(raw) ?? raw
        const prev = map.get(name) ?? { count: 0, hasBlocked: false }
        map.set(name, { count: prev.count + 1, hasBlocked: prev.hasBlocked || item.change === 'blocked' })
      }
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => a.name === '기타' ? 1 : b.name === '기타' ? -1 : b.count - a.count)
  }, [reports, aliasMap])

  const selectedWeekData = data?.weeks.find(w => w.weekStart === selectedWeek)
  const hasData          = selectedWeekData?.teams.some(t => t.hasData) ?? false
  const collectedWeekCount = data?.weeks.filter(w => w.teams.some(t => t.hasData)).length ?? 0
  const weekCount          = data?.weeks.length ?? 0

  // 데이터 있는 주차만 오름차순 정렬 → 이전/다음 주차 계산
  const weeksWithData = (data?.weeks ?? [])
    .filter(w => w.teams.some(t => t.hasData))
    .slice()
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
  const currentIdx = weeksWithData.findIndex(w => w.weekStart === selectedWeek)
  const prevWeekStart = currentIdx > 0 ? weeksWithData[currentIdx - 1].weekStart : null
  const nextWeekStart = currentIdx < weeksWithData.length - 1 ? weeksWithData[currentIdx + 1].weekStart : null

  // ── 렌더 ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 좌측: 주차 목록 */}
      <div className="hidden sm:flex shrink-0 border-r bg-muted flex-col overflow-hidden" style={{ width: 'var(--sidebar-w)' }}>
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0">
          <h1 className="flex-1 text-sm font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap truncate">
            주간보고 분석
          </h1>
        </div>

        {!loading && data && weekCount > 0 && (
          <div className="shrink-0 px-4 py-2 border-b border-border">
            <p className="text-2xs text-ink-400">
              2026년 · {weekCount}주차 · {collectedWeekCount}주 수집됨
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
            onSelect={handleSelectWeek}
            brandList={brandList}
            selectedBrand={selectedBrand}
            onSelectBrand={setSelectedBrand}
          />
        )}
      </div>

      {/* 우측: 상세 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
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
            collecting={collecting}
            onCollect={handleCollectWeek}
            hasPrev={prevWeekStart !== null}
            hasNext={nextWeekStart !== null}
            onPrevWeek={() => prevWeekStart && handleSelectWeek(prevWeekStart)}
            onNextWeek={() => nextWeekStart && handleSelectWeek(nextWeekStart)}
            selectedBrand={selectedBrand}
          />
        ) : (
          /* 미수집 주차 → 수집 유도 */
          <WeeklyCollectionDetail
            week={selectedWeekData}
            teamColors={TEAM_PALETTE}
            collecting={collecting}
            onCollect={handleCollectWeek}
          />
        )}
      </div>
    </div>
  )
}
