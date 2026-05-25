import { createClient } from '@supabase/supabase-js'
import { WebClient } from '@slack/web-api'
import type { Block, KnownBlock } from '@slack/web-api'

const PRIORITY_FLAG: Record<number, string> = { 3: '🔺 ', 2: '', 1: '', 0: '' }

interface Task {
  id: string
  title: string
  due_date: string
  status: string
  priority: number | null
}

function todayKST()    { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10) }
function tomorrowKST() { return new Date(Date.now() + 33 * 3600000).toISOString().slice(0, 10) }

function diffDays(due: string, today: string) {
  return Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400000)
}

function fmtKSTDate(d: string) {
  const date = new Date(d + 'T00:00:00+09:00')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${dow})`
}

function line(t: Task, suffix?: string) {
  const flag = PRIORITY_FLAG[t.priority ?? 0] ?? ''
  return `${flag}• ${t.title}${suffix ? `  —  ${suffix}` : ''}`
}

function buildBlocks(
  overdue: Task[], dueToday: Task[], dueTomorrow: Task[], today: string
): (KnownBlock | Block)[] {
  const total = overdue.length + dueToday.length + dueTomorrow.length
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
        text: `*📅 오늘 마감 (${dueToday.length}개)*\n` +
          dueToday.map(t => line(t)).join('\n'),
      },
    })
  }

  if (dueTomorrow.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⏰ 내일 마감 (${dueTomorrow.length}개)*\n` +
          dueTomorrow.map(t => line(t)).join('\n'),
      },
    })
  }

  blocks.push(
    { type: 'divider' },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '🔺 = 높은 우선순위' }] },
  )

  return blocks
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET 미설정' }, { status: 500 })
  }

  // Vercel Cron 인증
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const workspaceId = process.env.REMINDER_WORKSPACE_ID
  const reminderChannelId = process.env.SLACK_REMINDER_CHANNEL_ID
  if (!workspaceId || !reminderChannelId) {
    return Response.json(
      { error: 'REMINDER_WORKSPACE_ID 또는 SLACK_REMINDER_CHANNEL_ID 미설정' },
      { status: 500 }
    )
  }

  // chat:write 권한이 있는 토큰 사용
  const botToken = process.env.SLACK_USER_TOKEN ?? process.env.SLACK_BOT_TOKEN
  if (!botToken) {
    return Response.json({ error: 'SLACK_USER_TOKEN 또는 SLACK_BOT_TOKEN 미설정' }, { status: 500 })
  }

  // anon key + SECURITY DEFINER 함수로 RLS 우회
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  const today    = todayKST()
  const tomorrow = tomorrowKST()

  const { data: tasks, error } = await sb.rpc('get_reminder_tasks', {
    p_workspace_id: workspaceId,
  })

  if (error) {
    console.error('[reminders/slack] DB 오류:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const all = (tasks as Task[]).filter(t => t.due_date <= tomorrow)
  const overdue     = all.filter(t => t.due_date <  today)
  const dueToday    = all.filter(t => t.due_date === today)
  const dueTomorrow = all.filter(t => t.due_date === tomorrow)

  if (overdue.length === 0 && dueToday.length === 0 && dueTomorrow.length === 0) {
    console.log('[reminders/slack] 알림할 태스크 없음')
    return Response.json({ sent: false, reason: 'nothing urgent' })
  }

  const blocks = buildBlocks(overdue, dueToday, dueTomorrow, today)

  const slack = new WebClient(botToken)
  await slack.chat.postMessage({
    channel: reminderChannelId,
    text: `📋 태스크 리마인더 — ${fmtKSTDate(today)}`,
    blocks,
  })

  console.log(`[reminders/slack] 발송 완료 — 지연 ${overdue.length}, 오늘 ${dueToday.length}, 내일 ${dueTomorrow.length}`)
  return Response.json({
    sent: true,
    counts: { overdue: overdue.length, today: dueToday.length, tomorrow: dueTomorrow.length },
  })
}
