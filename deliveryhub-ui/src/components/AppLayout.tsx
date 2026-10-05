import { useEffect, useRef } from 'react'
import { Link, Outlet, useLocation, useNavigate, useNavigation } from 'react-router'
import { preloadPages } from '../pages/lazy'
import { useLogout, useMe } from '../api/queries'
import { cx } from '../lib/cx'
import { errorMessage } from '../lib/errors'
import { initialOf } from '../lib/format'
import { formatPhone } from '../lib/phone'
import { BrandMark } from './BrandMark'
import { BuildingIcon, LogoutIcon, PhoneIcon, PlusIcon } from './icons'
import { buttonClass } from './ui/styles'
import { Spinner } from './ui/Spinner'
import { useToast } from './ui/toast'

/** Soft indigo/violet light behind the top of every page. */
export function Glow() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
      <div className="absolute -top-64 left-1/2 h-[560px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(99_102_241/0.13),transparent)]" />
      <div className="absolute -top-40 -right-40 h-[420px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.11),transparent)]" />
    </div>
  )
}

/**
 * After moving to another page, focus its heading so screen readers announce it (not on the first load).
 * A page that is still loading gets the focus on <main>, then on its heading as soon as it appears.
 */
function useFocusOnNavigation(pathname: string) {
  const main = useRef<HTMLElement>(null)
  const shown = useRef(pathname)
  useEffect(() => {
    const root = main.current
    if (shown.current === pathname || !root) return undefined
    shown.current = pathname

    const focusHeading = () => {
      const heading = root.querySelector('h1')
      if (!heading) return false
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
      return true
    }
    if (focusHeading()) return undefined

    root.focus({ preventScroll: true })
    const observer = new MutationObserver(() => {
      // Stop when the user has moved on, or once the heading has the focus.
      if (document.activeElement !== root || focusHeading()) observer.disconnect()
    })
    observer.observe(root, { childList: true, subtree: true })
    const timer = setTimeout(() => observer.disconnect(), 5000)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [pathname])
  return main
}

const NAV = [
  { to: '/', label: 'Bizneslar', icon: BuildingIcon },
  { to: '/mobile', label: 'Mobil ilova', icon: PhoneIcon },
]

export function AppLayout() {
  const { data: user } = useMe()
  const logout = useLogout()
  const toast = useToast()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const mainRef = useFocusOnNavigation(pathname)
  const navigating = useNavigation().state !== 'idle'

  useEffect(() => {
    if (typeof window.requestIdleCallback !== 'function') {
      const timer = setTimeout(preloadPages, 1500)
      return () => clearTimeout(timer)
    }
    const id = window.requestIdleCallback(preloadPages, { timeout: 3000 })
    return () => window.cancelIdleCallback(id)
  }, [])

  return (
    <div className="relative isolate min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2.5 focus:font-bold focus:shadow-pop"
      >
        Asosiy qismga o'tish
      </a>
      <Glow />
      {navigating && (
        // A page's code is still loading (rare: pages are preloaded) — a thin bar, decorative only.
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-indigo-100">
          <div className="h-full w-1/3 animate-progress rounded-full bg-linear-to-r from-indigo-500 to-violet-500" />
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 rounded-xl">
            <BrandMark />
            <span className="font-extrabold tracking-tight">
              DeliveryHub <span className="font-semibold text-slate-400 max-sm:sr-only">platforma</span>
            </span>
          </Link>
          <nav aria-label="Asosiy menyu" className="flex items-center gap-1 sm:ml-3">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                aria-current={pathname === to ? 'page' : undefined}
                className={cx(
                  'flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition sm:px-3',
                  pathname === to
                    ? 'bg-slate-100/80 text-slate-900 hover:bg-slate-200/70'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900',
                )}
              >
                <Icon size={17} className="sm:hidden" />
                <span className="max-sm:sr-only">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              to="/new"
              aria-current={pathname === '/new' ? 'page' : undefined}
              className={cx(buttonClass(), 'max-sm:w-10 max-sm:px-0')}
            >
              <PlusIcon size={18} strokeWidth={2.5} />
              <span className="sr-only sm:not-sr-only">Yangi biznes</span>
            </Link>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3">
              {user && (
                <div className="hidden items-center gap-2.5 md:flex">
                  <span
                    aria-hidden="true"
                    className="grid size-8 place-items-center rounded-full bg-slate-900 text-xs font-extrabold text-white"
                  >
                    {initialOf(user.first_name || user.phone_number)}
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-bold text-slate-800">{user.first_name || 'Xodim'}</p>
                    <p className="text-xs text-slate-500">{formatPhone(user.phone_number)}</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                title="Chiqish"
                aria-label="Chiqish"
                disabled={logout.isPending}
                onClick={() =>
                  logout.mutate(undefined, {
                    // The login page forgets the session once it is shown (no return path after a logout).
                    onSuccess: () => void navigate('/login', { replace: true, state: { loggedOut: true } }),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
                className="grid size-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
              >
                {logout.isPending ? <Spinner size={18} /> : <LogoutIcon size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>
      <main ref={mainRef} id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 pt-6 pb-20 focus:outline-hidden sm:px-6 sm:pt-8">
        <Outlet />
      </main>
    </div>
  )
}
