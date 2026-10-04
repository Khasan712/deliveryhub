import { Button } from '../../components/Button'
import { CartLines, CartSummary } from '../../components/CartLines'
import { CheckoutNotice } from '../../components/CheckoutNotice'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { useI18n } from '../../i18n/i18n'
import { statusLabel } from '../../lib/hours'
import { useCart } from '../../state/cart'
import { useCheckoutBlock, useClearCart, useStartCheckout } from '../../state/hooks'

/** The cart next to the menu on wide screens: always open, the total and "Checkout" at the bottom. */
export function CartPanel() {
  const { t } = useI18n()
  const { lines, count } = useCart()
  const clear = useClearCart()
  const startCheckout = useStartCheckout()
  const block = useCheckoutBlock()

  return (
    <section
      aria-label={t('cart')}
      className="flex max-h-[calc(100dvh-var(--header-h)-var(--safe-top)-48px)] flex-col overflow-hidden rounded-[24px] border border-line bg-surface shadow-card"
    >
      <div className="flex items-center justify-between gap-3 pt-[18px] pr-3.5 pb-2.5 pl-5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">{t('cart')}</h2>
          {count > 0 && (
            <span className="tabular grid h-[26px] min-w-[26px] place-items-center rounded-full bg-brand-soft px-2 text-[13px] font-extrabold text-brand-text">
              <span className="sr-only">{t('itemsCount', { count })}</span>
              <span aria-hidden="true">{count}</span>
            </span>
          )}
        </div>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Icon name="trash" className="size-4" />
            {t('clear')}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {lines.length ? (
          <CartLines lines={lines} />
        ) : (
          <EmptyState icon="bag" title={t('cartEmpty')} text={t('cartEmptyText')} className="py-10" />
        )}
      </div>
      {lines.length > 0 && (
        <div className="border-t border-line px-5 pt-4 pb-5">
          <CheckoutNotice className="mb-3" />
          <CartSummary showDelivery />
          <Button block iconRight={block ? undefined : 'arrow-right'} disabled={block !== null} onClick={startCheckout}>
            {block?.reason === 'closed' ? statusLabel(block.status, t) : t('checkout')}
          </Button>
        </div>
      )}
    </section>
  )
}
