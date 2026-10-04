import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/i18n'
import { readStorage, storageKey, writeStorage } from '../lib/storage'
import {
  CartContext,
  cartTotals,
  minOrderLeft,
  pruneItems,
  resolveLines,
  sanitizeItems,
  setItemQty,
  type CartContextValue,
  type CartItem,
} from './cart'
import { useCatalog } from './catalog'
import { useToast } from './toast'

/** The cart: persisted in localStorage per shop host and kept in sync between tabs. */
export function CartProvider({ children }: { children: ReactNode }) {
  const { productsById, business, fresh } = useCatalog()
  const { t } = useI18n()
  const toast = useToast()
  const [items, setItems] = useState<CartItem[]>(() => sanitizeItems(readStorage<unknown>('cart', [])))
  const [pulse, setPulse] = useState(0)
  const itemsRef = useRef(items)

  useLayoutEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    writeStorage('cart', items)
  }, [items])

  // Another tab changed the cart.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey('cart')) return
      try {
        setItems(sanitizeItems(event.newValue ? JSON.parse(event.newValue) : []))
      } catch {
        /* ignore malformed data */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Products that disappeared from the menu leave the cart (only judged by a fresh server response).
  useEffect(() => {
    if (!fresh) return
    const { items: kept, removed } = pruneItems(itemsRef.current, productsById)
    if (removed.length) {
      setItems(kept)
      toast(t('productGone'), { type: 'error' })
    }
  }, [fresh, productsById, t, toast])

  const update = useCallback((id: number, compute: (qty: number) => number) => {
    const qtyOf = (list: CartItem[]) => list.find((item) => item.id === id)?.qty ?? 0
    const before = qtyOf(itemsRef.current)
    if (compute(before) > before) setPulse((value) => value + 1)
    setItems((current) => setItemQty(current, id, compute(qtyOf(current))))
  }, [])

  const value = useMemo((): CartContextValue => {
    const lines = resolveLines(items, productsById)
    const unavailable = lines.filter((line) => line.product.frozen)
    // What is not available right now stays in the cart (and the count) but not in the total.
    const { count } = cartTotals(lines)
    const { total } = cartTotals(lines.filter((line) => !line.product.frozen))
    const minOrder = business?.min_order ?? 0
    const left = minOrderLeft(total, minOrder)
    const quantity = (id: number) => items.find((item) => item.id === id)?.qty ?? 0
    return {
      items,
      lines,
      unavailable,
      count,
      total,
      minOrder,
      left,
      belowMinimum: left > 0,
      quantity,
      setQuantity: (id, qty) => update(id, () => qty),
      increment: (id) => update(id, (qty) => qty + 1),
      decrement: (id) => update(id, (qty) => qty - 1),
      addMany: (entries) => {
        const known = entries.filter((entry) => productsById.has(entry.id) && entry.qty > 0)
        if (known.length) {
          setItems((current) =>
            known.reduce((acc, entry) => {
              const existing = acc.find((item) => item.id === entry.id)?.qty ?? 0
              return setItemQty(acc, entry.id, existing + entry.qty)
            }, current),
          )
          setPulse((count) => count + 1)
        }
        return known.length
      },
      clear: () => {
        const previous = itemsRef.current
        setItems([])
        return previous
      },
      replace: (next) => setItems(sanitizeItems(next)),
      removeIds: (ids) => setItems((current) => current.filter((item) => !ids.includes(item.id))),
      removeUnavailable: () => {
        const ids = new Set(unavailable.map((line) => line.product.id))
        setItems((current) => current.filter((item) => !ids.has(item.id)))
      },
      pulse,
    }
  }, [items, productsById, business?.min_order, update, pulse])

  return <CartContext value={value}>{children}</CartContext>
}
