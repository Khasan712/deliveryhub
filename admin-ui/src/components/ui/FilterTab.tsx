import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface FilterTabProps {
  active: boolean
  onClick: () => void
  label: string
  /** Colour dot before the label (a `bg-*` class). */
  dot?: string
  icon?: ReactNode
  /** Small counter after the label (hidden when 0). */
  count?: number
}

/** One pill of a filter row above a list («Barcha holatlar · Buyurtma qilingan · …»); pressed while applied. */
export function FilterTab({ active, onClick, label, dot, icon, count }: FilterTabProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors',
        active
          ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
          : 'bg-subtle text-fg-soft hover:bg-line hover:text-fg',
      )}
    >
      {dot && <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />}
      {icon}
      {label}
      {!!count && (
        <>
          {/* The space keeps «Muzlatilgan 1» apart for screen readers (flex gaps already space it visually). */}{' '}
          <span
            className={cn(
              '-mr-1 min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 tabular',
              active ? 'bg-white/20 dark:bg-slate-900/15' : 'bg-card text-muted ring-1 ring-line',
            )}
          >
            {count}
          </span>
        </>
      )}
    </button>
  )
}
