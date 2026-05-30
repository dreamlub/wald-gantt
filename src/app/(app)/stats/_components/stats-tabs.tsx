'use client'

import { useState } from 'react'
import { MessageSquareText, FolderKanban, CircleDot, type LucideIcon } from 'lucide-react'
import { StatsDashboard } from './stats-dashboard'
import { ProjectStats } from './project-stats'
import { IssueStats } from './issue-stats'

type TabKey = 'messages' | 'projects' | 'issues'

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'messages', label: '메시지', icon: MessageSquareText },
  { key: 'projects', label: '프로젝트', icon: FolderKanban },
  { key: 'issues', label: '이슈', icon: CircleDot },
]

export function StatsTabs() {
  const [tab, setTab] = useState<TabKey>('messages')

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="shrink-0 h-12 flex items-stretch border-b bg-card px-3">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? 'border-lilac-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-ink-200'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {tab === 'messages' ? <StatsDashboard />
          : tab === 'projects' ? <ProjectStats />
            : <IssueStats />}
      </div>
    </div>
  )
}
