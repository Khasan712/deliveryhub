import { act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { business, TOKEN } from '../../test/fixtures'
import { db, GEO, requestsTo } from '../../test/handlers'
import { location, pattern, renderApp, screen, som, uz, within } from '../../test/render'
import { server } from '../../test/server'
import { installTelegram } from '../../test/telegram'

const storedCart = () => JSON.parse(localStorage.getItem(`dh:${window.location.host}:cart`) ?? 'null')

describe('cart sheet', () => {
  it('sums up lines, enforces the minimum order and clears with undo', async () => {
    const { user } = renderApp({ cart: [{ id: 3, qty: 2 }] })
    await user.click(await screen.findByRole('button', { name: pattern(uz.openCart, '2 ta mahsulot', som(18000)) }))

    const sheet = await screen.findByRole('dialog', { name: uz.cart })
    expect(within(sheet).getByText('Kola 0.5 l')).toBeInTheDocument()
    // 18 000 of the 50 000 minimum: a hint, a progress bar and no checkout yet.
    expect(within(sheet).getByText(`Minimal buyurtma ${som(50000)}. Yana ${som(32000)} qo‘shing`)).toBeInTheDocument()
    expect(within(sheet).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '18000')
    expect(within(sheet).getByRole('button', { name: pattern(uz.checkout) })).toBeDisabled()

    const stepper = within(sheet).getByRole('group', { name: 'Kola 0.5 l: miqdori' })
    for (let i = 0; i < 4; i++) await user.click(within(stepper).getByRole('button', { name: uz.increase }))
    expect(within(sheet).getByTestId('cart-total')).toHaveTextContent(pattern(som(54000)))
    expect(within(sheet).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: pattern(uz.checkout) })).toBeEnabled()

    await user.click(within(sheet).getByRole('button', { name: uz.clear }))
    expect(await within(sheet).findByText(uz.cartEmpty)).toBeInTheDocument()
    expect(storedCart()).toEqual([])
    await user.click(screen.getByRole('button', { name: uz.undo }))
    expect(await within(sheet).findByText('Kola 0.5 l')).toBeInTheDocument()
    expect(storedCart()).toEqual([{ id: 3, qty: 6 }])
  })

  it('asks a guest to sign in before checkout', async () => {
    const { user } = renderApp({ cart: [{ id: 1, qty: 2 }] })
    await user.click(await screen.findByRole('button', { name: pattern(uz.openCart, som(70000)) }))
    await user.click(within(await screen.findByRole('dialog', { name: uz.cart })).getByRole('button', { name: pattern(uz.checkout) }))
    expect(await screen.findByRole('heading', { name: uz.loginTitle })).toBeInTheDocument()
  })
})

