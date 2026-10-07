import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { IconAlert, IconCheck, IconInfo, IconX } from '../icons'
import { ToastContext, type ToastApi, type ToastItem, type ToastOptions, type ToastType } from './feedback'

const MAX_TOASTS = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id))
  }, [])

  const show = useCallback((type: ToastType, title: string, options: ToastOptions = {}) => {
    const id = nextId.current++
    setToasts((items) => [...items.slice(-(MAX_TOASTS - 1)), { id, type, title, ...options }])
    return id
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, options) => show('success', title, options),
      error: (title, options) => show('error', title, options),
      info: (title, options) => show('info', title, options),
    }),
    [show, dismiss],
  )

  return (
    <ToastContext value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed bottom-0 left-0 right-0 z-[60] flex flex-col items-center gap-2 p-4 sm:left-auto sm:w-[26rem] sm:items-end sm:p-6"
          style={{ paddingBottom: 'var(--toast-offset, max(1rem, env(safe-area-inset-bottom)))' }}
        >
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} dismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext>
  )
}

const STYLES: Record<ToastType, { icon: ReactNode; iconClass: string }> = {
  success: {
    icon: <IconCheck size={16} strokeWidth={2.5} />,
    iconClass: 'bg-emerald-500 text-white',
  },
  error: {
    icon: <IconAlert size={16} />,
    iconClass: 'bg-rose-500 text-white',
  },
  info: {
    icon: <IconInfo size={16} />,
    iconClass: 'bg-primary-500 text-white',
  },
}

function Toast({ toast, dismiss }: { toast: ToastItem; dismiss: (id: number) => void }) {
  const { t } = useI18n()
  const [paused, setPaused] = useState(false)
  const duration = toast.duration ?? (toast.action ? 6500 : toast.type === 'error' ? 5500 : 3500)
  const onDismiss = () => dismiss(toast.id)

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => dismiss(toast.id), duration)
    return () => window.clearTimeout(timer)
  }, [paused, duration, dismiss, toast.id])

  const style = STYLES[toast.type]
  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-2xl border border-line bg-card/95 p-3.5 pr-2.5 shadow-pop backdrop-blur-md"
    >
      <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', style.iconClass)}>
        {style.icon}
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-sm font-semibold text-fg">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-[13px] text-muted">{toast.description}</p>}
        {toast.action &&
          (toast.action.to ? (
            <Link
              to={toast.action.to}
              onClick={() => {
                toast.action?.onClick?.()
                onDismiss()
              }}
              className="mt-1.5 inline-flex text-[13px] font-semibold text-primary-600 hover:underline dark:text-primary-400"
            >
              {toast.action.label} →
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick?.()
                onDismiss()
              }}
              className="mt-1.5 inline-flex text-[13px] font-semibold text-primary-600 hover:underline dark:text-primary-400"
            >
              {toast.action.label}
            </button>
          ))}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-subtle hover:text-fg"
        aria-label={t('close')}
      >
        <IconX size={16} />
      </button>
    </div>
  )
}
