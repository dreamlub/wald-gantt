import { SummaryShell } from './_components/slack-shell'
import { getServerClients, getServerHistory } from '@/lib/history-service-server'

export const metadata = {
  title: 'Client History — Wald',
}

type SummarySearchParams = Promise<Record<string, string | string[] | undefined>>

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function needsInitialHistory(view: string | undefined): boolean {
  return view === 'summary' || view === 'dailyreport' || view === 'timeline'
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