describe('checkout', () => {
  const open = async () => {
    const view = renderApp({ route: '/checkout', signedIn: true, cart: [{ id: 1, qty: 2 }] })
    await screen.findByRole('heading', { level: 1, name: uz.checkoutTitle })
    await screen.findByDisplayValue('Aziz Karimov') // the account has been loaded and prefilled the form
    return view
  }

  it('prefills the contact details of the account', async () => {
    await open()
    expect(await screen.findByLabelText(uz.yourName)).toHaveValue('Aziz Karimov')
    expect(screen.getByLabelText(uz.phone)).toHaveValue('90 123 45 67')
    expect(screen.getByLabelText(uz.address)).toHaveValue('Chilonzor 9, 12-uy')
  })

  it('validates required fields before sending anything', async () => {
    const { user } = await open()
    await user.clear(await screen.findByLabelText(uz.yourName))
    await user.clear(screen.getByLabelText(uz.address))
    const phone = screen.getByLabelText(uz.phone)
    await user.clear(phone)
    await user.type(phone, '90 12')

    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)

    expect(await screen.findByText(uz.required)).toBeInTheDocument()
    expect(screen.getByText(uz.invalidPhone)).toBeInTheDocument()
    expect(screen.getByText(uz.addressOrLocation)).toBeInTheDocument()
    expect(screen.getByLabelText(uz.yourName)).toHaveAttribute('aria-invalid', 'true')
    expect(requestsTo('POST', 'orders')).toHaveLength(0)

    // Typing fixes the field and clears its error.
    await user.type(screen.getByLabelText(uz.yourName), 'Aziz')
    expect(screen.queryByText(uz.required)).not.toBeInTheDocument()
  })

  it('does not ask for an address for pickup and shows where to come', async () => {
    const { user } = await open()
    await user.click(await screen.findByRole('radio', { name: uz.pickup }))
    expect(screen.queryByLabelText(uz.address)).not.toBeInTheDocument()
    expect(screen.getByText(uz.pickupNote)).toBeInTheDocument()
    expect(screen.getByText(uz.pickupFrom)).toBeInTheDocument()
    expect(screen.getByText(business.address)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: pattern(uz.onMap) })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=41.311081,69.279737',
    )
  })

  describe('the map', () => {
    const openMap = async (user: Awaited<ReturnType<typeof open>>['user']) => {
      await user.click(screen.getByRole('button', { name: pattern(uz.pickOnMap) }))
      return within(await screen.findByRole('dialog', { name: uz.mapTitle }))
    }

    it('puts the delivery point on the map; an empty address takes the map’s', async () => {
      const { user } = await open()
      await user.clear(screen.getByLabelText(uz.address))
      const map = await openMap(user)

      // The map opens around the business and names the address under its pin.
      expect(await map.findByText(GEO.address)).toBeInTheDocument()
      await user.click(map.getByRole('button', { name: 'Xaritani surish' }))
      expect(await map.findByText(GEO.address)).toBeInTheDocument()
      await waitFor(() => expect(requestsTo('GET', 'geo/reverse')).toHaveLength(2))
      // A move that ends where it started (a resize) does not ask again.
      await user.click(map.getByRole('button', { name: 'Xaritani surish' }))
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(requestsTo('GET', 'geo/reverse')).toHaveLength(2)
      await user.click(map.getByRole('button', { name: uz.pickThisPlace }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: uz.mapTitle })).not.toBeInTheDocument())
      expect(screen.getByText(uz.locationOnMap)).toBeInTheDocument()
      expect(screen.getByLabelText(uz.address)).toHaveValue(GEO.address)

      await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
      await screen.findByRole('heading', { name: uz.orderPlaced })
      expect(requestsTo('POST', 'orders')[0]?.body).toMatchObject({ address: GEO.address, lat: 41.2856, lng: 69.2035 })
    })

    it('keeps an address the customer wrote and offers the map’s with one tap', async () => {
      const { user } = await open()
      const map = await openMap(user)
      await user.click(map.getByRole('button', { name: 'Xaritani surish' }))
      expect(await map.findByText(GEO.address)).toBeInTheDocument()
      await user.click(map.getByRole('button', { name: uz.pickThisPlace }))

      await waitFor(() => expect(screen.queryByRole('dialog', { name: uz.mapTitle })).not.toBeInTheDocument())
      expect(screen.getByLabelText(uz.address)).toHaveValue('Chilonzor 9, 12-uy')
      expect(screen.getByText(`Xaritadagi manzil: ${GEO.address}`)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: uz.useIt }))
      expect(screen.getByLabelText(uz.address)).toHaveValue(GEO.address)
      expect(screen.queryByText(`Xaritadagi manzil: ${GEO.address}`)).not.toBeInTheDocument()

      // The point can be taken back.
      await user.click(screen.getByRole('button', { name: uz.removeLocation }))
      expect(screen.getByRole('button', { name: pattern(uz.pickOnMap) })).toBeInTheDocument()
    })

    it('finds a place by its name', async () => {
      const { user } = await open()
      await user.clear(screen.getByLabelText(uz.address))
      const map = await openMap(user)
      await user.type(map.getByRole('searchbox', { name: uz.mapSearch }), 'Chorsu{Enter}')

      const results = await map.findByRole('list', { name: uz.mapSearchResults })
      await user.click(within(results).getByRole('button', { name: GEO.places[0]!.address }))
      // A search result brings its own address: the map is not asked again for it.
      expect(await map.findByText(GEO.places[0]!.address)).toBeInTheDocument()
      const lookups = requestsTo('GET', 'geo/reverse').length
      await user.click(map.getByRole('button', { name: uz.pickThisPlace }))
      expect(requestsTo('GET', 'geo/reverse')).toHaveLength(lookups)

      await waitFor(() => expect(screen.getByLabelText(uz.address)).toHaveValue(GEO.places[0]!.address))
      await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
      await screen.findByRole('heading', { name: uz.orderPlaced })
      expect(requestsTo('POST', 'orders')[0]?.body).toMatchObject({ lat: 41.3266, lng: 69.2353 })
    })

    it('still sets the point when the map server is out of reach', async () => {
      db.geoDown = true
      const { user } = await open()
      const map = await openMap(user)
      expect(await map.findByText(uz.noAddressHere)).toBeInTheDocument()
      await user.type(map.getByRole('searchbox', { name: uz.mapSearch }), 'Chorsu{Enter}')
      expect(await map.findByText(uz.mapSearchFailed)).toBeInTheDocument()
      await user.click(map.getByRole('button', { name: uz.pickThisPlace }))

      expect(await screen.findByText(uz.locationOnMap)).toBeInTheDocument()
      expect(screen.getByLabelText(uz.address)).toHaveValue('Chilonzor 9, 12-uy')
    })

    it('in Telegram, the MainButton picks the place and the BackButton closes the map', async () => {
      const telegram = installTelegram()
      const { user } = await open()
      const map = await openMap(user)
      await waitFor(() => expect(telegram.mainButton.text).toBe(uz.pickThisPlace))
      expect(map.queryByRole('button', { name: uz.pickThisPlace })).not.toBeInTheDocument()

      act(() => telegram.backButton.click())
      await waitFor(() => expect(screen.queryByRole('dialog', { name: uz.mapTitle })).not.toBeInTheDocument())
      await waitFor(() => expect(telegram.mainButton.text).toMatch(pattern(uz.placeOrder)))

      await openMap(user)
      await waitFor(() => expect(telegram.mainButton.text).toBe(uz.pickThisPlace))
      act(() => telegram.mainButton.click())
      expect(await screen.findByText(uz.locationOnMap)).toBeInTheDocument()
    })
  })

  it('maps server validation errors to the fields', async () => {
    server.use(
      http.post('/api/v1/orders', () =>
        HttpResponse.json({ error: 'validation', fields: { phone: ['invalid'], address: ['required'] } }, { status: 400 }),
      ),
    )
    const { user } = await open()
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
    expect(await screen.findByText(uz.invalidPhone)).toBeInTheDocument()
    expect(screen.getByText(uz.required)).toBeInTheDocument()
    expect(screen.getByLabelText(uz.address)).toHaveAttribute('aria-invalid', 'true')
  })

  it('explains a minimum order rejected by the server', async () => {
    server.use(http.post('/api/v1/orders', () => HttpResponse.json({ error: 'min_order', min_order: 100000 }, { status: 400 })))
    const { user } = await open()
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
    expect((await screen.findAllByText(`Minimal buyurtma summasi — ${som(100000)}`)).length).toBeGreaterThan(0)
  })

  it('places the order, clears the cart and opens the order tracker', async () => {
    const { user } = await open()
    await user.click(await screen.findByRole('radio', { name: uz.card }))
    // The comment waits folded until it is wanted; opening it puts the cursor in it.
    expect(screen.queryByRole('textbox', { name: pattern(uz.comment) })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: pattern(uz.addComment) }))
    expect(screen.getByRole('textbox', { name: pattern(uz.comment) })).toHaveFocus()
    await user.type(screen.getByRole('textbox', { name: pattern(uz.comment) }), 'Domofon 25')
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder, som(70000)) })[0]!)

    expect(await screen.findByRole('heading', { name: uz.orderPlaced })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Buyurtma #200' })).toBeInTheDocument()
    expect(location.current?.pathname).toBe('/orders/200')
    expect(storedCart()).toEqual([])

    const [request] = requestsTo('POST', 'orders')
    expect(request?.auth).toBe(`Bearer ${TOKEN}`)
    expect(request?.body).toEqual({
      items: [{ product_id: 1, quantity: 2 }],
      name: 'Aziz Karimov',
      phone: '+998901234567',
      delivery_type: 'delivery',
      address: 'Chilonzor 9, 12-uy',
      lat: null,
      lng: null,
      payment_method: 'card',
      comment: 'Domofon 25',
      platform: 'web',
      lang: 'uz',
    })
    // Contact details are remembered for the next order (without the comment).
    expect(JSON.parse(localStorage.getItem(`dh:${window.location.host}:contact`)!)).toMatchObject({
      name: 'Aziz Karimov',
      payment_method: 'card',
    })
  })

  it('signs the customer out when the token is rejected', async () => {
    server.use(http.post('/api/v1/orders', () => HttpResponse.json({ error: 'auth_required' }, { status: 401 })))
    const { user } = await open()
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
    expect(await screen.findByText(uz.sessionExpired)).toBeInTheDocument()
    expect(localStorage.getItem(`dh:${window.location.host}:token`)).toBeNull()
    expect(await screen.findByRole('heading', { name: uz.signInToOrder })).toBeInTheDocument()
  })

  it('removes products that disappeared from the menu', async () => {
    server.use(
      http.post('/api/v1/orders', () => HttpResponse.json({ error: 'product_not_found', detail: [1] }, { status: 400 })),
    )
    const { user } = await open()
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
    expect(await screen.findByText(uz.productGone)).toBeInTheDocument()
    expect(storedCart()).toEqual([])
  })
})

