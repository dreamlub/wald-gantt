'use client'

import { useState } from 'react'
import { LayoutDashboard, MessageSquareText, ClipboardList, FolderKanban, CircleDot, type LucideIcon } from 'lucide-react'
import { OverviewStats } from './overview-stats'
import { StatsDashboard } from './stats-dashboard'
import { ReviewStats } from './review-stats'
import { ProjectStats } from './project-stats'
import { IssueStats } from './issue-stats'

type TabKey = 'overview' | 'signals' | 'review' | 'execution' | 'issues'

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'overview',  label: '종합',     icon: LayoutDashboard },
  { key: 'signals',   label: '신호',     icon: MessageSquareText },
  { key: 'review',    label: '일감 판단', icon: ClipboardList },
  { key: 'execution', label: '실행',     icon: FolderKanban },
  { key: 'issues',    label: '이슈',     icon: CircleDot },
]

export function StatsTabs() {
  const [tab, setTab] = useState<TabKey>('overview')

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
        {tab === 'overview' ? <OverviewStats />
          : tab === 'signals' ? <StatsDashboard />
            : tab === 'review' ? <ReviewStats />
              : tab === 'execution' ? <ProjectStats />
                : <IssueStats />}
      </div>
    </div>
  )
}
