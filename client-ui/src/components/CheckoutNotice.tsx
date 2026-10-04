import { useI18n } from '../i18n/i18n'
import { cn } from '../lib/cn'
import { closedNotice } from '../lib/hours'
import { haptic } from '../lib/telegram'
import { useCart } from '../state/cart'
import { useOpenStatus } from '../state/hooks'
import { Icon } from './Icon'

/** Why the cart cannot be ordered right now: the business is closed, or some products are not available. */
export function CheckoutNotice({ className }: { className?: string }) {
  const { t, name } = useI18n()
  const status = useOpenStatus()
  const cart = useCart()
  const closed = status !== null && !status.open
  if (!closed && !cart.unavailable.length) return null

  return (
    <div className={cn('space-y-2', className)}>
      {closed && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-soft px-3 py-2.5 text-[13px] font-bold text-amber">
          <Icon name="clock" className="mt-px size-4 shrink-0" />
          {closedNotice(status, t)}
        </p>
      )}
      {cart.unavailable.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-soft py-2 pr-2 pl-3 text-[13px] font-bold text-red">
          <Icon name="ban" className="mt-[3px] size-4 shrink-0" />
          <span className="min-w-0 flex-1 py-0.5">
            {t('unavailableInCart', { names: cart.unavailable.map((line) => `«${name(line.product)}»`).join(', ') })}
          </span>
          <button
            type="button"
            onClick={() => {
              cart.removeUnavailable()
              haptic('select')
            }}
            className="h-8 shrink-0 rounded-full bg-surface px-3 text-[12.5px] font-extrabold text-red shadow-sm"
          >
            {t('removeUnavailable')}
          </button>
        </div>
      )}
    </div>
  )
}
