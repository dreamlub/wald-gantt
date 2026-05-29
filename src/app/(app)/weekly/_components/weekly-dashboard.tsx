'use client'

import { useState } from 'react'
import { RefreshCw, FileText, ListChecks, Lightbulb } from 'lucide-react'
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
import { WeeklyRawView } from './weekly-raw-view'

// ── WeeklyDashboard — 원문 / 요약 / 인사이트 3탭 인라인 구조 ──

export type WeeklyTab = 'raw' | 'summary' | 'insight'

interface Props {
  weekStart: string
  prevWeekStart?: string
  reports: WeeklyReport[]
  insight: WeeklyInsight | null
  reportsLoading: boolean
  tab?: WeeklyTab
  onTabChange?: (t: WeeklyTab) => void
  showInsight?: boolean
  onCloseInsight?: () => void
  showRaw?: boolean
  onCloseRaw?: () => void
  onInsightUpdate: (insight: WeeklyInsight) => void
  onRefresh: () => void
}

const TABS: { key: WeeklyTab; label: string; icon: typeof FileText }[] = [
  { key: 'raw',     label: '원문',     icon: FileText },
  { key: 'summary', label: '요약',     icon: ListChecks },
  { key: 'insight', label: '인사이트', icon: Lightbulb },
]

export function WeeklyDashboard({
  weekStart, reports, insight, reportsLoading,
  tab, onTabChange, onInsightUpdate, onRefresh,
}: Props) {
  const [compareMode, setCompareMode] = useState(false)
  const [filter, setFilter]           = useState<FilterKey>('all')
  const [typeFilter, setTypeFilter]   = useState<TypeKey>('all')

  const allItems = assembleItems(reports)

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

  return (
    <>
      {/* 탭 바 */}
      <div className="flex items-center gap-1 border-b border-border mb-5">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => onTabChange?.(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-ink-400 hover:text-foreground'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {reportsLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={16} className="animate-spin text-ink-400" />
        </div>
      ) : tab === 'raw' ? (
        <WeeklyRawView reports={reports} />
      ) : tab === 'insight' ? (
        <AISummaryPanel
          inline
          weekStart={weekStart}
          insight={insight}
          reports={reports}
          onInsightUpdate={onInsightUpdate}
          onRefresh={onRefresh}
        />
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <p className="text-sm text-muted-foreground">수집된 보고서가 없습니다</p>
          <p className="text-sm text-ink-300">원문을 수집한 후 분석하세요</p>
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
