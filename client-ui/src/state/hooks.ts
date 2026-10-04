import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { getMe, updateMe } from '../api/shop'
import type { Lang } from '../api/types'
import { useI18n } from '../i18n/i18n'
import { clockTick, openStatus, subscribeClock, tickTime, type OpenStatus } from '../lib/hours'
import { haptic } from '../lib/telegram'
import { useAuth } from './auth'
import { useCart, type CartLine } from './cart'
import { useCatalog } from './catalog'
import { useNav } from './nav'
import { useToast } from './toast'

/** Switches the UI language and remembers it on the account (PATCH /me) when signed in. */
export function useChangeLanguage() {
  const { setLang } = useI18n()
  const { token, setClient } = useAuth()
  return useCallback(
    (lang: Lang) => {
      setLang(lang)
      haptic('select')
      if (token) {
        updateMe(token, { lang })
          .then(({ client }) => setClient(client))
          .catch(() => {
            /* the language is still saved on this device */
          })
      }
    },
    [setLang, token, setClient],
  )
}

/** Open or closed right now, worked out again every half minute; null when the business has no working hours. */
export function useOpenStatus(): OpenStatus | null {
  const { business } = useCatalog()
  const tick = useSyncExternalStore(subscribeClock, clockTick, clockTick)
  return useMemo(() => openStatus(business?.working_hours, tickTime(tick)), [business?.working_hours, tick])
}

export type CheckoutBlock =
  | { reason: 'closed'; status: OpenStatus }
  | { reason: 'unavailable'; lines: CartLine[] }
  | { reason: 'minimum' }
  | null

/** Why the cart cannot be ordered right now (null: it can) — the business is closed, some products are not
 * available, or the total is below the minimum order. */
export function useCheckoutBlock(): CheckoutBlock {
  const status = useOpenStatus()
  const { unavailable, belowMinimum } = useCart()
  if (status && !status.open) return { reason: 'closed', status }
  if (unavailable.length) return { reason: 'unavailable', lines: unavailable }
  if (belowMinimum) return { reason: 'minimum' }
  return null
}

/** "Checkout" from the cart: needs a signed-in customer and a cart that can be ordered now. */
export function useStartCheckout() {
  const { token, status } = useAuth()
  const { count } = useCart()
  const blocked = useCheckoutBlock() !== null
  const { go, openSheet, sheet } = useNav()
  return useCallback(() => {
    if (!count || blocked) {
      haptic('error')
      return
    }
    const fromSheet = sheet !== null
    if (!token && status === 'ready') openSheet({ type: 'auth', next: '/checkout' }, { replace: fromSheet })
    else go('/checkout', { replace: fromSheet })
  }, [count, blocked, token, status, go, openSheet, sheet])
}

/** Empties the cart with an "undo" toast. */
export function useClearCart() {
  const { t } = useI18n()
  const cart = useCart()
  const toast = useToast()
  return useCallback(() => {
    const previous = cart.clear()
    haptic('medium')
    toast(t('cartCleared'), { action: { label: t('undo'), onClick: () => cart.replace(previous) } })
  }, [cart, t, toast])
}

/** `<title>`: "Screen · Business". */
export function useDocumentTitle(title?: string) {
  const { business } = useCatalog()
  useEffect(() => {
    const name = business?.name
    document.title = [title, name].filter(Boolean).join(' · ') || document.title
  }, [title, business?.name])
}

/** Refreshes the customer's profile from GET /me while a screen that shows it is open. */
export function useFreshClient() {
  const { token, setClient } = useAuth()
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: ({ signal }) => getMe(token!, signal),
    enabled: Boolean(token),
    refetchOnMount: 'always',
    gcTime: 0,
  })
  const { data, isFetchedAfterMount } = me
  useEffect(() => {
    if (data && isFetchedAfterMount) setClient(data.client)
  }, [data, isFetchedAfterMount, setClient])
}
