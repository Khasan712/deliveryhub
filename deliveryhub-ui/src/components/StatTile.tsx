import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Skeleton } from './ui/Skeleton'

const TONES = {
  brand: 'bg-brand-50 text-brand-700',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
}

interface StatTileProps {
  label: string
  value?: ReactNode
  icon: ReactNode
  tone?: keyof typeof TONES
  valueClassName?: string
  loading?: boolean
}

/** One figure of a <StatGrid> (a description list: label → value). */
export function StatTile({ label, value, icon, tone = 'brand', valueClassName, loading }: StatTileProps) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/80 shadow-card sm:p-5">
      <dt className="flex items-start justify-between gap-2 text-sm font-medium text-slate-500">
        {label}
        <span className={cx('grid size-8 shrink-0 place-items-center rounded-xl', TONES[tone])}>{icon}</span>
      </dt>
      <dd
        className={cx(
          'mt-1 text-[22px] leading-tight font-extrabold tracking-tight break-words tabular-nums sm:text-[26px]',
          valueClassName ?? 'text-slate-900',
        )}
      >
        {loading ? <Skeleton className="mt-1 h-8 w-20" /> : value}
      </dd>
    </div>
  )
}

export function StatGrid({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={className}>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{children}</dl>
    </section>
  )
}
