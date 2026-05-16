import { HistoryShell } from './_components/history-shell'
import { getServerClients, getServerHistory } from '@/lib/history-service-server'

export const metadata = {
  title: 'Client History — Wald',
}

export default async function HistoryPage() {
  const [clients, history] = await Promise.all([
    getServerClients(),
    getServerHistory(),
  ])

  return (
    <HistoryShell
      initialClients={clients}
      initialHistory={history}
    />
  )
}
