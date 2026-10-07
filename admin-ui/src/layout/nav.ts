import {
  IconClients,
  IconClock,
  IconDashboard,
  IconMic,
  IconOrders,
  IconProducts,
  IconScale,
  IconTag,
  IconTelegram,
  IconUsersCog,
  type IconComponent,
} from '../components/icons'
import type { DictKey } from '../i18n/dict'

export interface NavItem {
  to: string
  label: DictKey
  icon: IconComponent
  end?: boolean
  badge?: 'ai'
  /** Shows the number of orders waiting to be processed. */
  counter?: 'newOrders'
  adminOnly?: boolean
  iconClassName?: string
}

export interface NavGroup {
  label: DictKey
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'nav_group_main',
    items: [
      { to: '/', label: 'nav_dashboard', icon: IconDashboard, end: true },
      { to: '/sales', label: 'nav_sales', icon: IconMic, badge: 'ai' },
      { to: '/orders', label: 'nav_orders', icon: IconOrders, counter: 'newOrders' },
      { to: '/clients', label: 'nav_clients', icon: IconClients },
    ],
  },
  {
    label: 'nav_group_catalog',
    items: [
      { to: '/products', label: 'nav_products', icon: IconProducts },
      { to: '/categories', label: 'nav_categories', icon: IconTag },
      { to: '/units', label: 'nav_units', icon: IconScale },
    ],
  },
  {
    label: 'nav_group_settings',
    items: [
      { to: '/hours', label: 'nav_hours', icon: IconClock },
      { to: '/telegram', label: 'nav_telegram', icon: IconTelegram, iconClassName: '-rotate-12' },
      { to: '/users', label: 'nav_users', icon: IconUsersCog, adminOnly: true },
    ],
  },
]

/** Pages of the phone's bottom menu; the side menu's other pages are under its «Yana» (/more). */
export const TAB_PATHS = ['/', '/sales', '/orders', '/products']

/** The side menu's pages that are not in the phone's bottom menu. */
export const MORE_PATHS = NAV.flatMap((group) => group.items.map((item) => item.to)).filter((to) => !TAB_PATHS.includes(to))

/** `path` is `section` or a page inside it (`/orders/12` is in `/orders`). */
export function isIn(path: string, section: string): boolean {
  return section === '/' ? path === '/' : path === section || path.startsWith(`${section}/`)
}
