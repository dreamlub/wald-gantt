import { createClient } from '@/lib/supabase/server'
import { getServerClients } from '@/lib/history-service-server'
import { SettingsShell } from './_components/settings-shell'

export const metadata = { title: '설정 — Wald' }

export default async function SettingsPage() {
  const [sb, clients] = await Promise.all([
    createClient(),
    getServerClients(),
  ])

  const { data: { user } } = await sb.auth.getUser()
  const userEmail = user?.email ?? ''

  const [{ data: tokenRow }, { data: memberRow }, { data: weeklySources }] = await Promise.all([
    sb.from('google_calendar_tokens').select('id').limit(1).maybeSingle(),
    sb.from('workspace_members').select('workspace_id').limit(1).maybeSingle(),
    sb.from('weekly_sources').select('*').order('sort_order'),
  ])

  const calendarConnected = !!tokenRow
  const workspaceId = memberRow?.workspace_id ?? ''

  return (
    <SettingsShell
      userEmail={userEmail}
      clients={clients}
      calendarConnected={calendarConnected}
      initialWeeklySources={weeklySources ?? []}
      workspaceId={workspaceId}
    />
  )
}
