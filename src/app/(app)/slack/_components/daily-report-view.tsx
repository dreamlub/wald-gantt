'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Newspaper, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { DailyReportViewV2 } from './daily-report-view-v2'
import type { InsightContent, Priority, Tag } from '../_lib/types'

interface Props {
  selectedDate: string
  filterBrands: Set<string>
  filterTags: Set<Tag>
  filterPriorities: Set<Priority>
}

interface DailyReport {
  content: InsightContent
  analyzed_at: string
  item_count: number
  brand_count: number
  report_date?: string
}

export function DailyReportView({ selectedDate, filterBrands, filterTags, filterPriorities }: Props) {
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [effectiveDate, setEffectiveDate] = useState(selectedDate)
  const [isFallback, setIsFallback] = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setIsFallback(false)
    const sb = createClient()

    const { data } = await sb
      .from('daily_reports')
      .select('content, analyzed_at, item_count, brand_count, report_date')
      .eq('report_date', selectedDate)
      .maybeSingle()

    if (data) {
      setReport(data as DailyReport)
      setEffectiveDate(selectedDate)
      setLoading(false)
      return
    }

    const { data: fallback } = await sb
      .from('daily_reports')
      .select('content, analyzed_at, item_count, brand_count, report_date')
      .lt('report_date', selectedDate)
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    setReport(fallback as DailyReport | null)
    setEffectiveDate(fallback?.report_date ?? selectedDate)
    setIsFallback(!!fallback)
    setLoading(false)
  }, [selectedDate])

  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => { fetchReport() }, [fetchReport])

  const dateLabel = useMemo(() => {
    try { return format(new Date(effectiveDate + 'T00:00:00'), 'yyyy년 M월 d일 (eee)', { locale: ko }) }
    catch { return effectiveDate }
  }, [effectiveDate])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Newspaper size={16} className="animate-spin text-ink-400" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-4">
          <Newspaper size={18} className="text-ink-400" />
        </div>
        <p className="text-sm font-semibold text-foreground mb-1">{dateLabel}</p>
        <p className="text-sm text-ink-400">해당 날짜의 리포트가 아직 생성되지 않았습니다</p>
      </div>
    )
  }

  return (
    <>
      {isFallback && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-status-warn/10 border-b border-border text-sm text-status-warn">
          <CalendarDays size={13} />
          <span>
            {format(new Date(selectedDate + 'T00:00:00'), 'M/d', { locale: ko })} 리포트 없음 — 가장 최근{' '}
            <strong className="font-semibold">
              {format(new Date(effectiveDate + 'T00:00:00'), 'M월 d일 (eee)', { locale: ko })}
            </strong>{' '}
            리포트 표시 중
          </span>
        </div>
      )}
      <DailyReportViewV2
        report={report}
        selectedDate={effectiveDate}
        filterBrands={filterBrands}
        filterTags={filterTags}
        filterPriorities={filterPriorities}
      />
    </>
  )
}
