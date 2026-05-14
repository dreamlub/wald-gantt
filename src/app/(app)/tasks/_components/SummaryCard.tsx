interface Props {
  title: string
  value: string | number
  sub?: string
  borderColor: string
}

export function SummaryCard({ title, value, sub, borderColor }: Props) {
  return (
    <div
      className="flex-1 bg-white rounded-lg border border-gray-100 border-l-4 px-4 py-3 min-w-0"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="text-[10px] text-gray-400 mb-1 truncate">{title}</div>
      <div className="text-sm font-bold text-gray-800 leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
