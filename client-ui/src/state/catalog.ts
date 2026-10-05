import { createContext, useContext } from 'react'
import { isApiError } from '../api/client'
import { getShop } from '../api/shop'
import { readStorage } from '../lib/storage'
import type { Business, Category, Product, ShopData } from '../api/types'

export interface ShopResult extends ShopData {
  /** The token the response was requested with (the `client` field depends on it). */
  requestedWithToken: string | null
}

export interface Section {
  /** Category id; 0 for products without a known category ("Other"). */
  id: number
  category: Category | null
  products: Product[]
}

export interface CatalogContextValue {
  /** `loading` — nothing to show yet; `error` — the first load failed (see `error`). */
  status: 'loading' | 'error' | 'ready'
  error: Error | null
  refetch: () => void
  business: Business | undefined
  botUsername: string | null
  products: Product[]
  productsById: Map<number, Product>
  sections: Section[]
  /** Most ordered products (shown as a rail and tagged "Top" when there are at least two). */
  popular: Product[]
  /** True once the catalog came from the server in this session (not only from the offline copy). */
  fresh: boolean
}

export const shopQueryKey = ['shop'] as const

/** The last menu this device saw (without the customer): shown at once while the fresh one loads. */
export interface CachedCatalog {
  savedAt: number
  data: ShopResult
}

export const readCachedCatalog = () => readStorage<CachedCatalog | null>('catalog', null)

export async function fetchShop(token: string | null, signal?: AbortSignal): Promise<ShopResult> {
  try {
    return { ...(await getShop(token, signal)), requestedWithToken: token }
  } catch (error) {
    // A dead token must not hide the menu: load it anonymously (the 401 already signed the customer out).
    if (token && isApiError(error) && error.status === 401) {
      return { ...(await getShop(null, signal)), requestedWithToken: null }
    }
    throw error
  }
}

export function buildSections(categories: Category[], products: Product[]): Section[] {
  const known = new Set(categories.map((category) => category.id))
  const sections: Section[] = categories
    .map((category) => ({
      id: category.id,
      category,
      products: products.filter((product) => product.category_id === category.id),
    }))
    .filter((section) => section.products.length > 0)
  const other = products.filter((product) => product.category_id === null || !known.has(product.category_id))
  if (other.length) sections.push({ id: 0, category: null, products: other })
  return sections
}

export const POPULAR_MIN = 2

export function popularProducts(ids: number[], productsById: Map<number, Product>): Product[] {
  const list = ids.map((id) => productsById.get(id)).filter((product): product is Product => Boolean(product))
  return list.length >= POPULAR_MIN ? list : []
}

/** Lower-case, unify Uzbek apostrophes (o‘ o' oʻ) and ё/е so that search forgives typing habits. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʻʼ`´']/g, "'")
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

export function searchProducts(products: Product[], query: string): Product[] | null {
  const normalized = normalizeSearch(query)
  if (!normalized) return null
  const words = normalized.split(' ')
  return products.filter((product) => {
    const haystack = normalizeSearch(`${product.name_uz} ${product.name_ru} ${product.desc_uz} ${product.desc_ru}`)
    return words.every((word) => haystack.includes(word))
  })
}

export const CatalogContext = createContext<CatalogContextValue | null>(null)

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext)
  if (!context) throw new Error('useCatalog() must be used inside <CatalogProvider>')
  return context
}
