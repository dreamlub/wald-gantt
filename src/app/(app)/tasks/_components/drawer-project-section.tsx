'use client'

import { useEffect, useState } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import { useClickAway } from '@/hooks/use-click-away'

export interface ProjectOption {
  id: string
  name: string
  board_name: string
}

interface Props {
  linkedProjects: ProjectOption[]
  setLinkedProjects: React.Dispatch<React.SetStateAction<ProjectOption[]>>
  onSearchProjects: (query: string) => Promise<ProjectOption[]>
}

export function DrawerProjectSection({ linkedProjects, setLinkedProjects, onSearchProjects }: Props) {
  const [projSearch,   setProjSearch]   = useState('')
  const [projResults,  setProjResults]  = useState<ProjectOption[]>([])
  const [showProjDrop, setShowProjDrop] = useState(false)
  const projRef = useClickAway<HTMLDivElement>(showProjDrop, () => setShowProjDrop(false))

  useEffect(() => {
    if (!showProjDrop) return
    const timer = setTimeout(async () => {
      const results = await onSearchProjects(projSearch)
      setProjResults(results.filter(r => !linkedProjects.some(l => l.id === r.id)))
    }, projSearch.trim() ? 200 : 0)
    return () => clearTimeout(timer)
  }, [projSearch, linkedProjects, onSearchProjects, showProjDrop])

  function linkProject(p: ProjectOption) {
    setLinkedProjects(prev => [...prev, p])
    setProjSearch(''); setProjResults([]); setShowProjDrop(false)
  }

  return (
    <div>
      <label className="text-xs font-semibold text-ink-400 uppercase tracking-wider">연결 프로젝트</label>
      {linkedProjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
          {linkedProjects.map(p => (
            <span
              key={p.id}
              className="flex items-center gap-1 text-2xs bg-accent text-accent-foreground border border-lilac-200 px-2 py-0.5 rounded-full"
            >
              <span className="text-lilac-400 text-4xs">{p.board_name}</span>
              <span>/</span>
              {p.name}
              <button
                onClick={() => setLinkedProjects(prev => prev.filter(lp => lp.id !== p.id))}
                className="ml-0.5 text-lilac-300 hover:text-accent-foreground"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative mt-1.5" ref={projRef}>
        <div className="flex items-center border border-border rounded px-2.5 gap-1.5 focus-within:border-lilac-300">
          <Search size={11} className="text-ink-300 shrink-0" />
          <input
            className="flex-1 text-xs py-1.5 outline-none placeholder:text-ink-300"
            placeholder="클릭해서 전체 보기 / 검색"
            value={projSearch}
            onChange={e => { setProjSearch(e.target.value); setShowProjDrop(true) }}
            onFocus={() => setShowProjDrop(true)}
          />
          <ChevronDown size={11} className="text-ink-300 shrink-0" />
        </div>
        {showProjDrop && projResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 py-1 max-h-60 overflow-y-auto">
            {(() => {
              const groups = projResults.reduce<Record<string, ProjectOption[]>>((acc, p) => {
                const key = p.board_name || '(보드 없음)'
                ;(acc[key] ??= []).push(p)
                return acc
              }, {})
              return Object.entries(groups).map(([board, list]) => (
                <div key={board}>
                  <div className="px-3 pt-1.5 pb-0.5 text-2xs font-semibold text-ink-400 uppercase tracking-wider bg-muted/50">
                    {board}
                  </div>
                  {list.map(p => (
                    <button
                      key={p.id}
                      onClick={() => linkProject(p)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left"
                    >
                      <span className="text-ink-700">{p.name}</span>
                    </button>
                  ))}
                </div>
              ))
            })()}
          </div>
        )}
        {showProjDrop && projResults.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 py-3 px-3 text-center text-2xs text-ink-400">
            {projSearch.trim() ? '검색 결과 없음' : '연결 가능한 프로젝트가 없어요'}
          </div>
        )}
      </div>
    </div>
  )
}
