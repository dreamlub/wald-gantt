export function TaskStatusBadge({ type, days }: {
  type: 'overdue' | 'start-delayed' | 'no-update'
  days: number
}) {
  if (type === 'overdue') {
    return (
      <span className="shrink-0 text-3xs px-1.5 py-0.5 rounded bg-status-late/10 text-status-late font-medium border border-status-late/15 whitespace-nowrap">
        지연 {days}일
      </span>
    )
  }
  if (type === 'start-delayed') {
    return (
      <span className="shrink-0 text-3xs px-1.5 py-0.5 rounded bg-status-warn/10 text-status-warn font-medium border border-status-warn/15 whitespace-nowrap">
        시작 지연 {days}일
      </span>
    )
  }
  return (
    <span className="shrink-0 text-3xs px-1.5 py-0.5 rounded bg-coral-100 text-coral-500 font-medium border border-coral-100 whitespace-nowrap">
      {days}일 무응답
    </span>
  )
}
