interface Props {
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ children, className }: Props) {
  return (
    <span className={`text-[10px] font-semibold text-ink-400 uppercase tracking-wider ${className ?? ''}`}>
      {children}
    </span>
  )
}
