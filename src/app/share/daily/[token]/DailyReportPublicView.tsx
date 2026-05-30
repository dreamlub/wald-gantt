'use client'

import { DailyReportViewV2 } from '@/app/(app)/slack/_components/daily-report-view-v2'
import type { InsightContent } from '@/app/(app)/slack/_lib/types'

interface Props {
  report: {
    content: InsightContent
    item_count: number
    brand_count: number
  }
  selectedDate: string
}

export function DailyReportPublicView({ report, selectedDate }: Props) {
  return (
    <DailyReportViewV2
      report={report}
      selectedDate={selectedDate}
      filterBrands={new Set()}
      filterTags={new Set()}
      filterPriorities={new Set()}
      hideShare
    />
  )
}
