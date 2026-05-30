'use client'

import { useState } from 'react'
import { List, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TimelineV2View } from './timeline-v2-view'
import { IssueTreeView } from './issue-tree-view'

interface Props {
  brandFilter?: string
}

export function TimelineWithToggle({ brandFilter }: Props) {
  const [mode, setMode] = useState<'tree' | 'list'>('tree')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 뷰 토글 */}
      <div className="shrink-0 px-4 py-2 border-b bg-card flex items-center gap-1">
        <button
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] transition-colors',
            mode === 'tree'
              ? 'bg-ink text-background font-medium'
              : 'text-ink-400 hover:text-ink hover:bg-muted',
          )}
          onClick={() => setMode('tree')}
        >
          <GitBranch size={13} />
          트리
        </button>
        <button
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] transition-colors',
            mode === 'list'
              ? 'bg-ink text-background font-medium'
              : 'text-ink-400 hover:text-ink hover:bg-muted',
          )}
          onClick={() => setMode('list')}
        >
          <List size={13} />
          리스트
        </button>
      </div>

      {mode === 'tree'
        ? <IssueTreeView brandFilter={brandFilter} />
        : <TimelineV2View brandFilter={brandFilter} />
      }
    </div>
  )
}
