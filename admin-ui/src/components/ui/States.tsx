import type { ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { errorMessage } from '../../api/errors'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { IconAlert, IconInbox, IconRefresh, IconWifiOff } from '../icons'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 text-center', compact ? 'py-8' : 'py-14', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-subtle text-faint ring-1 ring-line">
        {icon ?? <IconInbox size={26} />}
      </div>
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  className?: string
  compact?: boolean
  title?: string
}

export function ErrorState({ error, onRetry, className, compact, title }: ErrorStateProps) {
  const { t } = useI18n()
  const offline = error instanceof ApiError && error.code === 'network'
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-6 text-center', compact ? 'py-8' : 'py-14', className)}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:ring-rose-500/20">
        {offline ? <IconWifiOff size={26} /> : <IconAlert size={26} />}
      </div>
      <p className="text-[15px] font-semibold text-fg">{title ?? t('error_load_title')}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{errorMessage(error, t)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" icon={<IconRefresh size={16} />} onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </div>
  )
}

/** Inline banner for hints and warnings. */
export function Callout({
  tone = 'info',
  icon,
  children,
  className,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'ai' | 'success'
  icon?: ReactNode
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200',
    ai: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200',
    success:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
  }
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border p-4 text-sm leading-relaxed', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}
