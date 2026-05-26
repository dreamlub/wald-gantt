import { SummaryShell } from './_components/summary-shell'
import { getServerClients, getServerHistory } from '@/lib/history-service-server'

export const metadata = {
  title: 'Client History — Wald',
}

export default async function SummaryPage() {
  const [clients, history] = await Promise.all([
    getServerClients(),
    getServerHistory(),
  ])

  return (
    <SummaryShell
      initialClients={clients}
      initialHistory={history}
    />
  )
}
