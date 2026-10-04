import { act, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { business } from '../../test/fixtures'
import { requestsTo } from '../../test/handlers'
import { findCard, location, pattern, renderApp, screen, som, uz, within } from '../../test/render'

describe('catalog', () => {
  it('shows the business, the hero, categories, the popular row and product cards', async () => {
    renderApp()

    // Skeletons first, then the menu from GET /api/v1/shop.
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: business.tagline })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: business.name })).toBeInTheDocument()
    expect(screen.getAllByText('30–45 daqiqa').length).toBeGreaterThan(0)
    expect(screen.getByText(`Minimal buyurtma ${som(50000)}`)).toBeInTheDocument()

    // Phones: the search above the menu, categories as chips (the popular dishes first).
    expect(within(screen.getByRole('banner')).queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: uz.searchPlaceholder })).toBeInTheDocument()
    const chips = within(screen.getByRole('navigation', { name: uz.categories }))
    expect(chips.getAllByRole('button').map((chip) => chip.textContent)).toEqual([uz.popularShort, 'Burgerlar', 'Ichimliklar', uz.other])

    expect(screen.getByRole('heading', { name: uz.popular })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Burgerlar/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Ichimliklar/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Desertlar/ })).not.toBeInTheDocument() // empty category

    // A menu line: name, description, price and the round "+".
    const burger = await findCard('Klassik burger')
    expect(within(burger).getByRole('heading', { name: 'Klassik burger' })).toBeInTheDocument()
    expect(within(burger).getByText('Mol go‘shti, cheddar pishlog‘i va maxsus sous')).toBeInTheDocument()
    expect(within(burger).getByText(som(35000))).toBeInTheDocument()
    expect(within(burger).getByRole('button', { name: uz.add })).toBeInTheDocument()
    // The popular dishes come first, as their own cards.
    expect(screen.getAllByRole('article', { name: 'Klassik burger' })).toHaveLength(2)

    expect(document.title).toBe(business.name)
    expect(requestsTo('GET', 'shop')).toHaveLength(1)
  })

  describe('on a wide screen', () => {
    const matchMedia = window.matchMedia
    beforeEach(() => {
      // Every min-width query matches: the widest layout.
      window.matchMedia = (query: string) =>
        ({ ...matchMedia(query), matches: query.includes('min-width') || query.includes('prefers-reduced-motion') }) as MediaQueryList
    })
    afterEach(() => {
      window.matchMedia = matchMedia
    })

    it('shows the categories on the left, the search in the header and the cart beside the menu', async () => {
      const { user } = renderApp({ cart: [{ id: 3, qty: 2 }] })
      const rail = await screen.findByRole('navigation', { name: uz.categories })
      expect(within(rail).getAllByRole('button').map((item) => item.textContent)).toEqual([
        uz.popularShort,
        'Burgerlar',
        'Ichimliklar',
        uz.other,
      ])
      expect(within(rail).getByRole('button', { name: uz.popularShort })).toHaveAttribute('aria-current', 'true')

      // One row on top: the brand, the search, the links, the language, the theme and the profile.
      const search = within(screen.getByRole('banner')).getByRole('searchbox', { name: uz.searchPlaceholder })
      expect(screen.getAllByRole('searchbox')).toHaveLength(1)
      const links = within(screen.getByRole('navigation', { name: uz.mainNavigation }))
      expect(links.getAllByRole('link').map((link) => link.textContent)).toEqual([uz.menu, uz.orders])

      const cart = screen.getByRole('region', { name: uz.cart })
      expect(within(cart).getByText('2 ta mahsulot')).toBeInTheDocument()
      expect(within(cart).getByText(`${som(9000)} / dona`)).toBeInTheDocument()
      expect(within(cart).getByText(uz.delivery)).toBeInTheDocument()
      expect(within(cart).getByTestId('cart-total')).toHaveTextContent(pattern(som(18000)))

      // The search from the header filters the menu; the rail stays.
      await user.type(search, 'kola')
      expect(await screen.findByRole('heading', { name: new RegExp(uz.results) })).toHaveTextContent('1')
      expect(screen.getByRole('navigation', { name: uz.categories })).toBeInTheDocument()
    })

    it('keeps the favourites in one row that the arrows scroll', async () => {
      const scrollTo = vi.spyOn(Element.prototype, 'scrollTo')
      renderApp()
      const favourites = (await screen.findByRole('heading', { name: uz.popular })).closest('section')!
      expect(within(favourites).getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual([
        'Chizburger',
        'Klassik burger',
        'Kola 0.5 l',
      ])
      const back = within(favourites).getByRole('button', { name: uz.scrollLeft })
      const forward = within(favourites).getByRole('button', { name: uz.scrollRight })
      // Everything fits: no arrows.
      expect(back).toBeDisabled()
      expect(forward).toBeDisabled()

      // Three cards of 264px in a 600px column: there is more to the right.
      const row = favourites.querySelector('.snap-x') as HTMLElement
      Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 840 })
      Object.defineProperty(row, 'clientWidth', { configurable: true, value: 600 })
      act(() => row.dispatchEvent(new Event('scroll')))
      expect(back).toBeDisabled()
      expect(forward).toBeEnabled()
      fireEvent.click(forward)
      expect(scrollTo).toHaveBeenCalledWith({ left: 510, behavior: 'auto' })

      Object.defineProperty(row, 'scrollLeft', { configurable: true, value: 240 })
      act(() => row.dispatchEvent(new Event('scroll')))
      expect(back).toBeEnabled()
      expect(forward).toBeDisabled()
    })

    it('searches from the header on any screen: typing goes back to the menu', async () => {
      const { user } = renderApp({ route: '/orders' })
      const search = await within(screen.getByRole('banner')).findByRole('searchbox', { name: uz.searchPlaceholder })
      await user.type(search, 'kola')
      await waitFor(() => expect(location.current?.pathname).toBe('/'))
      expect(await screen.findByRole('heading', { name: new RegExp(uz.results) })).toHaveTextContent('1')
      expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Kola 0.5 l'])
    })

    it('scrolls to a category so that its title stays clear of the header', async () => {
      const { user } = renderApp()
      const rail = await screen.findByRole('navigation', { name: uz.categories })
      const header = screen.getByRole('banner')
      const section = screen.getByRole('heading', { name: /^Ichimliklar/ }).closest('section')!
      header.getBoundingClientRect = () => ({ height: 64 }) as DOMRect
      section.getBoundingClientRect = () => ({ top: 900 }) as DOMRect
      const scrollTo = vi.spyOn(window, 'scrollTo')

      await user.click(within(rail).getByRole('button', { name: 'Ichimliklar' }))
      expect(scrollTo).toHaveBeenCalledWith({ top: 900 - 64 - 16, behavior: 'auto' })
      expect(within(rail).getByRole('button', { name: 'Ichimliklar' })).toHaveAttribute('aria-current', 'true')
      scrollTo.mockRestore()
    })
  })

  it('applies the brand colour of the business to the CSS variables', async () => {
    renderApp()
    await screen.findByRole('heading', { level: 1, name: business.tagline })
    const style = document.documentElement.style
    expect(style.getPropertyValue('--brand')).toBe('#ff6b00')
    expect(style.getPropertyValue('--brand-ink')).toBe('#ffffff')
    expect(style.getPropertyValue('--brand-2')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('searches by name in both languages and shows an empty state', async () => {
    const { user } = renderApp()
    const search = await screen.findByRole('searchbox', { name: uz.searchPlaceholder })

    await user.type(search, 'чизбургер')
    expect(await screen.findByRole('heading', { name: new RegExp(uz.results) })).toHaveTextContent('1')
    expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual(['Chizburger'])
    expect(screen.queryByRole('navigation', { name: uz.categories })).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'pitsa')
    expect(await screen.findByText(uz.nothingFound)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: uz.clearSearch }))
    expect(await screen.findByRole('heading', { name: uz.popular })).toBeInTheDocument()
  })

  it('adds and removes products with the card stepper and keeps the cart per shop host', async () => {
    const { user } = renderApp()
    const card = await findCard('Kola 0.5 l')

    await user.click(within(card).getByRole('button', { name: uz.add }))
    const stepper = within(card).getByRole('group', { name: 'Kola 0.5 l: miqdori' })
    expect(within(stepper).getByText('1')).toBeInTheDocument()

    await user.click(within(stepper).getByRole('button', { name: uz.increase }))
    await user.click(within(stepper).getByRole('button', { name: uz.increase }))
    expect(within(stepper).getByText('3')).toBeInTheDocument()

    // The floating cart bar sums it up; the cart is stored under this host's key.
    expect(screen.getByRole('button', { name: pattern(`${uz.openCart}: 3 ta mahsulot, ${som(27000)}`) })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(`dh:${window.location.host}:cart`)!)).toEqual([{ id: 3, qty: 3 }])

    await user.click(within(stepper).getByRole('button', { name: uz.decrease }))
    await user.click(within(stepper).getByRole('button', { name: uz.decrease }))
    await user.click(within(stepper).getByRole('button', { name: uz.decrease }))
    expect(within(card).getByRole('button', { name: uz.add })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(`dh:${window.location.host}:cart`)!)).toEqual([])
  })

  it('opens the product details sheet and adds the chosen quantity', async () => {
    const { user } = renderApp()
    const card = await findCard('Klassik burger')
    await user.click(within(card).getByRole('button', { name: 'Klassik burger' }))

    const sheet = await screen.findByRole('dialog', { name: 'Klassik burger' })
    expect(within(sheet).getByText('Mol go‘shti, cheddar pishlog‘i va maxsus sous')).toBeInTheDocument()
    expect(within(sheet).getByRole('img', { name: 'Klassik burger' })).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: uz.increase }))
    await user.click(within(sheet).getByRole('button', { name: pattern(uz.add, som(70000)) }))

    expect(await screen.findByText(uz.addedToCart)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(card).getByRole('group', { name: 'Klassik burger: miqdori' })).toHaveTextContent('2')
  })

  it('shows an error state with retry when the menu cannot be loaded', async () => {
    const { server } = await import('../../test/server')
    const { http, HttpResponse } = await import('msw')
    server.use(http.get('/api/v1/shop', () => HttpResponse.error(), { once: true }))
    const { user } = renderApp()

    expect(await screen.findByText(uz.loadError)).toBeInTheDocument()
    expect(screen.getByText(uz.errNetwork)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: uz.retry }))
    expect(await screen.findByRole('heading', { level: 1, name: business.tagline })).toBeInTheDocument()
  })

  it('shows a full-page notice when the business is suspended', async () => {
    const { server } = await import('../../test/server')
    const { http, HttpResponse } = await import('msw')
    server.use(http.get('/api/v1/shop', () => HttpResponse.json({ error: 'business_suspended' }, { status: 503 })))
    renderApp()
    expect(await screen.findByText(uz.shopSuspended)).toBeInTheDocument()
  })

  it('does not hide a suspension behind the menu kept from an earlier visit', async () => {
    const { server } = await import('../../test/server')
    const { http, HttpResponse } = await import('msw')
    const { storageKey } = await import('../../lib/storage')
    const cached = { business, bot_username: null, categories: [], products: [], popular: [], client: null }
    window.localStorage.setItem(storageKey('catalog'), JSON.stringify({ savedAt: Date.now() - 60_000, data: cached }))
    server.use(http.get('/api/v1/shop', () => HttpResponse.json({ error: 'business_suspended' }, { status: 503 })))
    renderApp()
    expect(await screen.findByText(uz.shopSuspended)).toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem(storageKey('catalog'))).toBeNull())
  })
})
