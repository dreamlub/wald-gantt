'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, FolderOpen, X, Settings2, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import Link from 'next/link'
import { useVaultHandle } from '@/hooks/use-vault-handle'
import { getPathPattern, setPathPattern } from '@/lib/daily-note'
import { DailyNoteView } from './_components/DailyNoteView'

function todayLocal(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export default function NotesPage() {
  const { handle, status, connect, requestPermission, disconnect } = useVaultHandle()
  const [sidebarOpen,    setSidebarOpen]    = useState(true)
  const [selectedDate,   setSelectedDate]   = useState<Date>(todayLocal)
  const [patternEditing, setPatternEditing] = useState(false)
  const [patternDraft,   setPatternDraft]   = useState('')

  const isConnected = status === 'connected'
  const isLoading   = status === 'loading'

  const dayLabel = format(selectedDate, 'yyyy. M. d (eee)', { locale: ko })

  function openPatternEdit() {
    setPatternDraft(getPathPattern())
    setPatternEditing(true)
  }

  function savePattern() {
    setPathPattern(patternDraft.trim() || 'Daily Notes/YYYY-MM-DD')
    setPatternEditing(false)
  }

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* 사이드바 */}
      <div
        className="shrink-0 border-r bg-muted flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: sidebarOpen ? 240 : 0 }}
      >
        <div className="h-12 flex items-center px-4 border-b bg-card shrink-0 gap-2">
          <h1 className="flex-1 text-[10px] font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap">Notes</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded text-ink-300 hover:text-muted-foreground hover:bg-muted transition-colors"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden min-h-0 px-3 py-3">
          {/* 미니 캘린더 */}
          <div className="bg-card rounded-lg border border-border/60 px-2 pb-2 pt-1">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={d => d && setSelectedDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()))}
              locale={ko}
              className="p-0 w-full [--cell-size:--spacing(6)] bg-transparent"
              classNames={{
                caption_label: 'text-[12px] font-semibold tracking-tight',
                weekday: 'flex-1 text-center text-[10px] font-medium text-ink-400 select-none',
                week: 'mt-1 flex w-full',
              }}
            />
            <div className="mt-1 pt-1.5 border-t border-border/60">
              <button
                onClick={() => setSelectedDate(todayLocal())}
                className="flex items-center gap-1 text-[11px] text-ink-400 hover:text-foreground transition-colors px-1"
              >
                <span className="w-1.5 h-1.5 rounded-full border border-ink-400 inline-block" />
                오늘로
              </button>
            </div>
          </div>

          {/* 구분선 */}
          <div className="my-3 border-t border-border" />

          {/* Vault 섹션 */}
          <div>
            <div className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-2">Vault</div>

            {isLoading && (
              <p className="text-[11px] text-ink-300 px-1">연결 확인 중...</p>
            )}

            {status === 'disconnected' && (
              <button
                onClick={connect}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              >
                <FolderOpen size={12} /> 폴더 연결
              </button>
            )}

            {status === 'needs-permission' && (
              <div className="space-y-1">
                <p className="text-[11px] text-ink-400 px-1 truncate">{handle?.name}</p>
                <button
                  onClick={requestPermission}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-[11px] text-status-warn hover:bg-card transition-colors"
                >
                  <FolderOpen size={12} /> 권한 재허용
                </button>
              </div>
            )}

            {isConnected && (
              <div className="space-y-1">
                <p className="text-[11px] text-foreground font-medium px-1 truncate" title={handle?.name}>
                  📁 {handle?.name}
                </p>
                <button
                  onClick={openPatternEdit}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                >
                  <Settings2 size={11} /> 경로 패턴
                </button>
                <button
                  onClick={disconnect}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-[11px] text-ink-400 hover:text-status-late hover:bg-card transition-colors"
                >
                  <X size={11} /> 연결 해제
                </button>
              </div>
            )}

            {/* 경로 패턴 편집 */}
            {patternEditing && (
              <div className="mt-2 space-y-1.5">
                <p className="text-[10px] text-ink-400 px-1">예: Daily Notes/YYYY-MM-DD</p>
                <input
                  autoFocus
                  value={patternDraft}
                  onChange={e => setPatternDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') savePattern(); if (e.key === 'Escape') setPatternEditing(false) }}
                  className="w-full text-[11px] border border-border rounded px-2 py-1.5 bg-card outline-none focus:border-lilac-300"
                />
                <div className="flex gap-1">
                  <button onClick={savePattern} className="flex-1 text-[11px] py-1 rounded bg-foreground text-background font-medium hover:bg-ink-800 transition-colors">저장</button>
                  <button onClick={() => setPatternEditing(false)} className="flex-1 text-[11px] py-1 rounded bg-muted text-muted-foreground hover:bg-card transition-colors">취소</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 메인 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 상단 바 */}
        <div className="h-12 border-b bg-card flex items-center px-4 gap-3 shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <PanelLeftOpen size={15} />
            </button>
          )}

          {/* 날짜 네비게이션 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedDate(d => addDays(d, -1))}
              className="p-1 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-foreground min-w-[160px] text-center select-none">
              {dayLabel}
            </span>
            <button
              onClick={() => setSelectedDate(d => addDays(d, 1))}
              className="p-1 rounded text-ink-400 hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* 오늘 버튼 */}
          {selectedDate.toDateString() !== todayLocal().toDateString() && (
            <button
              onClick={() => setSelectedDate(todayLocal())}
              className="text-[11px] px-2 py-1 rounded bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              오늘
            </button>
          )}
        </div>

        {/* 콘텐츠 */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-xs text-ink-300">
            연결 확인 중...
          </div>
        )}

        {!isLoading && status === 'disconnected' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <FolderOpen size={28} className="text-ink-300" />
            <p className="text-sm font-medium text-foreground">Vault가 연결되지 않았습니다</p>
            <Link
              href="/settings?section=integrations"
              className="text-[11px] text-lilac-500 hover:underline"
            >
              Settings › 연동에서 연결하기
            </Link>
          </div>
        )}

        {!isLoading && status === 'needs-permission' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={22} className="text-ink-300" />
            <p className="text-sm font-medium text-foreground">폴더 접근 권한이 필요해요</p>
            <p className="text-xs text-muted-foreground">브라우저를 새로 열면 권한 재확인이 필요합니다</p>
            <button
              onClick={requestPermission}
              className="px-4 py-2 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-80 transition-opacity"
            >
              권한 허용
            </button>
          </div>
        )}

        {isConnected && handle && (
          <DailyNoteView
            key={selectedDate.toISOString()}
            handle={handle}
            date={selectedDate}
          />
        )}
      </div>
    </div>
  )
}
