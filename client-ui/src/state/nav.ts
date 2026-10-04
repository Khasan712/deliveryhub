import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * Sheets (product, cart, sign-in, the checkout's map) are history entries: they live in `location.state`, so the
 * browser / phone back button and Telegram's BackButton close them, exactly like they leave a screen.
 */
export type Sheet =
  | { type: 'product'; id: number }
  | { type: 'cart' }
  | { type: 'auth'; next?: string }
  /** The checkout's map (the checkout renders it). */
  | { type: 'map' }
  /** The week of working hours. */
  | { type: 'hours' }

export interface NavState {
  sheet?: Sheet
  /** The sheet entry was pushed on top of the same page, so closing it is a step back in history. */
  stacked?: boolean
  /** The order page right after checkout (celebration). */
  placed?: boolean
}

function asNavState(value: unknown): NavState {
  return value && typeof value === 'object' ? (value as NavState) : {}
}

export function useNavState(): NavState {
  return asNavState(useLocation().state)
}

export function parentPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  return parts.length <= 1 ? '/' : `/${parts.slice(0, -1).join('/')}`
}

export interface Nav {
  sheet: Sheet | null
  /** There is an entry of this app to go back to (the first page of a visit has none). */
  canGoBack: boolean
  openSheet: (sheet: Sheet, options?: { replace?: boolean }) => void
  closeSheet: () => void
  /** Closes the sheet, or leaves the screen (history back, or the parent screen on a fresh visit). */
  back: () => void
  go: (to: string, options?: { replace?: boolean; state?: NavState }) => void
}

export function useNav(): Nav {
  const navigate = useNavigate()
  const location = useLocation()
  const state = asNavState(location.state)
  const canGoBack = location.key !== 'default'
  const here = useMemo(() => ({ pathname: location.pathname, search: location.search }), [location.pathname, location.search])

  const openSheet = useCallback<Nav['openSheet']>(
    (sheet, options = {}) => {
      if (options.replace) navigate(here, { replace: true, state: { sheet, stacked: state.stacked ?? false } })
      else navigate(here, { state: { sheet, stacked: true } })
    },
    [navigate, here, state.stacked],
  )

  const closeSheet = useCallback(() => {
    if (!state.sheet) return
    if (state.stacked && canGoBack) navigate(-1)
    else navigate(here, { replace: true, state: {} })
  }, [navigate, here, state.sheet, state.stacked, canGoBack])

  const back = useCallback(() => {
    if (state.sheet) closeSheet()
    else if (location.pathname === '/') return
    else if (canGoBack) navigate(-1)
    else navigate(parentPath(location.pathname), { replace: true })
  }, [state.sheet, closeSheet, location.pathname, canGoBack, navigate])

  const go = useCallback<Nav['go']>(
    (to, options = {}) => navigate(to, { replace: options.replace, state: options.state ?? {} }),
    [navigate],
  )

  return { sheet: state.sheet ?? null, canGoBack, openSheet, closeSheet, back, go }
}
