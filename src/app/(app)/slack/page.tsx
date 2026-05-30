import { SummaryShell } from './_components/slack-shell'
import { getServerClients, getServerHistory } from '@/lib/history-service-server'

export const metadata = {
  title: 'Client History — Wald',
}

type SummarySearchParams = Promise<Record<string, string | string[] | undefined>>

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// timeline 뷰는 사이드바(/api/brands/timeline)·트래커(/api/issues)가 자체 조회하므로
// 서버 진입 시 90일치 client_history(listHistory: 스레드 RPC + 페이지네이션)를 미리 받을 필요가 없다.
function needsInitialHistory(view: string | undefined): boolean {
  return view === 'dailyreport'
}

export default async function SummaryPage({ searchParams }: { searchParams: SummarySearchParams }) {
  const params = await searchParams
  const view = firstParam(params.view)
  const shouldLoadInitialHistory = needsInitialHistory(view)

  const [clients, history] = shouldLoadInitialHistory
    ? await Promise.all([getServerClients(), getServerHistory()])
    : [[], []]

  return (
    <SummaryShell
      initialClients={clients}
      initialHistory={history}
    />
  )
}
