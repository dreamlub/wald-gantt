import { getServerClients } from '@/lib/history-service-server'
import { KeywordsClient } from './keywords-client'

export const metadata = {
  title: 'Keywords — Wald',
}

export default async function KeywordsPage() {
  const clients = await getServerClients()
  return <KeywordsClient initialClients={clients} />
}
