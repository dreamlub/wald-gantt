import { describe, expect, it } from 'vitest'
import { buildReminderSettings, getReminderConfig, groupReminderTasks, type Task } from './route'

const BASE_ENV = {
  CRON_SECRET: 'secret',
  SLACK_BOT_TOKEN: 'bot',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}

describe('slack reminder config', () => {
  it('requires CRON_SECRET', () => {
    const result = getReminderConfig({ ...BASE_ENV, CRON_SECRET: undefined })
    expect(result).toEqual({ ok: false, error: 'CRON_SECRET 미설정', status: 500 })
  })

  it('requires Supabase service role credentials', () => {
    const result = getReminderConfig({ ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined })
    expect(result).toEqual({ ok: false, error: 'Supabase 환경변수 미설정', status: 500 })
  })

  it('uses the user token before bot token when both exist', () => {
    const result = getReminderConfig({ ...BASE_ENV, SLACK_USER_TOKEN: 'user' })
    expect(result.ok && result.botToken).toBe('user')
  })
})

describe('groupReminderTasks', () => {
  function task(id: string, dueDate: string): Task {
    return { id, title: id, due_date: dueDate, status: 'to-do', priority: null }
  }

  it('groups overdue, today, and tomorrow while ignoring later tasks', () => {
    const groups = groupReminderTasks([
      task('old', '2026-01-09'),
      task('today', '2026-01-10'),
      task('tomorrow', '2026-01-11'),
      task('later', '2026-01-12'),
    ], '2026-01-10', '2026-01-11')

    expect(groups.overdue.map(t => t.id)).toEqual(['old'])
    expect(groups.dueToday.map(t => t.id)).toEqual(['today'])
    expect(groups.dueTomorrow.map(t => t.id)).toEqual(['tomorrow'])
  })
})

describe('buildReminderSettings', () => {
  const rows = [
    { workspace_id: 'ws1', key_name: 'slack_reminder_channel', key_value: 'C1' },
    { workspace_id: 'ws1', key_name: 'slack_user', key_value: 'xoxp-db' },
    { workspace_id: 'ws2', key_name: 'slack_user', key_value: 'xoxp-no-channel' },
  ]

  it('builds per-workspace settings and ignores workspaces without a channel', () => {
    expect(buildReminderSettings(rows, null)).toEqual([
      { workspace_id: 'ws1', channel_id: 'C1', slack_token: 'xoxp-db' },
    ])
  })

  it('prefers the environment Slack token over workspace api keys', () => {
    expect(buildReminderSettings(rows, 'xoxb-env')).toEqual([
      { workspace_id: 'ws1', channel_id: 'C1', slack_token: 'xoxb-env' },
    ])
  })
})
