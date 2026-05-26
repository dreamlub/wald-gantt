import { X } from 'lucide-react'

export function FilterChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm px-2 py-[3px] rounded-full bg-foreground text-background whitespace-nowrap shrink-0">
      {children}
      <button
        onClick={onClear}
        className="ml-0.5 -mr-0.5 opacity-60 hover:opacity-100 transition-opacity"
        title="필터 해제"
      >
        <X size={10} />
      </button>
    </span>
  )
}

