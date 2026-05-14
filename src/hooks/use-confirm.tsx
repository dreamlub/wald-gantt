'use client'

import { useState, useCallback } from 'react'
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

  const dialog = state ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={() => close(false)}
      />
      {/* panel */}
      <div className="relative bg-white rounded-xl shadow-2xl w-[360px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          {state.opts.danger !== false && (
            <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle size={15} className="text-red-500" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-800">{state.opts.title}</h3>
            {state.opts.description && (
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">{state.opts.description}</p>
            )}
          </div>
          <button
            onClick={() => close(false)}
            className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        {/* footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50">
          <button
            onClick={() => close(false)}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => close(true)}
            className={`px-4 py-1.5 text-xs text-white rounded font-medium transition-colors
              ${state.opts.danger !== false
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {state.opts.confirmLabel ?? '삭제'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, dialog }
}
