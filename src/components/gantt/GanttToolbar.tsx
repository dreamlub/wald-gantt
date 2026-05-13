'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, ChevronDown, GitCompare, Undo2, Search } from 'lucide-react'
import type { GanttCategory, GanttStatus } from '@/types'

type ViewMode = 'month' | 'week'
type SortMode = 'default' | 'start-asc' | 'end-desc'

interface Props {
  boardName?: string
  readOnly?: boolean
  // undo
  undoCount?: number
  onUndo?: () => void
  // search
  searchQuery: string
  onSearchChange: (v: string) => void
  // team filter
  allTeams: string[]
  excludedTeams: Set<string>
  onToggleTeam: (team: string) => void
  // pm filter
  allPMs: string[]
  excludedPMs: Set<string>
  onTogglePM: (pm: string) => void
  // view
  viewMode: ViewMode
  onViewModeChange: (v: ViewMode) => void
  // sort
  sortMode: SortMode
  onSortModeChange: (v: SortMode) => void
  // ghost compare
  ghostEnabled: boolean
  onToggleGhost?: (enabled: boolean) => Promise<void>
  // add project
  sortedCats: GanttCategory[]
  onAddProject: (categoryId: string) => void
}

export function GanttToolbar({
  boardName, readOnly,
  undoCount = 0, onUndo,
  searchQuery, onSearchChange,
  allTeams, excludedTeams, onToggleTeam,
  allPMs, excludedPMs, onTogglePM,
  viewMode, onViewModeChange,
  sortMode, onSortModeChange,
  ghostEnabled, onToggleGhost,
  sortedCats, onAddProject,
}: Props) {
  const [showTeamFilter, setShowTeamFilter] = useState(false)
  const [showPMFilter, setShowPMFilter]     = useState(false)
  const teamFilterRef = useRef<HTMLDivElement>(null)
  const pmFilterRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (teamFilterRef.current && !teamFilterRef.current.contains(e.target as Node))
        setShowTeamFilter(false)
    }
    if (showTeamFilter) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showTeamFilter])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (pmFilterRef.current && !pmFilterRef.current.contains(e.target as Node))
        setShowPMFilter(false)
    }
    if (showPMFilter) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showPMFilter])

  return (
    <div className="flex items-center justify-between px-5 py-2 border-b shrink-0">
      {/* 왼쪽: 보드명 + undo */}
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold text-gray-800">{boardName ?? '간트 차트'}</h1>
        {!readOnly && onUndo && (
          <button
            onClick={onUndo}
            disabled={undoCount === 0}
            title={`실행 취소 (Ctrl+Z)${undoCount > 0 ? ` — ${undoCount}단계` : ''}`}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <Undo2 size={13} />
            {undoCount > 0 && <span className="tabular-nums">{undoCount}</span>}
          </button>
        )}
      </div>

      {/* 오른쪽: 각종 컨트롤 */}
      <div className="flex items-center gap-3">
        {/* 검색 */}
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2 text-gray-300 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="프로젝트 검색"
            className="text-[11px] pl-6 pr-2 py-1 border rounded w-36 outline-none focus:ring-1 focus:ring-indigo-300 text-gray-600 placeholder:text-gray-300"
          />
        </div>

        {/* 팀 필터 */}
        {allTeams.length > 0 && (
          <div className="relative" ref={teamFilterRef}>
            <button
              onClick={() => setShowTeamFilter(v => !v)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 border rounded transition-colors ${excludedTeams.size > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              팀 필터
              {excludedTeams.size > 0 && (
                <span className="bg-indigo-500 text-white rounded-full text-[9px] w-3.5 h-3.5 flex items-center justify-center">
                  {excludedTeams.size}
                </span>
              )}
              <ChevronDown size={11} />
            </button>
            {showTeamFilter && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                <div className="px-3 py-1.5 border-b flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-600">팀별 보기</span>
                  {excludedTeams.size > 0 && (
                    <button onClick={() => allTeams.filter(t => excludedTeams.has(t)).forEach(onToggleTeam)} className="text-[10px] text-indigo-500 hover:text-indigo-700">전체 표시</button>
                  )}
                </div>
                {allTeams.map(team => (
                  <label key={team} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={!excludedTeams.has(team)} onChange={() => onToggleTeam(team)} className="w-3 h-3 rounded accent-indigo-500" />
                    <span className="text-xs text-gray-700">{team || '팀 없음'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PM 필터 */}
        {allPMs.length > 0 && (
          <div className="relative" ref={pmFilterRef}>
            <button
              onClick={() => setShowPMFilter(v => !v)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 border rounded transition-colors ${excludedPMs.size > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              PM 필터
              {excludedPMs.size > 0 && (
                <span className="bg-indigo-500 text-white rounded-full text-[9px] w-3.5 h-3.5 flex items-center justify-center">
                  {excludedPMs.size}
                </span>
              )}
              <ChevronDown size={11} />
            </button>
            {showPMFilter && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                <div className="px-3 py-1.5 border-b flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-600">PM별 보기</span>
                  {excludedPMs.size > 0 && (
                    <button onClick={() => allPMs.filter(p => excludedPMs.has(p)).forEach(onTogglePM)} className="text-[10px] text-indigo-500 hover:text-indigo-700">전체 표시</button>
                  )}
                </div>
                {allPMs.map(pm => (
                  <label key={pm} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={!excludedPMs.has(pm)} onChange={() => onTogglePM(pm)} className="w-3 h-3 rounded accent-indigo-500" />
                    <span className="text-xs text-gray-700">{pm || 'PM 없음'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 뷰 모드 */}
        <div className="flex items-center gap-0.5 border rounded overflow-hidden text-[11px]">
          {(['month', 'week'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-2 py-1 transition-colors ${viewMode === mode ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {mode === 'month' ? '월' : '주'}
            </button>
          ))}
        </div>

        {/* 정렬 */}
        <div className="flex items-center gap-0.5 border rounded overflow-hidden text-[11px]">
          {(['default', 'start-asc', 'end-desc'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => onSortModeChange(mode)}
              className={`px-2 py-1 transition-colors ${sortMode === mode ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {mode === 'default' ? '기본' : mode === 'start-asc' ? '시작일↑' : '종료일↓'}
            </button>
          ))}
        </div>

        {/* Ghost 비교 */}
        {onToggleGhost && (
          <button
            onClick={async () => onToggleGhost(!ghostEnabled)}
            title="이전 일정과 비교"
            className={`flex items-center gap-1 text-[11px] px-2 py-1 border rounded transition-colors ${ghostEnabled ? 'border-purple-300 bg-purple-50 text-purple-600 font-medium' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <GitCompare size={12} /> 비교
          </button>
        )}

        {/* 프로젝트 추가 */}
        {!readOnly && sortedCats.length > 0 && (
          <button onClick={() => onAddProject(sortedCats[0].id)} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            <Plus size={15} /> 프로젝트
          </button>
        )}
      </div>
    </div>
  )
}
