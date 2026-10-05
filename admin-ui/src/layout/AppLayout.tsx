import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation } from 'react-router'
import { PageSkeleton } from '../components/ui/Skeleton'
import { useI18n } from '../i18n/context'
import { cn } from '../lib/cn'
import { STORAGE_KEYS, storage } from '../lib/storage'
import { checkForUpdate, reloadIfUpdated } from '../lib/updates'
import { SIDEBAR_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(() => storage.get(STORAGE_KEYS.sidebar) === 'collapsed')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerPath, setDrawerPath] = useState(pathname)
  const desktop = useMediaQuery(SIDEBAR_QUERY)
  const drawerRef = useRef<HTMLDialogElement>(null)

  // Navigation closes the mobile drawer (state adjusted during render, no effect needed).
  if (drawerPath !== pathname) {
    setDrawerPath(pathname)
    if (drawerOpen) setDrawerOpen(false)
  }

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

  const showDrawer = drawerOpen && !desktop

  useEffect(() => {
    if (!showDrawer) return
    const opener = document.activeElement as HTMLElement | null
    drawerRef.current?.querySelector<HTMLElement>('a[aria-current="page"], a, button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      opener?.focus({ preventScroll: true })
    }
  }, [showDrawer])

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

      {showDrawer && (
        <dialog
          open
          ref={drawerRef}
          aria-modal="true"
          aria-label={t('app_admin_panel')}
          className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0"
        >
          <div
            className="absolute inset-0 animate-fade-in bg-slate-950/60 backdrop-blur-[2px]"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] animate-slide-in-left shadow-2xl">
            <Sidebar collapsed={false} onClose={() => setDrawerOpen(false)} />
          </div>
        </dialog>
      )}

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-200 ease-out',
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-64',
        )}
      >
        <Header onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
