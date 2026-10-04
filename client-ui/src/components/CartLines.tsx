import { useI18n } from '../i18n/i18n'
import { cn } from '../lib/cn'
import { haptic } from '../lib/telegram'
import { useCart, type CartLine } from '../state/cart'
import { useCatalog } from '../state/catalog'
import { useNav } from '../state/nav'
import { useToast } from '../state/toast'
import { Icon } from './Icon'
import { ProductImage } from './ProductImage'
import { Stepper } from './Stepper'

/** Lines of the cart with steppers (sheet on phones, side panel on desktop); a product that is not available
 * right now is greyed out and can only be taken out. */
export function CartLines({ lines }: { lines: CartLine[] }) {
  const { t, name, unit, money } = useI18n()
  const cart = useCart()
  const toast = useToast()
  const { openSheet } = useNav()
  return (
    <ul>
      {lines.map(({ product, qty, total }) => {
        const title = name(product)
        const unitName = unit(product)
        return (
          <li key={product.id} className="flex animate-[fade-in_0.2s_ease_both] items-center gap-3 border-t border-line py-3">
            <button
              type="button"
              onClick={() => openSheet({ type: 'product', id: product.id })}
              aria-label={title}
              className="size-[60px] shrink-0 overflow-hidden rounded-[14px]"
            >
              <ProductImage
                src={product.image}
                name={title}
                className={cn('size-full', product.frozen && '[&_img]:grayscale [&_img]:opacity-60')}
                letterClassName="text-xl"
              />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2.5">
                <span className={cn('truncate text-[14.5px] font-bold', product.frozen && 'text-muted')}>{title}</span>
                <span className={cn('tabular shrink-0 text-[14.5px] font-extrabold', product.frozen && 'text-muted line-through')}>
                  {money(total)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2.5">
                {product.frozen ? (
                  <span className="truncate text-[12.5px] font-bold text-red">{t('unavailableLine')}</span>
                ) : (
                  <span className="tabular truncate text-[12.5px] font-semibold text-muted">
                    {unitName ? t('perUnitPrice', { price: money(product.price), unit: unitName }) : money(product.price)}
                  </span>
                )}
                <Stepper
                  variant="soft"
                  value={qty}
                  name={title}
                  trashAtMin
                  onIncrement={() => {
                    if (product.frozen) {
                      haptic('warning')
                      toast(t('productUnavailable', { name: title }), { type: 'error' })
                      return
                    }
                    cart.increment(product.id)
                    haptic('light')
                  }}
                  onDecrement={() => {
                    cart.decrement(product.id)
                    haptic('select')
                  }}
                />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Minimum-order progress, the delivery time (in the cart) and the total. */
export function CartSummary({ showDelivery = false }: { showDelivery?: boolean }) {
  const { t, money } = useI18n()
  const { business } = useCatalog()
  const { total, minOrder, left } = useCart()
  const progress = minOrder > 0 ? Math.min(100, Math.round((total / minOrder) * 100)) : 100
  return (
    <div>
      {left > 0 && (
        <div className="mb-3 rounded-xl bg-amber-soft px-3 py-2.5 text-[13px] font-bold text-amber">
          <div className="flex items-start gap-2">
            <Icon name="info" className="mt-px size-4" />
            <span>{t('minOrderLeft', { min: money(minOrder), left: money(left) })}</span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--amber)_20%,transparent)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={minOrder}
            aria-valuenow={total}
            aria-label={t('minOrderChip', { amount: money(minOrder) })}
          >
            <div className="h-full rounded-full bg-amber transition-[width] duration-500 ease-smooth" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {showDelivery && business?.delivery_time ? (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[13.5px] font-semibold text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" className="size-[15px]" />
            {t('delivery')}
          </span>
          <span>{t('deliveryTime', { time: business.delivery_time })}</span>
        </div>
      ) : null}
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <span className="text-base font-extrabold">{t('total')}</span>
        <span className="tabular text-[22px] font-extrabold tracking-[-0.02em]" data-testid="cart-total">
          {money(total)}
        </span>
      </div>
    </div>
  )
}
