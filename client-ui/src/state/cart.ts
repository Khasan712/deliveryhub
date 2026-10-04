import { createContext, useContext } from 'react'
import type { Product } from '../api/types'

/** One cart entry as stored: product id and quantity (an array keeps the order products were added). */
export interface CartItem {
  id: number
  qty: number
}

export interface CartLine {
  product: Product
  qty: number
  total: number
}

export const MAX_QTY = 99

export function sanitizeItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const items: CartItem[] = []
  for (const entry of raw) {
    const id = Number((entry as CartItem | null)?.id)
    const qty = Math.min(MAX_QTY, Math.floor(Number((entry as CartItem | null)?.qty)))
    if (!Number.isInteger(id) || id <= 0 || !(qty > 0) || seen.has(id)) continue
    seen.add(id)
    items.push({ id, qty })
  }
  return items
}

export function setItemQty(items: CartItem[], id: number, qty: number): CartItem[] {
  const next = Math.max(0, Math.min(MAX_QTY, Math.floor(qty)))
  const exists = items.some((item) => item.id === id)
  if (next === 0) return exists ? items.filter((item) => item.id !== id) : items
  if (!exists) return [...items, { id, qty: next }]
  return items.map((item) => (item.id === id ? { id, qty: next } : item))
}

export function resolveLines(items: CartItem[], productsById: Map<number, Product>): CartLine[] {
  const lines: CartLine[] = []
  for (const item of items) {
    const product = productsById.get(item.id)
    if (product) lines.push({ product, qty: item.qty, total: product.price * item.qty })
  }
  return lines
}

export function cartTotals(lines: CartLine[]): { count: number; total: number } {
  return lines.reduce((sum, line) => ({ count: sum.count + line.qty, total: sum.total + line.total }), { count: 0, total: 0 })
}

/** How much is still missing to the business's minimum order (0 when there is no minimum). */
export function minOrderLeft(total: number, minOrder: number): number {
  return minOrder > 0 ? Math.max(0, minOrder - total) : 0
}

export function pruneItems(items: CartItem[], productsById: Map<number, Product>): { items: CartItem[]; removed: number[] } {
  const removed = items.filter((item) => !productsById.has(item.id)).map((item) => item.id)
  return removed.length ? { items: items.filter((item) => productsById.has(item.id)), removed } : { items, removed }
}

export interface CartContextValue {
  items: CartItem[]
  lines: CartLine[]
  /** Lines of products the business froze: they stay in the cart, but block the order until removed. */
  unavailable: CartLine[]
  count: number
  total: number
  minOrder: number
  /** Amount still missing to the minimum order. */
  left: number
  belowMinimum: boolean
  quantity: (id: number) => number
  setQuantity: (id: number, qty: number) => void
  increment: (id: number) => void
  decrement: (id: number) => void
  /** Adds quantities (reorder); returns how many of the products exist in the catalog. */
  addMany: (entries: CartItem[]) => number
  /** Empties the cart and returns what was in it (for "undo"). */
  clear: () => CartItem[]
  replace: (items: CartItem[]) => void
  removeIds: (ids: number[]) => void
  removeUnavailable: () => void
  /** Increments on every add — drives the little "bump" of cart buttons. */
  pulse: number
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart() must be used inside <CartProvider>')
  return context
}
