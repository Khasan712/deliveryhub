import type { BranchRef } from '../../api/types'
import { IconAlert, IconCheck, IconStore } from '../../components/icons'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'

/** The id of the first choice: a sale without its branch focuses it. */
export const SALE_BRANCH_ID = 'sale-branch'

/**
 * The head office's sale while orders are dispatched (2+ active branches): «Qaysi filial uchun?» — required, every
 * active branch a chip. With one active branch the sale gets it by itself (SaleBranchNote instead).
 */
export function SaleBranchChoice({
  branches,
  value,
  onChange,
  error,
  large,
}: {
  branches: BranchRef[]
  value: number | null
  onChange: (value: number) => void
  error: string | null
  /** A phone: taller chips. */
  large?: boolean
}) {
  const { t } = useI18n()
  const errorId = `${SALE_BRANCH_ID}-error`
  return (
    <fieldset className="min-w-0" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-fg">
        <IconStore size={16} className="text-teal-600 dark:text-teal-300" />
        {t('sale_branch_question')}
        <span className="text-rose-500" aria-hidden="true">
          *
        </span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {branches.map((branch, index) => {
          const on = branch.id === value
          return (
            <label
              key={branch.id}
              className={cn(
                'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full px-3.5 font-semibold ring-1 transition-colors',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-500',
                large ? 'h-11 text-sm' : 'h-10 text-[13px]',
                on
                  ? 'bg-teal-600 text-white ring-teal-600 dark:bg-teal-500 dark:ring-teal-500'
                  : error
                    ? 'bg-card text-fg-soft ring-rose-400 dark:ring-rose-500/60'
                    : 'bg-card text-fg-soft ring-line-strong hover:text-fg hover:ring-faint',
              )}
            >
              <input
                id={index === 0 ? SALE_BRANCH_ID : undefined}
                type="radio"
                name="sale-branch"
                value={branch.id}
                checked={on}
                onChange={() => onChange(branch.id)}
                className="sr-only"
              />
              {on && <IconCheck size={15} strokeWidth={3} className="shrink-0" />}
              {branch.name}
            </label>
          )
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-rose-600 dark:text-rose-400">
          <IconAlert size={14} className="shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** The sale's branch is known already: the seller's own (branch staff), or the only active one. */
export function SaleBranchNote({ name, className }: { name: string; className?: string }) {
  const { t } = useI18n()
  return (
    <p className={cn('flex items-center gap-1.5 text-[13px] font-medium text-teal-700 dark:text-teal-300', className)}>
      <IconStore size={15} className="shrink-0" />
      {t('sale_for_branch', { name })}
    </p>
  )
}

/**
 * The branch of a sale, as far as the seller has a say: chips while orders are dispatched, a note when it is known
 * (one active branch, or the seller's own), nothing without branches.
 */
export function SaleBranch({
  branches,
  ownBranch,
  value,
  onChange,
  error,
  large,
}: {
  /** The head office: `sales.branches` (the active ones). */
  branches: BranchRef[]
  /** Branch staff: their branch. */
  ownBranch: string | null
  value: number | null
  onChange: (value: number) => void
  error: string | null
  large?: boolean
}) {
  if (branches.length >= 2) {
    return <SaleBranchChoice branches={branches} value={value} onChange={onChange} error={error} large={large} />
  }
  const name = branches[0]?.name ?? ownBranch
  return name ? <SaleBranchNote name={name} /> : null
}
