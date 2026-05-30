'use client'

import { TimelineTracker } from './timeline-tracker'

interface Props { brandFilter?: string }

export function TimelineViewSwitch({ brandFilter }: Props) {
  return <TimelineTracker brandFilter={brandFilter} />
}
