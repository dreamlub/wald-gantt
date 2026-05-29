import { createClient } from '@supabase/supabase-js'
import { WebClient } from '@slack/web-api'
import type { Block, KnownBlock } from '@slack/web-api'
import { formatDay } from '@/lib/date-utils'
import { kstToday, addDaysYMD } from '@/lib/kst'

const PRIORITY_FLAG: Record<number, string> = { 3: '🔺 ', 2: '', 1: '', 0: '' }

export interface Task {
  id: string
  title: string
  due_date: string
  status: string
  priority: number | null
}

type ReminderEnv = Record<string, string | undefined>

type ReminderConfig =
  | {
      ok: true
      cronSecret: string
      botToken: string | null
      supabaseUrl: string
      supabaseServiceRoleKey: string
    }
  | { ok: false; error: string; status: number }

export function getReminderConfig(env: ReminderEnv): ReminderConfig {
  if (!env.CRON_SECRET) return { ok: false, error: 'CRON_SECRET 미설정', status: 500 }
  const botToken = env.SLACK_USER_TOKEN ?? env.SLACK_BOT_TOKEN
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'Supabase 환경변수 미설정', status: 500 }
  }
  return {
    ok: true,
    cronSecret: env.CRON_SECRET,
    botToken: botToken ?? null,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

function tomorrowKST() { return addDaysYMD(kstToday(), 1) }

function diffDays(due: string, today: string) {
  return Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400000)
}

const fmtKSTDate = (d: string) => formatDay(d, 'full')

function line(t: Task, suffix?: string) {
  const flag = PRIORITY_FLAG[t.priority ?? 0] ?? ''
  return `${flag}• ${t.title}${suffix ? `  —  ${suffix}` : ''}`
}

export function groupReminderTasks(tasks: Task[], today: string, tomorrow: string) {
  const all = tasks.filter(t => t.due_date <= tomorrow)
  return {
    overdue:      all.filter(t => t.due_date < today),
    dueToday:     all.filter(t => t.due_date === today),
    dueTomorrow:  all.filter(t => t.due_date === tomorrow),
  }
}

export function buildBlocks(
  overdue: Task[], dueToday: Task[], dueTomorrow: Task[], today: string
): (KnownBlock | Block)[] {
  const total  = overdue.length + dueToday.length + dueTomorrow.length
  const blocks: (KnownBlock | Block)[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 태스크 리마인더  ·  ${fmtKSTDate(today)}`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `확인이 필요한 태스크 *${total}개*` }],
    },
    { type: 'divider' },
  ]

  if (overdue.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔴 지연 (${overdue.length}개)*\n` +
          overdue.map(t => line(t, `${diffDays(t.due_date, today)}일 초과`)).join('\n'),
      },
    })
  }
  if (dueToday.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📅 오늘 마감 (${dueToday.length}개)*\n` + dueToday.map(t => line(t)).join('\n'),
      },
    })
  }
  if (dueTomorrow.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⏰ 내일 마감 (${dueTomorrow.length}개)*\n` + dueTomorrow.map(t => line(t)).join('\n'),
      },
    })
  }

  blocks.push(
    { type: 'divider' },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '🔺 = 높은 우선순위' }] },
  )
  return blocks
}

type WorkspaceReminderSettings = {
  workspace_id: string
  channel_id: string
  slack_token: string | null
}

type WorkspaceApiKeyRow = {
  workspace_id: string
  key_name: string
  key_value: string
}

export function buildReminderSettings(rows: WorkspaceApiKeyRow[], envBotToken: string | null): WorkspaceReminderSettings[] {
  const byWorkspace = new Map<string, { channel_id?: string; slack_token?: string }>()
  for (const row of rows) {
    const current = byWorkspace.get(row.workspace_id) ?? {}
    if (row.key_name === 'slack_reminder_channel') current.channel_id = row.key_value
    if (row.key_name === 'slack_user') current.slack_token = row.key_value
    byWorkspace.set(row.workspace_id, current)
  }
  return [...byWorkspace.entries()].flatMap(([workspace_id, settings]) => {
    if (!settings.channel_id) return []
    return [{
      workspace_id,
      channel_id: settings.channel_id,
      slack_token: envBotToken ?? settings.slack_token ?? null,
    }]
  })
}

export async function GET(req: Request) {
  const config = getReminderConfig(process.env)
  if (!config.ok) {
    return Response.json({ error: config.error }, { status: config.status })
  }

  // Vercel Cron 인증
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${config.cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const sb = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: keyRows, error: keyErr } = await sb
    .from('workspace_api_keys')
    .select('workspace_id, key_name, key_value')
    .in('key_name', ['slack_reminder_channel', 'slack_user'])

  if (keyErr) {
    console.error('[reminders/slack] 설정 조회 오류:', keyErr)
    return Response.json({ error: keyErr.message }, { status: 500 })
  }
  const channels = buildReminderSettings((keyRows ?? []) as WorkspaceApiKeyRow[], config.botToken)
  if (channels.length === 0) {
    console.log('[reminders/slack] 설정된 리마인더 채널 없음')
    return Response.json({ sent: false, reason: 'no channels configured' })
  }

  const today    = kstToday()
  const tomorrow = tomorrowKST()

  const results = []
  for (const { workspace_id, channel_id, slack_token } of channels) {
    if (!slack_token) {
      results.push({ workspace_id, sent: false, reason: 'slack token missing' })
      continue
    }

    const { data: tasks, error: taskErr } = await sb
      .from('gantt_tasks')
      .select('id, title, due_date, status, priority')
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .is('archived_at', null)
      .not('due_date', 'is', null)
      .neq('status', 'done')
      .lte('due_date', tomorrow)
      .order('due_date', { ascending: true })

    if (taskErr) {
      console.error(`[reminders/slack] 태스크 조회 오류 (${workspace_id}):`, taskErr)
      continue
    }

    const { overdue, dueToday, dueTomorrow } = groupReminderTasks(tasks as Task[], today, tomorrow)
    if (overdue.length === 0 && dueToday.length === 0 && dueTomorrow.length === 0) {
      console.log(`[reminders/slack] 알림할 태스크 없음 (${workspace_id})`)
      results.push({ workspace_id, sent: false, reason: 'nothing urgent' })
      continue
    }

    const blocks = buildBlocks(overdue, dueToday, dueTomorrow, today)
    const slack = new WebClient(slack_token)
    await slack.chat.postMessage({
      channel: channel_id,
      text: `📋 태스크 리마인더 — ${fmtKSTDate(today)}`,
      blocks,
    })

    const counts = { overdue: overdue.length, today: dueToday.length, tomorrow: dueTomorrow.length }
    console.log(`[reminders/slack] 발송 완료 (${workspace_id})`, counts)
    results.push({ workspace_id, sent: true, counts })
  }

  return Response.json({ results })
}
