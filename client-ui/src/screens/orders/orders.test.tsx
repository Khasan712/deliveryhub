import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Order } from '../../api/types'
import { OrderTracker } from '../../components/OrderStatus'
import { I18nProvider } from '../../i18n/I18nProvider'
import { stepState } from '../../state/orders'
import { makeOrder } from '../../test/fixtures'
import { db } from '../../test/handlers'
import { location, renderApp, som, uz } from '../../test/render'

function steps(order: Order) {
  render(
    <I18nProvider>
      <OrderTracker order={order} />
    </I18nProvider>,
  )
  const list = screen.getByRole('list', { name: uz.orderProgress })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => `${item.textContent}:${item.dataset.state}`)
}

describe('order tracker', () => {
  it('walks a delivery through accepted → on the way → delivered', () => {
    expect(steps(makeOrder({ status: 'ordered' }))).toEqual([
      `${uz.status_ordered}:current`,
      `${uz.status_on_the_way}:upcoming`,
      `${uz.status_completed}:upcoming`,
    ])
  })

  it('marks the courier step while the order is on its way', () => {
    expect(steps(makeOrder({ status: 'on_the_way' }))).toEqual([
      `${uz.status_ordered}:done`,
      `${uz.status_on_the_way}:current`,
      `${uz.status_completed}:upcoming`,
    ])
  })

  it('completes every step of a delivered order', () => {
    expect(steps(makeOrder({ status: 'completed' }))).toEqual([
      `${uz.status_ordered}:done`,
      `${uz.status_on_the_way}:done`,
      `${uz.status_completed}:done`,
    ])
  })

  it('has only two steps for pickup, ending with "handed over"', () => {
    expect(steps(makeOrder({ status: 'ordered', delivery_type: 'pickup' }))).toEqual([
      `${uz.status_ordered}:current`,
      `${uz.status_completed_pickup}:upcoming`,
    ])
    expect(stepState({ status: 'completed', delivery_type: 'pickup' }, 'completed')).toBe('done')
  })
})

describe('orders', () => {
  it('lists active orders first, then the history', async () => {
    db.orders = [
      makeOrder({ id: 140, status: 'on_the_way' }),
      makeOrder({ id: 120, status: 'completed', delivery_type: 'pickup' }),
      makeOrder({ id: 110, status: 'rejected' }),
    ]
    renderApp({ route: '/orders', signedIn: true })

    const active = await screen.findByRole('region', { name: uz.activeOrders })
    expect(within(active).getByRole('link', { name: /Buyurtma #140/ })).toHaveTextContent(uz.status_on_the_way)
    const past = screen.getByRole('region', { name: uz.pastOrders })
    expect(within(past).getByRole('link', { name: /Buyurtma #120/ })).toHaveTextContent(uz.status_completed_pickup)
    expect(within(past).getByRole('link', { name: /Buyurtma #110/ })).toHaveTextContent(uz.status_rejected)
  })

  it('asks a guest to sign in', async () => {
    renderApp({ route: '/orders' })
    expect(await screen.findByText(uz.ordersSignIn)).toBeInTheDocument()
  })

  it('shows an empty state without orders', async () => {
    db.orders = []
    renderApp({ route: '/orders', signedIn: true })
    expect(await screen.findByText(uz.ordersEmpty)).toBeInTheDocument()
  })

  it('shows the order page with details, the tracker and a live-status note', async () => {
    renderApp({ route: '/orders/131', signedIn: true })
    expect(await screen.findByRole('heading', { level: 1, name: 'Buyurtma #131' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: uz.status_ordered })).toBeInTheDocument()
    expect(screen.getByText(uz.statusText_ordered)).toBeInTheDocument()
    expect(screen.getByText('Taxminiy vaqt: 30–45 daqiqa')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: uz.orderProgress })).toBeInTheDocument()
    expect(screen.getByText(uz.liveStatus)).toBeInTheDocument()
    expect(screen.getByText('Chilonzor 9')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: uz.onMap })).toHaveAttribute('href', 'https://maps.google.com/?q=41.310000,69.270000')
    expect(screen.getByText('+998 90 123 45 67')).toBeInTheDocument()
    expect(screen.getByText('Domofon 25')).toBeInTheDocument()
    expect(screen.getAllByText(som(82000)).length).toBeGreaterThan(0)
  })

  it('shows where to collect a pickup order', async () => {
    db.orders = [makeOrder({ delivery_type: 'pickup', address: '', lat: null, lng: null })]
    renderApp({ route: '/orders/131', signedIn: true })
    expect(await screen.findByRole('heading', { level: 1, name: 'Buyurtma #131' })).toBeInTheDocument()
    expect(await screen.findByText("Amir Temur ko'chasi, 15, Toshkent")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: uz.onMap })).toHaveAttribute('href', 'https://maps.google.com/?q=41.311081,69.279737')
  })

  it('shows a banner instead of the tracker for a rejected order', async () => {
    db.orders = [makeOrder({ status: 'rejected' })]
    renderApp({ route: '/orders/131', signedIn: true })
    expect(await screen.findByRole('alert')).toHaveTextContent(uz.rejectedText)
    expect(screen.getByRole('link', { name: uz.callUs })).toHaveAttribute('href', 'tel:+998712001122')
    expect(screen.queryByRole('list', { name: uz.orderProgress })).not.toBeInTheDocument()
    expect(screen.queryByText(uz.liveStatus)).not.toBeInTheDocument()
  })

  it('tells when an order does not exist', async () => {
    renderApp({ route: '/orders/999', signedIn: true })
    expect(await screen.findByText(uz.orderNotFound)).toBeInTheDocument()
  })

  it('reorders: puts the available items back in the cart and opens it', async () => {
    const { user } = renderApp({ route: '/orders/131', signedIn: true, cart: [{ id: 1, qty: 1 }] })
    await user.click(await screen.findByRole('button', { name: uz.reorder }))

    // The order had 2 × burger, 1 × cola and a product that left the menu.
    expect(await screen.findByText(uz.reorderPartial)).toBeInTheDocument()
    const sheet = await screen.findByRole('dialog', { name: uz.cart })
    expect(within(sheet).getByRole('group', { name: 'Klassik burger: miqdori' })).toHaveTextContent('3')
    expect(within(sheet).getByRole('group', { name: 'Kola 0.5 l: miqdori' })).toHaveTextContent('1')
    expect(JSON.parse(localStorage.getItem(`dh:${window.location.host}:cart`)!)).toEqual([
      { id: 1, qty: 3 },
      { id: 3, qty: 1 },
    ])
    expect(location.current?.pathname).toBe('/')
  })
})
