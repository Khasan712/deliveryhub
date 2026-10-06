import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { CheckCircleIcon, ErrorCircleIcon, InfoIcon, XIcon } from '../icons'
import { ToastContext, type ToastApi, type ToastOptions, type ToastTone } from './toast'

interface ToastItem extends ToastOptions {
  id: number
  tone: ToastTone
  title: string
}

const MAX_VISIBLE = 4
let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const api = useMemo<ToastApi>(() => {
    const show = (tone: ToastTone) => (title: string, options: ToastOptions = {}) => {
      nextId += 1
      const toast: ToastItem = { id: nextId, tone, title, ...options }
      setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), toast])
    }
    return { success: show('success'), error: show('error'), info: show('info') }
  }, [])

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), [])

  return (
    <ToastContext value={api}>
      {children}
      <section
        aria-label="Bildirishnomalar"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext>
  )
}

const TONES: Record<ToastTone, { icon: ReactNode; className: string }> = {
  success: { icon: <CheckCircleIcon size={20} />, className: 'text-emerald-600' },
  error: { icon: <ErrorCircleIcon size={20} />, className: 'text-red-600' },
  info: { icon: <InfoIcon size={20} />, className: 'text-brand-700' },
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false)
  const [paused, setPaused] = useState(false)
  const duration = toast.durationMs ?? (toast.tone === 'error' ? 7000 : 4500)

  useEffect(() => {
    if (paused || leaving) return undefined
    const timer = setTimeout(() => setLeaving(true), duration)
    return () => clearTimeout(timer)
  }, [paused, leaving, duration])

  useEffect(() => {
    if (!leaving) return undefined
    const timer = setTimeout(() => onDismiss(toast.id), 180)
    return () => clearTimeout(timer)
  }, [leaving, onDismiss, toast.id])

  const tone = TONES[toast.tone]
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cx(
        'pointer-events-auto flex items-start gap-3 rounded-2xl bg-white/95 p-4 pr-3 shadow-pop ring-1 ring-slate-900/10 backdrop-blur',
        leaving ? 'animate-toast-out' : 'animate-toast-in',
      )}
    >
      <span className={cx('mt-px shrink-0', tone.className)}>{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm text-slate-600">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => setLeaving(true)}
        aria-label="Yopish"
        className="-m-1 grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <XIcon size={16} />
      </button>
    </div>
  )
}