describe('placing an order on a bad network', () => {
  it('sends the same key again after a lost answer, so the order is not placed twice', async () => {
    const keys: (string | null)[] = []
    let first = true
    server.use(
      http.post('/api/v1/orders', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        if (first) {
          first = false
          return HttpResponse.error() // the answer never arrives
        }
        return undefined // the regular handler places the order
      }),
    )
    const { user } = renderApp({ route: '/checkout', signedIn: true, cart: [{ id: 1, qty: 2 }] })
    await screen.findByDisplayValue('Aziz Karimov')

    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
    expect((await screen.findAllByText(uz.errNetwork)).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)

    await waitFor(() => expect(location.current?.pathname).toMatch(/^\/orders\/\d+$/))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^[\w-]{8,64}$/)
    expect(keys[1]).toBe(keys[0])
  })

  it('waits while the first try of the same checkout is still being placed', async () => {
    let busy = 2
    server.use(
      http.post('/api/v1/orders', () =>
        busy-- > 0 ? HttpResponse.json({ error: 'order_in_progress' }, { status: 409 }) : undefined,
      ),
    )
    const { user } = renderApp({ route: '/checkout', signedIn: true, cart: [{ id: 1, qty: 2 }] })
    await screen.findByDisplayValue('Aziz Karimov')
    await user.click(screen.getAllByRole('button', { name: pattern(uz.placeOrder) })[0]!)
    await waitFor(() => expect(location.current?.pathname).toMatch(/^\/orders\/\d+$/), { timeout: 8000 })
  })
})
