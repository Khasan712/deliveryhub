import { cx } from '../../lib/cx'
import { Spinner } from './Spinner'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  /** The element that names the switch (its visible label). */
  labelledBy?: string
  describedBy?: string
  disabled?: boolean
  /** A spinner in the knob while the change is being saved (clicks are blocked meanwhile). */
  loading?: boolean
  className?: string
}

/** An on/off switch: a button with role="switch" (click, Space or Enter flips it). */
export function Switch({ checked, onChange, id, labelledBy, describedBy, disabled, loading = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
        'disabled:pointer-events-none disabled:opacity-60',
        checked ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300 hover:bg-slate-400/80',
        className,
      )}
    >
      <span
        className={cx(
          'grid size-6 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgb(15_23_42/0.25)] transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      >
        {loading && <Spinner size={13} className="text-slate-400" />}
      </span>
    </button>
  )
}
