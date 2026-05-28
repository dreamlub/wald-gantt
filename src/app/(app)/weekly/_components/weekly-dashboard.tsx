'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { WeeklyReport, WeeklyInsight } from '@/types/index'
import {
  type FilterKey,
  type TypeKey,
  SECTION_ORDER,
  assembleItems,
  ChangeSection,
  TypeTab,
  FilterBar,
} from './weekly-dashboard-parts'
import { AISummaryPanel } from './weekly-ai-summary-panel'

// ── WeeklyDashboard ───────────────────────────────────────────────

interface Props {
  weekStart: string
  prevWeekStart: string
  reports: WeeklyReport[]
  insight: WeeklyInsight | null
  reportsLoading: boolean
  showInsight: boolean
  onCloseInsight: () => void
  onInsightUpdate: (insight: WeeklyInsight) => void
  onRefresh: () => void
}

export function WeeklyDashboard({
  weekStart, reports, insight, reportsLoading,
  showInsight, onCloseInsight, onInsightUpdate, onRefresh,
}: Props) {
  const [compareMode, setCompareMode] = useState(false)
  const [filter, setFilter]           = useState<FilterKey>('all')
  const [typeFilter, setTypeFilter]   = useState<TypeKey>('all')

  const allItems = assembleItems(reports)

  // type 탭 필터 먼저 적용
  const typeFiltered = typeFilter === 'all'
    ? allItems
    : allItems.filter(it => it.type === typeFilter)

  const counts: Record<FilterKey, number> = {
    all:       typeFiltered.length,
    new:       typeFiltered.filter(it => it.change === 'new').length,
    continued: typeFiltered.filter(it => it.change === 'continued').length,
    completed: typeFiltered.filter(it => it.change === 'completed').length,
    blocked:   typeFiltered.filter(it => it.change === 'blocked').length,
    dropped:   typeFiltered.filter(it => it.change === 'dropped').length,
  }

  const typeCounts: Record<TypeKey, number> = {
    all:      allItems.length,
    issue:    allItems.filter(it => it.type === 'issue').length,
    decision: allItems.filter(it => it.type === 'decision').length,
    plan:     allItems.filter(it => it.type === 'plan').length,
  }

  const filtered = filter === 'all' ? typeFiltered : typeFiltered.filter(it => it.change === filter)

  if (reportsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={16} className="animate-spin text-ink-400" />
      </div>
    )
  }

  return (
    <>
      {showInsight && (
        <AISummaryPanel
          weekStart={weekStart}
          insight={insight}
          reports={reports}
          onInsightUpdate={onInsightUpdate}
          onRefresh={onRefresh}
          onClose={onCloseInsight}
        />
      )}

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <p className="text-sm text-muted-foreground">수집된 보고서가 없습니다</p>
          <p className="text-sm text-ink-300">MCP를 통해 보고서를 수집한 후 분석하세요</p>
        </div>
      ) : (
        <>
          <TypeTab
            typeFilter={typeFilter}
            onTypeFilterChange={(t) => { setTypeFilter(t); setFilter('all') }}
            typeCounts={typeCounts}
          />
          <FilterBar
            compareMode={compareMode}
            onCompareModeChange={setCompareMode}
            filter={filter}
            onFilterChange={setFilter}
            counts={counts}
          />

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-ink-400">
              해당 카테고리 항목이 없습니다
            </div>
          ) : (
            SECTION_ORDER.map(key => (
              <ChangeSection
                key={key}
                changeKey={key}
                items={filtered.filter(it => it.change === key)}
                compareMode={compareMode}
              />
            ))
          )}
        </>
      )}
    </>
  )
}
