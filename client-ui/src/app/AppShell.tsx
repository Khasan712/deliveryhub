import { useEffect, useMemo, useRef, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import { isApiError } from '../api/client'
import { CartBar } from '../components/CartBar'
import { Header, PAGE_WIDTH } from '../components/Header'
import { TabBar } from '../components/TabBar'
import { Toaster } from '../components/Toaster'
import { useI18n } from '../i18n/i18n'
import { cn } from '../lib/cn'
import { checkForUpdate, reloadIfUpdated } from '../lib/updates'
import { useScrollRestoration } from '../lib/useScrollRestoration'
import { useBackButton } from '../lib/useTelegram'
import { useCatalog } from '../state/catalog'
import { useNav } from '../state/nav'
import { useTabBar } from '../state/phoneNav'
import { SearchContext } from '../state/search'
import { CheckoutScreen } from '../screens/checkout/CheckoutScreen'
import { MenuScreen } from '../screens/menu/MenuScreen'
import { OrderScreen } from '../screens/orders/OrderScreen'
import { OrdersScreen } from '../screens/orders/OrdersScreen'
import { ProfileScreen } from '../screens/profile/ProfileScreen'
import { AuthSheet } from '../screens/sheets/AuthSheet'
import { CartSheet } from '../screens/sheets/CartSheet'
import { HoursSheet } from '../screens/sheets/HoursSheet'
import { ProductSheet } from '../screens/sheets/ProductSheet'
import { NotFoundScreen, ShopUnavailable } from '../screens/StatusScreens'

export function AppShell() {
  const { t } = useI18n()
  const catalog = useCatalog()
  const location = useLocation()
  const nav = useNav()
  const [query, setQuery] = useState('')
  const search = useMemo(() => ({ query, setQuery }), [query])
  const tabBar = useTabBar()
  useScrollRestoration()
  usePickUpUpdates(location.pathname)
  // Telegram: the native back button closes sheets and leaves screens (browser history does the same on the web).
  useBackButton(location.pathname !== '/' || nav.sheet !== null, nav.back)

  const { error } = catalog
  if (catalog.status === 'error' && isApiError(error) && (error.status === 503 || error.status === 404)) {
    return <ShopUnavailable error={error} onRetry={catalog.refetch} />
  }

  return (
    <SearchContext value={search}>
      <a
        href="#main"
        className="sr-only z-[200] rounded-xl bg-ink px-4 py-2 font-bold text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('skipToContent')}
      </a>
      <Header />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'mx-auto w-full px-4 outline-none md:px-6',
          PAGE_WIDTH,
          // The phone's menu bar covers the bottom of the page: the page goes on below it.
          tabBar && 'pb-[calc(var(--tabbar-h)+var(--safe-bottom))]',
        )}
      >
        <div key={location.pathname} className="animate-[fade-in_0.24s_ease_both]">
          <Routes location={location}>
            <Route path="/" element={<MenuScreen />} />
            <Route path="/checkout" element={<CheckoutScreen />} />
            <Route path="/orders" element={<OrdersScreen />} />
            <Route path="/orders/:id" element={<OrderScreen />} />
            <Route path="/profile" element={<ProfileScreen />} />
            <Route path="*" element={<NotFoundScreen />} />
          </Routes>
        </div>
      </main>
      <CartBar />
      <TabBar />
      <ProductSheet />
      <CartSheet />
      <AuthSheet />
      <HoursSheet />
      <Toaster />
    </SearchContext>
  )
}

/** A new version deployed meanwhile loads on the next move to another page (src/lib/updates.ts). */
function usePickUpUpdates(pathname: string) {
  const shown = useRef(pathname)
  useEffect(() => {
    if (shown.current === pathname) return
    shown.current = pathname
    if (!reloadIfUpdated()) void checkForUpdate()
  }, [pathname])
}
