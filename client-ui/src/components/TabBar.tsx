import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useI18n } from '../i18n/i18n'
import { cn } from '../lib/cn'
import { useAuth } from '../state/auth'
import { useCart } from '../state/cart'
import { useNav } from '../state/nav'
import { useTabBar } from '../state/phoneNav'
import { isActiveOrder, useOrders } from '../state/orders'
import { Icon, type IconName } from './Icon'

const TAB = 'flex h-full w-full flex-col items-center justify-center gap-[3px] text-[11px] leading-none transition-colors'

function TabIcon({ name, children }: { name: IconName; children?: ReactNode }) {
  return (
    <span className="relative">
      <Icon name={name} className="size-[23px]" />
      {children}
    </span>
  )
}

/** Menyu · Savat (with the count) · Buyurtmalarim (a dot while an order is on its way) · Profil. */
export function TabBar() {
  const { t, money } = useI18n()
  const { pathname } = useLocation()
  const { token } = useAuth()
  const cart = useCart()
  const { sheet, openSheet } = useNav()
  const orders = useOrders()
  const shown = useTabBar()
  if (!shown) return null

  const live = Boolean(token) && Boolean(orders.data?.some(isActiveOrder))
  const tone = (active: boolean) => (active ? 'font-extrabold text-brand-text' : 'font-bold text-muted hover:text-ink-2')
  const link = (to: string, active: boolean, icon: IconName, label: string, extra?: ReactNode) => (
    <li>
      <Link to={to} aria-current={active ? 'page' : undefined} className={cn(TAB, tone(active))}>
        <TabIcon name={icon}>{extra}</TabIcon>
        <span className="max-w-full truncate px-1">{label}</span>
      </Link>
    </li>
  )
  const cartOpen = sheet?.type === 'cart'

  return (
    <nav
      aria-label={t('mainNavigation')}
      className="fixed inset-x-0 bottom-0 z-[44] border-t border-line bg-surface pb-[var(--safe-bottom)] shadow-[0_-6px_18px_-12px_rgb(22_22_26/0.25)]"
    >
      <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-[560px] grid-cols-4">
        {link('/', pathname === '/' && !cartOpen, 'utensils', t('menu'))}
        <li>
          <button
            key={cart.pulse}
            type="button"
            onClick={() => openSheet({ type: 'cart' })}
            aria-label={cart.count ? `${t('openCart')}: ${t('itemsCount', { count: cart.count })}, ${money(cart.total)}` : t('openCart')}
            className={cn(TAB, tone(cartOpen), cart.pulse > 0 && 'animate-bump')}
          >
            <TabIcon name="bag">
              {cart.count > 0 && (
                <b className="tabular absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-surface bg-brand px-[3px] text-[10px] font-extrabold text-brand-ink">
                  {cart.count > 99 ? '99+' : cart.count}
                </b>
              )}
            </TabIcon>
            <span>{t('cart')}</span>
          </button>
        </li>
        {link(
          '/orders',
          pathname.startsWith('/orders') && !cartOpen,
          'receipt',
          t('orders'),
          live && <span aria-hidden="true" className="live-dot absolute -top-0.5 -right-1 size-2.5 rounded-full bg-amber ring-2 ring-surface" />,
        )}
        {link('/profile', pathname === '/profile' && !cartOpen, 'user', t('profile'))}
      </ul>
    </nav>
  )
}
