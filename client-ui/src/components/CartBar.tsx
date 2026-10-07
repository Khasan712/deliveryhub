import { useLocation } from 'react-router'
import { useI18n } from '../i18n/i18n'
import { cn } from '../lib/cn'
import { statusLabel } from '../lib/hours'
import { usePresence } from '../lib/motion'
import { isTelegram } from '../lib/telegram'
import { minOrderLeft, useCart } from '../state/cart'
import { useCheckoutBlock, useStartCheckout } from '../state/hooks'
import { useNav } from '../state/nav'
import { useTabBar } from '../state/phoneNav'
import { Icon } from './Icon'

const BAR =
  'fixed inset-x-3 z-[45] mx-auto flex h-[60px] max-w-[520px] items-center gap-3 rounded-[19px] pr-[18px] pl-2.5 font-extrabold transition-transform active:scale-[0.985] lg:hidden'

/**
 * The floating bar of the menu. On a phone, above its menu bar (in Telegram too), it is the next step:
 * «Rasmiylashtirish» straight to the checkout — or, dark, what stands in the way (the minimum order, the hours),
 * which opens the cart. A tablet, without that menu bar, opens the cart; a wide Telegram window uses its MainButton.
 */
export function CartBar() {
  const { t, money } = useI18n()
  const cart = useCart()
  const { sheet, openSheet } = useNav()
  const { pathname } = useLocation()
  const tabBar = useTabBar()
  const block = useCheckoutBlock()
  const startCheckout = useStartCheckout()
  // Telegram without the phone's menu bar (a wide window) keeps the cart in its MainButton (MenuScreen).
  const visible = pathname === '/' && cart.count > 0 && sheet === null && (tabBar || !isTelegram())
  const { mounted, closing } = usePresence(visible, 240)
  if (!mounted) return null

  const motion = closing
    ? 'animate-[cartbar-out_0.24s_ease-in_both]'
    : 'animate-[cartbar-in_0.42s_cubic-bezier(0.2,0.8,0.2,1)_both]'
  const count = (
    <span
      key={cart.pulse}
      className="tabular grid h-[42px] min-w-[42px] shrink-0 animate-bump place-items-center rounded-[13px] bg-[color-mix(in_srgb,currentColor_18%,transparent)] px-2 text-base"
    >
      {cart.count}
    </span>
  )

  if (!tabBar) {
    return (
      <button
        type="button"
        onClick={() => openSheet({ type: 'cart' })}
        aria-label={`${t('openCart')}: ${t('itemsCount', { count: cart.count })}, ${money(cart.total)}`}
        className={cn(
          BAR,
          'bottom-[calc(12px+var(--safe-bottom))] bg-brand text-brand-ink shadow-[0_14px_34px_color-mix(in_srgb,var(--brand)_45%,transparent)]',
          motion,
        )}
      >
        <span
          key={cart.pulse}
          className="relative grid size-[42px] animate-bump place-items-center rounded-[13px] bg-[color-mix(in_srgb,var(--brand-ink)_20%,transparent)]"
        >
          <Icon name="bag" />
          <b className="tabular absolute -top-[5px] -right-1.5 grid h-[21px] min-w-[21px] place-items-center rounded-full bg-brand-ink px-[5px] text-[11.5px] text-brand">
            {cart.count}
          </b>
        </span>
        <span>{t('cart')}</span>
        <span className="tabular ml-auto flex items-center gap-1.5 text-base">
          {money(cart.total)}
          <Icon name="arrow-right" className="size-4" />
        </span>
      </button>
    )
  }

  const above = 'bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+10px)]'
  if (block) {
    const left = minOrderLeft(cart.total, cart.minOrder)
    const text =
      block.reason === 'closed'
        ? statusLabel(block.status, t)
        : block.reason === 'minimum'
          ? t('addMore', { amount: money(left) })
          : t('cart')
    return (
      <button
        type="button"
        onClick={() => openSheet({ type: 'cart' })}
        className={cn(BAR, above, 'overflow-hidden bg-ink text-bg shadow-lg', motion)}
      >
        {count}
        <span className="min-w-0 flex-1 truncate text-left text-[15px]">{text}</span>
        {/* The sum is said by the words (the minimum, the hours) or worth repeating only for the cart. */}
        {block.reason === 'unavailable' && <span className="tabular shrink-0 text-base">{money(cart.total)}</span>}
        {block.reason === 'minimum' && (
          // How far the cart is to the minimum order.
          <span aria-hidden="true" className="absolute inset-x-4 bottom-[7px] h-[3px] overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--bg)_22%,transparent)]">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (cart.total / cart.minOrder) * 100)}%` }} />
          </span>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={startCheckout}
      aria-label={`${t('checkout')}: ${t('itemsCount', { count: cart.count })}, ${money(cart.total)}`}
      className={cn(BAR, above, 'bg-brand text-brand-ink shadow-[0_14px_34px_color-mix(in_srgb,var(--brand)_45%,transparent)]', motion)}
    >
      {count}
      <span>{t('checkout')}</span>
      <span className="tabular ml-auto flex items-center gap-1.5 text-base">
        {money(cart.total)}
        <Icon name="arrow-right" className="size-4" />
      </span>
    </button>
  )
}
