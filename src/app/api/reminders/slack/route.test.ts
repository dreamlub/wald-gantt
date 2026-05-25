import { describe, expect, it } from 'vitest'
import { getReminderConfig, groupReminderTasks, type Task } from './route'

const BASE_ENV = {
  CRON_SECRET: 'secret',
  REMINDER_WORKSPACE_ID: 'workspace',
  SLACK_REMINDER_CHANNEL_ID: 'channel',
  SLACK_BOT_TOKEN: 'bot',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
}

describe('slack reminder config', () => {
  it('requires CRON_SECRET', () => {
    const result = getReminderConfig({ ...BASE_ENV, CRON_SECRET: undefined })
    expect(result).toEqual({ ok: false, error: 'CRON_SECRET 미설정', status: 500 })
  })

  it('requires workspace and channel env vars', () => {
    const result = getReminderConfig({ ...BASE_ENV, REMINDER_WORKSPACE_ID: undefined })
    expect(result).toEqual({ ok: false, error: 'REMINDER_WORKSPACE_ID 또는 SLACK_REMINDER_CHANNEL_ID 미설정', status: 500 })
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
