import { act, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { requestsTo } from './test/handlers'
import { findCard, location, pattern, renderApp, screen, som, uz, within } from './test/render'
import { installTelegram } from './test/telegram'

describe('Telegram Mini App', () => {
  it('starts like a Mini App and signs in with initData automatically', async () => {
    const telegram = installTelegram()
    renderApp({ route: '/profile' })

    expect(telegram.webApp.ready).toHaveBeenCalled()
    expect(telegram.webApp.expand).toHaveBeenCalled()
    expect(document.documentElement).toHaveAttribute('data-tg')

    expect(await screen.findByRole('heading', { name: 'Aziz Karimov' })).toBeInTheDocument()
    expect(requestsTo('POST', 'auth/telegram/webapp')[0]?.body).toEqual({ init_data: telegram.webApp.initData })
    expect(screen.getAllByText('@aziz_tg').length).toBeGreaterThan(0)
    // Inside Telegram: no logout, no theme switch (the theme follows Telegram), no token in localStorage.
    expect(screen.queryByRole('button', { name: uz.logout })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: uz.language })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: uz.theme })).not.toBeInTheDocument()
    expect(localStorage.getItem(`dh:${window.location.host}:token`)).toBeNull()
  })

  it('drives the cart and checkout with the MainButton and goes back with the BackButton', async () => {
    const telegram = installTelegram()
    const { user } = renderApp()

    const card = await findCard('Klassik burger')
    expect(telegram.mainButton.visible).toBe(false)
    expect(telegram.backButton.visible).toBe(false)
    // A phone's menu bar at the bottom, as on the website.
    const bar = screen.getByRole('navigation', { name: uz.mainNavigation })

    await user.click(within(card).getByRole('button', { name: uz.add }))
    expect(telegram.haptics.impact).toHaveBeenCalledWith('light')
    await user.click(within(card).getByRole('button', { name: uz.increase }))
    // The menu's next step is the page's own bar above the menu bar: no MainButton under them.
    expect(await screen.findByRole('button', { name: pattern(uz.checkout, '2 ta mahsulot', som(70000)) })).toBeInTheDocument()
    expect(telegram.mainButton.visible).toBe(false)

    // The cart from the menu bar: its sheet hands the checkout to the MainButton.
    await user.click(within(bar).getByRole('button', { name: pattern(uz.openCart, '2 ta mahsulot', som(70000)) }))
    expect(await screen.findByRole('dialog', { name: uz.cart })).toBeInTheDocument()
    await waitFor(() => expect(telegram.mainButton.text).toMatch(pattern(uz.checkout, som(70000))))
    expect(telegram.backButton.visible).toBe(true)

    // Signed in automatically, so checkout opens directly.
    act(() => telegram.mainButton.click())
    expect(await screen.findByRole('heading', { level: 1, name: uz.checkoutTitle })).toBeInTheDocument()
    await waitFor(() => expect(telegram.mainButton.text).toMatch(pattern(uz.placeOrder, som(70000))))
    // The page's own submit button gives way to the MainButton.
    expect(screen.queryByRole('button', { name: pattern(uz.placeOrder) })).not.toBeInTheDocument()

    await user.type(await screen.findByLabelText(uz.phone), '901234567')
    await user.type(screen.getByLabelText(uz.address), 'Chilonzor 9')
    act(() => telegram.mainButton.click())

    expect(await screen.findByRole('heading', { name: uz.orderPlaced })).toBeInTheDocument()
    expect(requestsTo('POST', 'orders')[0]?.body).toMatchObject({ platform: 'miniapp', phone: '+998901234567' })
    expect(telegram.haptics.notification).toHaveBeenCalledWith('success')

    // BackButton leaves the order page.
    await waitFor(() => expect(telegram.backButton.visible).toBe(true))
    act(() => telegram.backButton.click())
    await waitFor(() => expect(location.current?.pathname).toBe('/'))
    await waitFor(() => expect(telegram.backButton.visible).toBe(false))
  })

  it('uses the MainButton for the product sheet', async () => {
    const telegram = installTelegram()
    const { user } = renderApp()
    await user.click(within(await findCard('Chizburger')).getByRole('button', { name: 'Chizburger' }))
    const sheet = await screen.findByRole('dialog', { name: 'Chizburger' })
    await waitFor(() => expect(telegram.mainButton.text).toMatch(pattern(uz.addToCart, som(38000))))
    expect(within(sheet).queryByRole('button', { name: pattern(uz.add, som(38000)) })).not.toBeInTheDocument()

    act(() => telegram.mainButton.click())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(await findCard('Chizburger')).getByRole('group')).toHaveTextContent('1')
  })
})
