import { useI18n } from '../i18n/i18n'
import { cn } from '../lib/cn'
import { Icon } from './Icon'

interface StepperProps {
  value: number
  /** Product name — part of the accessible label of the group. */
  name: string
  onIncrement: () => void
  onDecrement: () => void
  variant?: 'pill' | 'soft' | 'large'
  min?: number
  max?: number
  /** Show a bin instead of "−" when the next step removes the item. */
  trashAtMin?: boolean
  className?: string
}

const HOVER = 'hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)]'

const STYLES = {
  /** On a product card: takes the place of the round "+" button, its own "+" exactly where that one was. */
  pill: {
    root: 'h-11 rounded-full bg-brand text-brand-ink shadow-brand',
    minus: cn('h-11 w-9 rounded-full', HOVER),
    plus: cn('size-11 rounded-full', HOVER),
    value: 'min-w-5 text-[15px]',
    minusIcon: 'size-[18px]',
    plusIcon: 'size-5',
  },
  /** A cart line. */
  soft: {
    root: 'h-11 rounded-full bg-surface-2',
    minus: 'h-11 w-10 rounded-full text-ink-2 hover:text-ink',
    plus: 'h-11 w-10 rounded-full text-ink-2 hover:text-ink',
    value: 'min-w-[18px] text-[14.5px]',
    minusIcon: 'size-4',
    plusIcon: 'size-4',
  },
  /** The product sheet. */
  large: {
    root: 'h-[52px] rounded-2xl bg-surface-2 px-1',
    minus: 'h-11 w-[42px] rounded-xl hover:bg-surface-3',
    plus: 'h-11 w-[42px] rounded-xl hover:bg-surface-3',
    value: 'min-w-7 text-[17px]',
    minusIcon: 'size-5',
    plusIcon: 'size-5',
  },
} as const

const BUTTON = 'grid place-items-center transition-[background-color,transform] active:scale-90 disabled:opacity-40'

export function Stepper({
  value,
  name,
  onIncrement,
  onDecrement,
  variant = 'pill',
  min = 0,
  max = 99,
  trashAtMin = false,
  className,
}: StepperProps) {
  const { t } = useI18n()
  const style = STYLES[variant]
  const removes = trashAtMin && value - 1 <= min
  return (
    <div
      role="group"
      aria-label={t('quantityOf', { name })}
      className={cn('flex shrink-0 items-center justify-between font-extrabold select-none', style.root, className)}
    >
      <button
        type="button"
        className={cn(BUTTON, style.minus)}
        onClick={onDecrement}
        disabled={value <= min}
        aria-label={removes ? t('removeFromCart') : t('decrease')}
      >
        <Icon name={removes ? 'trash' : 'minus'} className={style.minusIcon} />
      </button>
      <output aria-live="polite" className={cn('tabular text-center', style.value)}>
        <span key={value} className="inline-block animate-[rise-in_0.22s_ease_both]">
          {value}
        </span>
      </output>
      <button
        type="button"
        className={cn(BUTTON, style.plus)}
        onClick={onIncrement}
        disabled={value >= max}
        aria-label={t('increase')}
      >
        <Icon name="plus" className={style.plusIcon} />
      </button>
    </div>
  )
}
