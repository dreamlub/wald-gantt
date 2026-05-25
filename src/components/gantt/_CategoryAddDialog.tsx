import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CAT_COLORS } from './_GanttRows'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  newCatName: string
  onNameChange: (val: string) => void
  newCatColor: string
  onColorChange: (val: string) => void
  onSubmit: () => void
}

export function CategoryAddDialog({
  open, onOpenChange,
  newCatName, onNameChange,
  newCatColor, onColorChange,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>카테고리 추가</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div>
            <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">이름</label>
            <input
              autoFocus
              className="mt-1.5 w-full text-xs border border-border rounded px-3 py-2 outline-none focus:border-lilac-300 placeholder:text-ink-300"
              placeholder="카테고리명"
              value={newCatName}
              onChange={e => onNameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onOpenChange(false) }}
            />
          </div>
          <div>
            <label className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">색상</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CAT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColorChange(c)}
                  className={`w-6 h-6 rounded-full hover:scale-110 transition-transform border border-black/5 ${newCatColor === c ? 'ring-2 ring-foreground ring-offset-1' : ''}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={onSubmit} disabled={!newCatName.trim()}>추가</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
