interface Props {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className ?? 'py-12'}`}>
      {icon && <div className="opacity-30 mb-3">{icon}</div>}
      <div className="text-xs text-muted-foreground">{title}</div>
      {description && <div className="text-[11px] text-ink-400 mt-1">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
