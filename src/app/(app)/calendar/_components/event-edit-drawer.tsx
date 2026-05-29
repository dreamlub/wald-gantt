'use client'

import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import type { CalEvent } from '@/types'
import { Drawer, DrawerHeader, DrawerBody, DrawerFooter } from '@/components/ui/drawer'
import { fmtScheduledAt } from '../_utils'

const DURATIONS = [15, 30, 60, 90, 120] as const

interface Props {
  event: CalEvent | null
  onClose: () => void
  onUpdate: (id: string, fields: { title?: string; durationMinutes?: number }) => void
  onDelete: (id: string) => void
}

/** 캘린더 이벤트 편집 드로어 — 좁은 블록 인라인 편집을 대체 (제목·길이·삭제) */
export function EventEditDrawer({ event, onClose, onUpdate, onDelete }: Props) {
  const [title, setTitle] = useState('')

  // 다른 이벤트를 열 때만 제목 초기화 (길이 변경 등으로 event prop이 갱신돼도 입력 중 제목 보존)
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (event) setTitle(event.title) }, [event?.id])

  const commitTitle = () => {
    if (!event) return
    const t = title.trim()
    if (t && t !== event.title) onUpdate(event.id, { title: t })
  }

  const close = () => { commitTitle(); onClose() }

  return (
    <Drawer open={!!event} onClose={close} width={400}>
      {event && (
        <>
          <DrawerHeader>
            <div className="flex items-center justify-between h-12 px-5">
              <span className="text-sm font-semibold text-foreground">일정 편집</span>
              <button
                onClick={close}
                className="p-1.5 rounded-md text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </DrawerHeader>

          <DrawerBody className="px-5 py-4 flex flex-col gap-5">
            <div>
              <label className="text-xs font-medium text-ink-400">제목</label>
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => { if (e.key === 'Enter') { commitTitle(); (e.target as HTMLInputElement).blur() } }}
                placeholder="일정 제목"
                className="mt-1 w-full text-sm bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-lilac-300 text-foreground placeholder:text-ink-300"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-ink-400">시간</label>
              <p className="mt-1 text-sm text-foreground">
                {fmtScheduledAt(event.scheduled_at)} · {event.duration_minutes}분
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-400">길이</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DURATIONS.map(d => (
                  <button
                    key={d}
                    onClick={() => onUpdate(event.id, { durationMinutes: d })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      event.duration_minutes === d
                        ? 'bg-lilac-500 border-lilac-500 text-background font-medium'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {d}분
                  </button>
                ))}
              </div>
            </div>
          </DrawerBody>

          <DrawerFooter className="justify-between">
            <button
              onClick={() => { onDelete(event.id); onClose() }}
              className="flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg text-status-late hover:bg-status-late/10 transition-colors"
            >
              <Trash2 size={14} /> 삭제
            </button>
            <button
              onClick={close}
              className="text-sm px-3 py-1.5 rounded-lg bg-foreground text-background font-medium hover:bg-ink-800 transition-colors"
            >
              완료
            </button>
          </DrawerFooter>
        </>
      )}
    </Drawer>
  )
}
