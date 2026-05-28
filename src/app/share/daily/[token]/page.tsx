import { createClient } from '@/lib/supabase/server'
import { DailyReportPublicView } from './DailyReportPublicView'
import type { InsightContent } from '@/app/(app)/summary/_lib/types'

interface PageProps {
  params: Promise<{ token: string }>
}

interface SharedReport {
  report_date: string
  content: InsightContent
  item_count: number
  brand_count: number
  analyzed_at: string
}

export default async function DailySharePage({ params }: PageProps) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_shared_daily_report', { p_token: token })

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center space-y-2">
          <p className="text-foreground font-medium">유효하지 않은 링크입니다</p>
          <p className="text-sm text-muted-foreground">링크가 삭제되었거나 만료되었습니다.</p>
        </div>
      </div>
    )
  }

  const report = data as SharedReport

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="h-12 bg-card border-b flex items-center px-6 gap-2 shrink-0 z-20">
        <span className="text-xs font-black text-foreground uppercase tracking-widest">WALDLUST</span>
        <span className="text-ink-300 mx-0.5">·</span>
        <span className="text-sm font-semibold text-foreground">Daily Report</span>
        <span className="ml-auto text-2xs text-muted-foreground bg-muted px-2 py-1 rounded">읽기 전용</span>
      </header>
      <main className="flex-1 overflow-hidden flex flex-col">
        <DailyReportPublicView
          report={{
            content: report.content,
            item_count: report.item_count,
            brand_count: report.brand_count,
          }}
          selectedDate={report.report_date}
        />
      </main>
    </div>
  )
}
