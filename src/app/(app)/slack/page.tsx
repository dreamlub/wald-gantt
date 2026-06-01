import { SlackShell } from './_components/slack-shell'
import { getServerHistory } from '@/lib/history-service-server'
import { listHistoryPage } from '@/lib/history-service'
import type { HistoryPage } from '@/lib/history-service'
import { createClient } from '@/lib/supabase/server'
import { kstToday, addDaysYMD } from '@/lib/kst'

export const metadata = {
  title: 'Client History — Wald',
}

type SlackSearchParams = Promise<Record<string, string | string[] | undefined>>

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function SlackPage({ searchParams }: { searchParams: SlackSearchParams }) {
  const params = await searchParams
  const view = firstParam(params.view)

  // dailyreport: 90일치 전체 데이터를 SSR (사이드바 달력·필터에 필요)
  if (view === 'dailyreport') {
    const initialHistory = await getServerHistory()
    return <SlackShell initialHistory={initialHistory} />
  }

  // dailylist(기본 뷰): 첫 페이지를 SSR해서 클라이언트 왕복 제거
  if (!view || view === 'dailylist') {
    const from = firstParam(params.from) ?? addDaysYMD(kstToday(), -6)
    const to   = firstParam(params.to)   ?? kstToday()
    const sb   = await createClient()

    let initialPage: HistoryPage | undefined
    try {
      initialPage = await listHistoryPage({
        from,
        to,
        brand:    firstParam(params.brand),
        priority: firstParam(params.priority),
        tags:     firstParam(params.tags)?.split(','),
        author:   firstParam(params.author),
        q:        firstParam(params.q),
        limit:    50,
      }, sb)
    } catch {
      // SSR 실패 시 클라이언트 fetch로 fallback
    }

    return (
      <SlackShell
        initialHistory={[]}
        initialPage={initialPage}
        initialDateFrom={from}
        initialDateTo={to}
      />
    )
  }

  // 나머지 뷰는 클라이언트에서 자체 로드
  return <SlackShell initialHistory={[]} />
}
