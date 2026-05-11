import { STATUS_LABELS, STATUS_COLORS } from '@/lib/gantt-utils'

interface Props {
  status: string
}

export function StatusBadge({ status }: Props) {
  const label = STATUS_LABELS[status] ?? status
  const color = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
