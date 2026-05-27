'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle } from 'lucide-react'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  /** 기본 true — true면 확인 버튼이 red, false면 indigo */
  danger?: boolean
}

interface State {
  opts: ConfirmOptions
  resolve: (v: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<State | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ opts, resolve })
    })
  }, [])

  function close(value: boolean) {
    state?.resolve(value)
    setState(null)
  }

  const dialog = state ? createPortal(
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 'var(--z-dialog)' }}>
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => close(false)}
      />
      {/* panel */}
      <div className="relative bg-card rounded-xl shadow-2xl w-[360px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          {state.opts.danger !== false && (
            <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-status-late/10 flex items-center justify-center">
              <AlertTriangle size={15} className="text-status-late" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-semibold text-foreground">{state.opts.title}</h3>
            {state.opts.description && (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{state.opts.description}</p>
            )}
          </div>
          <button
            onClick={() => close(false)}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        {/* footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-muted">
          <button
            onClick={() => close(false)}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => close(true)}
            className={`px-4 py-1.5 text-xs text-background rounded font-medium transition-colors
              ${state.opts.danger !== false
                ? 'bg-status-late hover:bg-status-late/80'
                : 'bg-foreground hover:bg-ink-800'}`}
          >
            {state.opts.confirmLabel ?? '삭제'}
          </button>
        </div>
      </div>
    </div>
  , document.body) : null

  return { confirm, dialog }
}
