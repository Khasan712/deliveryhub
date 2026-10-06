import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { errorMessage } from '../../lib/errors'
import { ErrorCircleIcon, RefreshIcon } from '../icons'
import { Button } from './Button'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  /** `h1` when the state is the whole page (not found). */
  headingLevel?: 'h1' | 'h2'
}

export function EmptyState({ icon, title, description, action, className, headingLevel = 'h2' }: EmptyStateProps) {
  const Heading = headingLevel
  return (
    <div
      className={cx(
        'animate-enter rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center',
        className,
      )}
    >
      <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-linear-to-br from-brand-50 to-brand-100 text-brand-700 ring-1 ring-brand-100">
        {icon}
      </span>
      <Heading className="mt-5 text-xl font-extrabold tracking-tight">{title}</Heading>
      {description && <p className="mx-auto mt-1.5 max-w-md text-slate-500">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  error: unknown
  title?: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
  headingLevel?: 'h1' | 'h2'
}

export function ErrorState({
  error,
  title = "Ma'lumotlarni yuklab bo'lmadi",
  onRetry,
  retrying,
  className,
  headingLevel = 'h2',
}: ErrorStateProps) {
  const Heading = headingLevel
  return (
    <div
      role="alert"
      className={cx('animate-enter rounded-3xl bg-white px-6 py-12 text-center ring-1 ring-red-100 shadow-card', className)}
    >
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
        <ErrorCircleIcon size={28} />
      </span>
      <Heading className="mt-4 text-lg font-extrabold tracking-tight">{title}</Heading>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry} loading={retrying}>
          {!retrying && <RefreshIcon size={16} />}
          Qayta urinish
        </Button>
      )}
    </div>
  )
}
