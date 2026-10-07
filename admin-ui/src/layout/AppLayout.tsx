import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router'
import { PageSkeleton } from '../components/ui/Skeleton'
import { useI18n } from '../i18n/context'
import { cn } from '../lib/cn'
import { STORAGE_KEYS, storage } from '../lib/storage'
import { checkForUpdate, reloadIfUpdated } from '../lib/updates'
import { SIDEBAR_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

/** What a route asks of the phone's layout (`handle` of a route in app/routes.tsx). */
export interface RouteHandle {
  /** `bare` — the page draws its own top and bottom bars (no menu, no padding); `own-bar` — the page has its own
   *  bottom bar in place of the menu. */
  phone?: 'bare' | 'own-bar'
}

export function AppLayout() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(() => storage.get(STORAGE_KEYS.sidebar) === 'collapsed')
  // A wide screen gets the side menu and the header; a phone or a tablet the bottom menu (BottomNav).
  const desktop = useMediaQuery(SIDEBAR_QUERY)
  const phone = useMatches().reduce<RouteHandle['phone']>(
    (mode, match) => (match.handle as RouteHandle | undefined)?.phone ?? mode,
    undefined,
  )
  const bare = !desktop && phone === 'bare'
  const menu = !desktop && !phone

  // A new version deployed meanwhile loads on the next move to another page (src/lib/updates.ts).
  const shown = useRef(pathname)
  useEffect(() => {
    if (shown.current === pathname) return
    shown.current = pathname
    if (!reloadIfUpdated()) void checkForUpdate()
  }, [pathname])

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      storage.set(STORAGE_KEYS.sidebar, value ? 'expanded' : 'collapsed')
      return !value
    })
  }

  return (
    <div
      className="min-h-dvh bg-app"
      style={{ '--sidebar-w': desktop ? (collapsed ? '76px' : '16rem') : '0px' } as CSSProperties}
    >
      <a
        href="#main"
        className="sr-only z-[80] rounded-xl bg-primary-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('skip_to_content')}
      </a>

      {desktop && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 border-r border-white/[0.04] transition-[width] duration-200 ease-out',
            collapsed ? 'w-[76px]' : 'w-64',
          )}
        >
          <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </aside>
      )}

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-200 ease-out',
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-64',
        )}
      >
        {desktop && <Header />}
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            'mx-auto w-full flex-1 outline-none',
            !bare && 'max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
            menu && 'pb-[calc(6rem+env(safe-area-inset-bottom))]',
          )}
          style={bare || desktop ? undefined : { paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
        >
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {menu && <BottomNav />}
    </div>
  )
}
