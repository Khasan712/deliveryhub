import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useNewOrdersCount } from '../api/queries'
import { IconGrid, IconHome, IconOrders, IconPlus, IconProducts, type IconComponent } from '../components/icons'
import { useI18n } from '../i18n/context'
import type { DictKey } from '../i18n/dict'
import { cn } from '../lib/cn'
import { useToastOffset } from '../lib/useToastOffset'
import { isIn, MORE_PATHS } from './nav'

interface Tab {
  to: string
  label: DictKey
  icon: IconComponent
  sections: string[]
}

const TABS: Record<'home' | 'orders' | 'products' | 'more', Tab> = {
  home: { to: '/', label: 'nav_home', icon: IconHome, sections: ['/'] },
  orders: { to: '/orders', label: 'nav_orders', icon: IconOrders, sections: ['/orders'] },
  products: { to: '/products', label: 'nav_products', icon: IconProducts, sections: ['/products'] },
  more: { to: '/more', label: 'nav_more', icon: IconGrid, sections: ['/more', ...MORE_PATHS] },
}

/**
 * The phone's main menu, at the bottom where a thumb reaches it: the home page, the orders (with the number of new
 * ones), a big «+» for a new sale in the middle, the products, and «Yana» with everything else.
 */
export function BottomNav() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const newOrders = useNewOrdersCount(true).data ?? 0
  useToastOffset('calc(4.75rem + env(safe-area-inset-bottom))')

  const tab = (item: Tab, badge?: ReactNode) => {
    const Icon = item.icon
    const active = item.sections.some((section) => isIn(pathname, section))
    return (
      <li>
        <Link
          to={item.to}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex h-full flex-col items-center justify-center gap-1 text-[11px] transition-colors',
            active ? 'font-bold text-primary-700 dark:text-primary-300' : 'font-medium text-muted hover:text-fg',
          )}
        >
          <span className="relative">
            <Icon size={24} />
            {badge}
          </span>
          <span className="max-w-full truncate px-1">{t(item.label)}</span>
        </Link>
      </li>
    )
  }

  return (
    <nav
      aria-label={t('main_menu')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card shadow-[0_-4px_16px_-8px_rgb(15_23_42/0.12)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {tab(TABS.home)}
        {tab(
          TABS.orders,
          newOrders > 0 && (
            <span className="absolute -right-3 -top-1.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-card tabular">
              <span aria-hidden="true">{newOrders > 99 ? '99+' : newOrders}</span>
              <span className="sr-only">{t('new_orders_badge', { count: newOrders })}</span>
            </span>
          ),
        )}
        <li className="flex justify-center">
          <Link to="/sales" className="-mt-5 flex flex-col items-center gap-1 text-[11px] font-bold text-fg">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/40 ring-[5px] ring-card transition-transform active:scale-95">
              <IconPlus size={28} strokeWidth={2.6} />
            </span>
            {t('nav_sales')}
          </Link>
        </li>
        {tab(TABS.products)}
        {tab(TABS.more)}
      </ul>
    </nav>
  )
}
