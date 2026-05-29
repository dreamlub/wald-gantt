'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import type { CalEvent } from '@/types'
import { getCalendarEvents } from '@/lib/calendar-event-service'

const API = '/api/calendar/events'

/** 캘린더 전용 이벤트(할일과 분리) 상태 + CRUD. 구글 동기화는 API 라우트가 담당. */
export function useCalendarEvents(workspaceId: string | null) {
  const [events, setEvents] = useState<CalEvent[]>([])

  const loadEvents = useCallback(async (weekStart: string, weekEnd: string) => {
    if (!workspaceId) return
    try {
      const data = await getCalendarEvents(
        workspaceId,
        `${weekStart}T00:00:00+09:00`,
        `${weekEnd}T23:59:59+09:00`,
      )
      setEvents(data)
    } catch { /* 조용히 무시 */ }
  }, [workspaceId])

  // 빈 시간대 클릭 → 이벤트 생성 (+ 구글 반영)
  const createEvent = useCallback(async (scheduledAt: string, durationMinutes: number, title: string) => {
    try {
      const res = await fetch(API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scheduledAt, durationMinutes, title }),
      })
      if (!res.ok) { toast.error('일정 생성 실패'); return }
      const { event } = await res.json() as { event: CalEvent }
      setEvents(prev => [...prev, event])
    } catch { toast.error('일정 생성 실패') }
  }, [])

  // 이동/리사이즈/제목 수정 (+ 구글 반영)
  const updateEvent = useCallback(async (
    id: string,
    fields: { scheduledAt?: string; durationMinutes?: number; title?: string },
  ) => {
    setEvents(prev => prev.map(e => e.id === id ? {
      ...e,
      ...(fields.scheduledAt     !== undefined ? { scheduled_at: fields.scheduledAt } : {}),
      ...(fields.durationMinutes !== undefined ? { duration_minutes: fields.durationMinutes } : {}),
      ...(fields.title           !== undefined ? { title: fields.title } : {}),
    } : e))
    try {
      const res = await fetch(API, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, ...fields }),
      })
      if (!res.ok) { toast.error('일정 수정 실패'); return }
      // 서버가 정규화한 값(빈 제목 → '(제목 없음)' 등)으로 로컬 상태 정합화
      const { event } = await res.json() as { event: CalEvent }
      setEvents(prev => prev.map(e => e.id === id ? event : e))
    } catch { toast.error('일정 수정 실패') }
  }, [])

  // 삭제 (+ 구글 반영)
  const deleteEvent = useCallback(async (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id))
    try {
      await fetch(API, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
    } catch { /* 다음 로드 시 정리 */ }
  }, [])

  return { events, loadEvents, createEvent, updateEvent, deleteEvent }
}
