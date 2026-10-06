import { useQuery } from '@tanstack/react-query'
import { isApiError } from '../api/client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyBrandVariables, brandVariables } from '../lib/color'
import { removeStorage, writeStorage } from '../lib/storage'
import { useAuth } from './auth'
import {
  buildSections,
  CatalogContext,
  fetchShop,
  popularProducts,
  readCachedCatalog,
  shopQueryKey,
  type CatalogContextValue,
} from './catalog'

/** The server says the whole shop is gone (suspended business, unknown host): a cached menu must not hide it. */
function isClosed(error: unknown) {
  return isApiError(error) && ['business_suspended', 'unknown_host'].includes(error.code)
}

/**
 * `GET /shop` — the business and the whole catalog in one call. The last response (without the customer)
 * is kept in localStorage, so a returning customer sees the menu instantly while it refreshes.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { token, syncFromShop } = useAuth()
  const [cached] = useState(readCachedCatalog)

  const query = useQuery({
    queryKey: shopQueryKey,
    queryFn: ({ signal }) => fetchShop(token, signal),
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.savedAt,
    staleTime: 60_000,
    // The offline copy is only a head start: always ask the server on start (fresh prices, and the
    // stored token is validated by the `client` of the response) — main.tsx usually has asked already.
    refetchOnMount: (current) => (current.state.dataUpdatedAt === cached?.savedAt ? 'always' : true),
  })
  const { data, dataUpdatedAt, error, refetch } = query
  const fresh = Boolean(data) && dataUpdatedAt !== cached?.savedAt
  const closed = isClosed(error)

  // A closed shop forgets its offline menu: the next visit must not show it either.
  useEffect(() => {
    if (closed) removeStorage('catalog')
  }, [closed])

  // Once per server response: validate the stored token and keep an offline copy of the menu.
  const syncedAt = useRef(0)
  useEffect(() => {
    if (!data || !fresh || syncedAt.current === dataUpdatedAt) return
    syncedAt.current = dataUpdatedAt
    syncFromShop(data.client, data.requestedWithToken)
    writeStorage('catalog', { savedAt: dataUpdatedAt, data: { ...data, client: null, requestedWithToken: null } })
  }, [data, dataUpdatedAt, fresh, syncFromShop])

  const business = data?.business
  useLayoutEffect(() => {
    if (!business) return
    const variables = brandVariables(business.brand_color)
    applyBrandVariables(variables)
    writeStorage('brand', variables)
  }, [business])

  const value = useMemo((): CatalogContextValue => {
    const products = data?.products ?? []
    const productsById = new Map(products.map((product) => [product.id, product]))
    return {
      status: closed ? 'error' : data ? 'ready' : error ? 'error' : 'loading',
      error: closed || !data ? error : null,
      refetch: () => void refetch(),
      business,
      botUsername: data?.bot_username ?? null,
      products,
      productsById,
      sections: buildSections(data?.categories ?? [], products),
      popular: popularProducts(data?.popular ?? [], productsById),
      fresh,
    }
  }, [data, error, refetch, business, fresh, closed])

  return <CatalogContext value={value}>{children}</CatalogContext>
}
