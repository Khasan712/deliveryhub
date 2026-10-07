import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeOrder } from '../test/fixtures'
import { db } from '../test/handlers'
import { location, pattern, renderApp, screen, som, uz, within } from '../test/render'
import { installTelegram } from '../test/telegram'

// The tests run at a phone's width (no min-width query matches): the menu bar is at the bottom.
const bar = () => screen.getByRole('navigation', { name: uz.mainNavigation })
const DAILY = Array.from({ length: 7 }, () => ({ open: '09:00', close: '22:00' }))

describe('a phone', () => {
  it('has the menu, the cart, the orders and the profile in a bar at the bottom', async () => {
    const { user } = renderApp({ cart: [{ id: 3, qty: 2 }] })

    const menu = await screen.findByRole('navigation', { name: uz.mainNavigation })
    expect(within(menu).getByRole('link', { name: uz.menu })).toHaveAttribute('aria-current', 'page')
    expect(within(menu).getByRole('link', { name: uz.orders })).toHaveAttribute('href', '/orders')
    expect(within(menu).getByRole('link', { name: uz.profile })).toHaveAttribute('href', '/profile')
    // The header keeps the shop's name only (its links moved down).
    const header = screen.getByRole('banner')
    expect(within(header).queryByRole('link', { name: uz.profile })).not.toBeInTheDocument()
    expect(within(header).queryByRole('link', { name: uz.orders })).not.toBeInTheDocument()

    // The count and the total once the menu has loaded.
    await user.click(await within(menu).findByRole('button', { name: pattern(uz.openCart, '2 ta mahsulot', som(18000)) }))
    expect(await screen.findByRole('dialog', { name: uz.cart })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(within(bar()).getByRole('link', { name: uz.profile }))
    expect(location.current?.pathname).toBe('/profile')
    expect(within(bar()).getByRole('link', { name: uz.profile })).toHaveAttribute('aria-current', 'page')
  })

  it('goes from the menu straight to the checkout, and gives the checkout the whole bottom', async () => {
    const { user } = renderApp({ signedIn: true, cart: [{ id: 1, qty: 2 }] })

    await user.click(await screen.findByRole('button', { name: pattern(uz.checkout, '2 ta mahsulot', som(70000)) }))
    expect(location.current?.pathname).toBe('/checkout')
    expect(await screen.findByRole('heading', { level: 1, name: uz.checkoutTitle })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: uz.mainNavigation })).not.toBeInTheDocument()
    // The order in one line on top; its button opens the cart.
    await user.click(screen.getByRole('button', { name: `${uz.edit}: ${uz.yourOrder}` }))
    expect(await screen.findByRole('dialog', { name: uz.cart })).toBeInTheDocument()
  })

  it('asks a guest to sign in on the way to the checkout', async () => {
    const { user } = renderApp({ cart: [{ id: 1, qty: 2 }] })
    await user.click(await screen.findByRole('button', { name: pattern(uz.checkout, som(70000)) }))
    expect(await screen.findByRole('dialog', { name: uz.loginTitle })).toHaveTextContent(uz.viaPhone)
    expect(location.current?.pathname).toBe('/')
  })

  it('says how much more is needed below the minimum order, and opens the cart', async () => {
    const { user } = renderApp({ cart: [{ id: 3, qty: 2 }] })

    // 2 × 9 000 against a minimum of 50 000.
    const next = await screen.findByRole('button', { name: pattern(`Yana ${som(32000)} qo‘shing`) })
    expect(screen.queryByRole('button', { name: pattern(uz.checkout, som(18000)) })).not.toBeInTheDocument()
    await user.click(next)
    expect(await screen.findByRole('dialog', { name: uz.cart })).toBeInTheDocument()
    expect(location.current?.pathname).toBe('/')
  })

  describe('while the shop is closed', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-05T23:00:00+05:00')) // Monday night
      db.week = DAILY
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('says when it opens instead of the checkout', async () => {
      renderApp({ cart: [{ id: 1, qty: 2 }] })
      expect(await screen.findByRole('button', { name: pattern('2', 'Yopiq · ertaga 09:00 da ochiladi') })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: pattern(uz.checkout, som(70000)) })).not.toBeInTheDocument()
    })
  })

  it('shows an order on its way on top of the menu, and marks the orders in the bar', async () => {
    db.orders = [makeOrder({ id: 140, status: 'on_the_way' }), makeOrder({ id: 120, status: 'completed' })]
    renderApp({ signedIn: true })

    const order = await screen.findByRole('link', { name: /Buyurtma #140/ })
    expect(order).toHaveAttribute('href', '/orders/140')
    expect(order).toHaveTextContent(uz.status_on_the_way)
    expect(order).toHaveTextContent(uz.statusText_on_the_way)
    expect(screen.queryByRole('link', { name: /Buyurtma #120/ })).not.toBeInTheDocument()
  })

  it('shows no order strip without an order on its way', async () => {
    db.orders = [makeOrder({ id: 120, status: 'completed' })]
    renderApp({ signedIn: true })
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(screen.queryByRole('link', { name: /Buyurtma #/ })).not.toBeInTheDocument())
  })

  it('orders a finished order again from the list', async () => {
    db.orders = [makeOrder({ id: 140, status: 'on_the_way' }), makeOrder({ id: 120, status: 'completed' })]
    const { user } = renderApp({ route: '/orders', signedIn: true })

    const past = await screen.findByRole('region', { name: uz.pastOrders })
    // An active order is followed, not repeated.
    expect(screen.queryByRole('button', { name: `${uz.reorder}: Buyurtma #140` })).not.toBeInTheDocument()
    await user.click(within(past).getByRole('button', { name: `${uz.reorder}: Buyurtma #120` }))

    expect(await screen.findByText(uz.reorderPartial)).toBeInTheDocument()
    const sheet = await screen.findByRole('dialog', { name: uz.cart })
    expect(within(sheet).getByRole('group', { name: 'Klassik burger: miqdori' })).toHaveTextContent('2')
    expect(location.current?.pathname).toBe('/')
  })

  it('inside Telegram keeps the header icons and its MainButton (no bar at the bottom)', async () => {
    installTelegram()
    renderApp({ cart: [{ id: 1, qty: 2 }] })
    await screen.findByRole('heading', { level: 1 })
    // The only main navigation is the header's (no bar at the bottom).
    expect(within(screen.getByRole('banner')).getByRole('navigation', { name: uz.mainNavigation })).toBe(bar())
    expect(within(screen.getByRole('banner')).getAllByRole('link', { name: uz.orders }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: pattern(uz.checkout, som(70000)) })).not.toBeInTheDocument()
  })
})

describe('a wide screen', () => {
  const matchMedia = window.matchMedia
  beforeEach(() => {
    window.matchMedia = (query: string) =>
      ({ ...matchMedia(query), matches: query.includes('min-width') || query.includes('prefers-reduced-motion') }) as MediaQueryList
  })
  afterEach(() => {
    window.matchMedia = matchMedia
  })

  it('keeps its links in the header and has no bar at the bottom', async () => {
    renderApp()
    const links = await screen.findByRole('navigation', { name: uz.mainNavigation })
    expect(within(screen.getByRole('banner')).getByRole('navigation', { name: uz.mainNavigation })).toBe(links)
    expect(within(screen.getByRole('banner')).getByRole('link', { name: uz.profile })).toBeInTheDocument()
  })
})
