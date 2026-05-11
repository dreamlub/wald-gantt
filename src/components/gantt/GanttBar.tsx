interface Props {
  colStart: number  // 1-based grid column start
  colEnd: number    // 1-based grid column end (exclusive)
  color: string
  label: string
  isSubtask?: boolean
}

export function GanttBar({ colStart, colEnd, color, label, isSubtask }: Props) {
  if (colStart >= colEnd) return null

  return (
    <div
      className="flex items-center px-2 rounded-sm text-white text-xs font-medium truncate h-6 self-center"
      style={{
        gridColumnStart: colStart + 1, // +1 for label column
        gridColumnEnd: colEnd + 1,
        backgroundColor: color,
        opacity: isSubtask ? 0.7 : 1,
        minWidth: 0,
      }}
      title={label}
    >
      {label}
    </div>
  )
}
