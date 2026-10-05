import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, requestsTo } from '../../test/handlers'
import { findCard, pattern, renderApp, screen, som, uz, within } from '../../test/render'
import { server } from '../../test/server'

const storedCart = () => JSON.parse(localStorage.getItem(`dh:${window.location.host}:cart`) ?? 'null')
const DAILY = Array.from({ length: 7 }, () => ({ open: '09:00', close: '22:00' }))

describe('a product that is not available right now', () => {
  it('stays on the menu, says so and is not added', async () => {
    db.frozen = new Set([3])
    const { user } = renderApp()
    const card = await findCard('Kola 0.5 l')
    expect(within(card).getByText(uz.unavailableBadge)).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: uz.add }))
    expect(await screen.findByRole('alert')).toHaveTextContent('«Kola 0.5 l» hozir mavjud emas')
    expect(storedCart() ?? []).toEqual([])
    expect(within(card).queryByRole('group')).not.toBeInTheDocument()
  })

  it('explains itself in the product sheet', async () => {
    db.frozen = new Set([3])
    const { user } = renderApp()
    await user.click(within(await findCard('Kola 0.5 l')).getByRole('button', { name: 'Kola 0.5 l' }))
    const sheet = await screen.findByRole('dialog', { name: 'Kola 0.5 l' })
    expect(within(sheet).getByText(uz.productUnavailableText)).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: pattern(uz.add) })).not.toBeInTheDocument()
  })

  it('stays in the cart greyed out and holds the order until it is taken out', async () => {
    db.frozen = new Set([3])
    const { user } = renderApp({ cart: [{ id: 3, qty: 2 }, { id: 1, qty: 2 }] })
    await user.click(await screen.findByRole('button', { name: pattern(uz.openCart) }))
    const sheet = await screen.findByRole('dialog', { name: uz.cart })

    expect(within(sheet).getByText(uz.unavailableLine)).toBeInTheDocument()
    expect(within(sheet).getByRole('alert')).toHaveTextContent(
      '«Kola 0.5 l» hozir mavjud emas. Buyurtma berish uchun savatdan olib tashlang.',
    )
    const checkout = within(sheet).getByRole('button', { name: pattern(uz.checkout) })
    expect(checkout).toBeDisabled()

    await user.click(within(sheet).getByRole('button', { name: uz.removeUnavailable }))
    expect(storedCart()).toEqual([{ id: 1, qty: 2 }])
    expect(within(sheet).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: pattern(uz.checkout, som(70000)) })).toBeEnabled()
  })
})

describe('working hours', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('show the status on the banner and the week in a sheet', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T23:00:00+05:00')) // Monday night
    db.week = DAILY
    const { user } = renderApp()

    await user.click(await screen.findByRole('button', { name: 'Yopiq · ertaga 09:00 da ochiladi' }))
    const sheet = await screen.findByRole('dialog', { name: uz.workingHours })
    const days = within(sheet).getAllByRole('listitem')
    expect(days).toHaveLength(7)
    expect(days[0]).toHaveTextContent(`${uz.weekday_0}· ${uz.today}09:00 – 22:00`)
    expect(days[0]).toHaveAttribute('aria-current', 'date')
  })

  it('take no orders while the shop is closed, but keep the cart', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T23:00:00+05:00'))
    db.week = DAILY
    const { user } = renderApp({ cart: [{ id: 1, qty: 2 }] })
    await user.click(await screen.findByRole('button', { name: pattern(uz.openCart) }))
    const sheet = await screen.findByRole('dialog', { name: uz.cart })
    expect(within(sheet).getByText('Hozir yopiqmiz — ertaga 09:00 da ochilamiz. Savatingiz saqlanib turadi.')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Yopiq · ertaga 09:00 da ochiladi' })).toBeDisabled()
    expect(storedCart()).toEqual([{ id: 1, qty: 2 }])
  })

  it('block the checkout page too', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T08:00:00+05:00'))
    db.week = DAILY
    renderApp({ route: '/checkout', signedIn: true, cart: [{ id: 1, qty: 2 }] })
    await screen.findByDisplayValue('Aziz Karimov')
    expect(screen.getByText('Hozir yopiqmiz — bugun 09:00 da ochilamiz. Savatingiz saqlanib turadi.')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: 'Yopiq · bugun 09:00 da ochiladi' })) {
      expect(button).toBeDisabled()
    }
  })
})

describe('an out-of-date menu at checkout', () => {
  it('refreshes the menu when the server says a product is not available any more', async () => {
    server.use(
      http.post('/api/v1/orders', () => HttpResponse.json({ error: 'product_unavailable', detail: [1] }, { status: 400 })),
    )
    const { user } = renderApp({ route: '/checkout', signedIn: true, cart: [{ id: 1, qty: 2 }] })
    await screen.findByDisplayValue('Aziz Karimov')
    const loads = requestsTo('GET', 'shop').length
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
    expect((await screen.findAllByText(uz.unavailableOrdered)).length).toBeGreaterThan(0)
    await waitFor(() => expect(requestsTo('GET', 'shop').length).toBeGreaterThan(loads))
  })

  it('and when it says the shop has closed', async () => {
    server.use(http.post('/api/v1/orders', () => HttpResponse.json({ error: 'business_closed', opens_at: null }, { status: 400 })))
    const { user } = renderApp({ route: '/checkout', signedIn: true, cart: [{ id: 1, qty: 2 }] })
    await screen.findByDisplayValue('Aziz Karimov')
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
    expect((await screen.findAllByText(uz.closedNoticeNoTime)).length).toBeGreaterThan(0)
  })
})

describe('product photos', () => {
  it('cards load the small copy, the product sheet the full photo', async () => {
    const { user } = renderApp()
    const card = await findCard('Klassik burger')
    const small = card.querySelector('img')
    expect(small).toHaveAttribute('src', '/media/burger_house/products/classic.thumb.jpg')

    await user.click(within(card).getByRole('button', { name: 'Klassik burger' }))
    const sheet = await screen.findByRole('dialog', { name: 'Klassik burger' })
    expect(sheet.querySelector('img')).toHaveAttribute('src', '/media/burger_house/products/classic.jpg')
  })
})
