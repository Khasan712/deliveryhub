import { useCallback, useSyncExternalStore } from 'react'

/** From here up popular dishes are a grid of cards (below: a swipeable row). */
export const DESKTOP_QUERY = '(min-width: 768px)'
/** From here up the menu search sits in the header (below: above the banner). */
export const HEADER_SEARCH_QUERY = '(min-width: 1024px)'
/** From here up the categories are a rail on the left of the menu (below: chips above it). */
export const WIDE_QUERY = '(min-width: 1360px)'

/** Whether a media query matches, following changes (false where `matchMedia` is missing). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia?.(query)
      media?.addEventListener?.('change', onChange)
      return () => media?.removeEventListener?.('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => Boolean(window.matchMedia?.(query).matches), () => false)
}

