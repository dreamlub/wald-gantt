'use client'

import { Trash2, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface WeeklySource {
  id: string
  workspace_id: string
  label: string
  collection_id: string
  sort_order: number
}

export function SortableWeeklyRow({ src, onDelete }: { src: WeeklySource; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: src.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-background"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-ink-400 hover:text-foreground transition-colors cursor-grab active:cursor-grabbing shrink-0"
        aria-label="순서 변경"
      >
        <GripVertical size={14} />
      </button>
      <span className="text-sm font-medium text-foreground w-24 shrink-0 truncate">{src.label}</span>
      <span className="text-sm text-muted-foreground flex-1 truncate">{src.collection_id}</span>
      <button
        onClick={() => onDelete(src.id)}
        className="text-ink-400 hover:text-status-late transition-colors shrink-0"
        aria-label={`${src.label} 삭제`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
