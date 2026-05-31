'use client'

import { IssueTracker } from './issue-tracker'

interface Props { brandFilter?: string }

export function IssueTrackerViewSwitch({ brandFilter }: Props) {
  return <IssueTracker brandFilter={brandFilter} />
}
