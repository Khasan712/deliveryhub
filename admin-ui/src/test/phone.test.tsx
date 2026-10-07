import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { nextStatus } from '../features/orders/orderFlow'
import { formatMoney } from '../lib/format'
import { store } from '../mocks/data'
import { locationOf, renderApp } from './render'
import { recordRequests } from './server'
import { viewport } from './setup'

/** The newest order still waiting (the first card of the lists). */
function newestWaiting() {
  return [...store.db.orders].reverse().find((order) => order.status === 'ordered')!
}

function bottomMenu() {
  return screen.getByRole('navigation', { name: 'Asosiy menyu' })
}

describe('phone: the bottom menu', () => {
  it('replaces the side menu and the header, and shows how many orders wait', async () => {
    viewport.width = 390
    const waiting = store.db.orders.filter((order) => order.status === 'ordered').length
    const { user, router } = renderApp('/orders')

    const menu = await screen.findByRole('navigation', { name: 'Asosiy menyu' })
    expect(screen.queryByRole('navigation', { name: 'Admin panel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Foydalanuvchi menyusi' })).not.toBeInTheDocument()
    const orders = within(menu).getByRole('link', { name: /Buyurtmalar/ })
    expect(orders).toHaveAttribute('aria-current', 'page')
    expect(await within(orders).findByText(`${waiting} ta yangi buyurtma`)).toBeInTheDocument()

    await user.click(within(menu).getByRole('link', { name: 'Sotuv' }))
    expect(locationOf(router)).toBe('/sales')
    // Selling has bars of its own: the menu steps aside.
    await screen.findByRole('heading', { name: 'Yangi buyurtma' })
    expect(screen.queryByRole('navigation', { name: 'Asosiy menyu' })).not.toBeInTheDocument()
  })

  it('«Yana» holds the other pages, the language, the theme and signing out', async () => {
    viewport.width = 390
    const { user, router } = renderApp('/')

    await user.click(within(await screen.findByRole('navigation', { name: 'Asosiy menyu' })).getByRole('link', { name: 'Yana' }))
    expect(await screen.findByRole('heading', { name: 'Yana' })).toBeInTheDocument()
    expect(within(bottomMenu()).getByRole('link', { name: 'Yana' })).toHaveAttribute('aria-current', 'page')
    for (const [name, href] of [
      ['Mijozlar', '/clients'],
      ['Kategoriyalar', '/categories'],
      ["O'lchov birliklari", '/units'],
      ['Ish vaqti', '/hours'],
      ['Telegram bot', '/telegram'],
      ['Foydalanuvchilar', '/users'],
    ]) {
      expect(screen.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('href', href)
    }
    expect(screen.getByRole('switch', { name: 'Tungi rejim' })).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('link', { name: /^Kategoriyalar/ }))
    expect(locationOf(router)).toBe('/categories')
    // A page of «Yana» keeps «Yana» lit.
    expect(within(bottomMenu()).getByRole('link', { name: 'Yana' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(bottomMenu()).getByRole('link', { name: 'Yana' }))
    await user.click(await screen.findByRole('button', { name: 'Chiqish' }))
    await waitFor(() => expect(locationOf(router)).toBe('/login'))
  })

  it('shows a manager no staff users', async () => {
    viewport.width = 390
    renderApp('/more', { as: 'manager' })
    expect(await screen.findByRole('link', { name: /^Kategoriyalar/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Foydalanuvchilar/ })).not.toBeInTheDocument()
  })

  it('is only for phones: a wide screen keeps its side menu', async () => {
    const { router } = renderApp('/more')
    await waitFor(() => expect(locationOf(router)).toBe('/'))
    expect(await screen.findByRole('navigation', { name: 'Admin panel' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Asosiy menyu' })).not.toBeInTheDocument()
  })
})

describe('phone: orders', () => {
  it('the home page shows today and the waiting orders', async () => {
    viewport.width = 390
    const { user } = renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Burger House' })).toBeInTheDocument()
    expect(screen.getByText('Bugungi tushum')).toBeInTheDocument()
    const waiting = screen.getByRole('region', { name: 'Yangi buyurtmalar' })
    const count = Math.min(5, store.db.orders.filter((order) => order.status === 'ordered').length)
    await waitFor(() => expect(within(waiting).getAllByRole('article')).toHaveLength(count))
    const first = within(waiting).getAllByRole('article')[0]
    const order = newestWaiting()
    expect(first).toHaveTextContent(`#${order.id}`)
    expect(screen.getByRole('link', { name: /^Yangi/ })).toHaveAttribute('href', '/orders?status=ordered')

    // Sent on from its card, the order leaves the new ones at once.
    const label = nextStatus(order) === 'on_the_way' ? "Yo'lga chiqarish" : 'Bajarildi'
    await user.click(within(first).getByRole('button', { name: `${label}: #${order.id}` }))
    await waitFor(() => expect(within(waiting).queryByText(`#${order.id}`)).not.toBeInTheDocument())
  })

  it('a card names what was ordered and moves the order on in one tap', async () => {
    viewport.width = 390
    const order = newestWaiting()
    const patches = recordRequests('patch', `/api/v1/orders/${order.id}`)
    const { user } = renderApp('/orders')

    const card = (await screen.findAllByRole('article')).find((item) => item.textContent?.includes(`#${order.id}`))!
    expect(card).toHaveTextContent(`${order.items[0].quantity}× ${order.items[0].name_uz}`)
    const next = nextStatus(order)!
    const label = next === 'on_the_way' ? "Yo'lga chiqarish" : 'Bajarildi'
    await user.click(within(card).getByRole('button', { name: `${label}: #${order.id}` }))
    await waitFor(() => expect(patches[0]?.body).toEqual({ status: next }))
    expect(await screen.findByText('Holat yangilandi')).toBeInTheDocument()
    await waitFor(() => expect(within(card).queryByRole('button', { name: `${label}: #${order.id}` })).not.toBeInTheDocument())
  })

  it('an order: where it is, and its next step at the bottom of the screen', async () => {
    viewport.width = 390
    const order = store.db.orders.find((item) => item.status === 'ordered' && item.delivery_type === 'delivery')!
    const patches = recordRequests('patch', `/api/v1/orders/${order.id}`)
    const { user } = renderApp(`/orders/${order.id}`)

    const progress = await screen.findByRole('list', { name: 'Buyurtma holati' })
    expect(within(progress).getAllByRole('listitem')).toHaveLength(3)
    expect(within(progress).getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('navigation', { name: 'Asosiy menyu' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Yo'lga chiqarish" }))
    await waitFor(() => expect(patches[0]?.body).toEqual({ status: 'on_the_way' }))
    await waitFor(() => expect(within(progress).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step'))

    // Rejecting asks first.
    await user.click(await screen.findByRole('button', { name: 'Bekor qilish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Buyurtmani bekor qilasizmi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Ha, bekor qilish' }))
    await waitFor(() => expect(patches[1]?.body).toEqual({ status: 'rejected' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Yetkazildi' })).not.toBeInTheDocument())
  })
})

describe('phone: selling', () => {
  it('in three screens: the products, the details, and the order made', async () => {
    viewport.width = 390
    const creates = recordRequests('post', '/api/v1/sales')
    const burger = store.db.products.find((item) => item.name_uz === 'Chizburger')!
    const cola = store.db.products.find((item) => item.name_uz === 'Coca-Cola 0.5')!
    const { user, router } = renderApp('/sales')

    const add = await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ })
    expect(screen.getByText('Mahsulot tanlang yoki ovoz bilan ayting')).toBeInTheDocument()
    await user.click(add)
    await user.click(add)
    await user.click(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Coca-Cola 0\.5,/ }))
    expect(screen.getByRole('group', { name: 'Chizburger: Buyurtmada' })).toHaveTextContent('2')
    await user.click(screen.getByRole('button', { name: 'Kamaytirish: Chizburger' }))
    await user.click(screen.getByRole('button', { name: "Ko'paytirish: Chizburger" }))

    const total = 2 * burger.price + cola.price
    const next = screen.getByRole('button', { name: /Davom etish/ })
    // The element's text is whitespace-normalised; the money's thin spaces are too, for the comparison.
    expect(next).toHaveTextContent(formatMoney(total, 'uz').replace(/\s/g, ' '))
    await user.click(next)

    expect(await screen.findByRole('heading', { name: 'Rasmiylashtirish' })).toBeInTheDocument()
    expect(screen.getByText('2 × Chizburger')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Yetkazib berish/ }))
    await user.type(screen.getByLabelText('Telefon'), '90 111 22 33')
    await user.type(screen.getByLabelText('Manzil'), 'Chilonzor 9')
    await user.click(screen.getByRole('button', { name: "Izoh qo'shish" }))
    await user.type(screen.getByLabelText('Izoh'), 'Tezroq')
    await user.click(screen.getByRole('button', { name: 'Buyurtma yaratish' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0].body).toMatchObject({
      items: [
        { product_id: burger.id, quantity: 2 },
        { product_id: cola.id, quantity: 1 },
      ],
      phone: '90 111 22 33',
      delivery_type: 'delivery',
      address: 'Chilonzor 9',
      payment_method: 'cash',
      status: 'ordered',
      comment: 'Tezroq',
    })

    // The order made: its own screen, no scrolling to find out.
    expect(await screen.findByRole('heading', { name: 'Buyurtma yaratildi' })).toBeInTheDocument()
    const made = store.db.orders.at(-1)!
    expect(screen.getByText(new RegExp(`#${made.id} ·`))).toBeInTheDocument()
    expect(screen.getByText('Chilonzor 9')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buyurtmani ochish' })).toHaveAttribute('href', `/orders/${made.id}`)

    // The next sale starts empty.
    await user.click(screen.getByRole('button', { name: 'Yangi buyurtma' }))
    expect(await screen.findByText('Mahsulot tanlang yoki ovoz bilan ayting')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Chizburger: Buyurtmada' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yopish' }))
    expect(locationOf(router)).toBe('/')
  })

  it('groups the menu by category and finds a product by name', async () => {
    viewport.width = 390
    const { user } = renderApp('/sales')

    expect(await screen.findByRole('region', { name: 'Burgerlar' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ichimliklar' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pitsa' }))
    expect(screen.queryByRole('region', { name: 'Burgerlar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Pepperoni,/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ })).not.toBeInTheDocument()
  })

  it('opens the voice assistant in a sheet', async () => {
    viewport.width = 390
    const { user } = renderApp('/sales')

    await user.click(await screen.findByRole('button', { name: 'Ovoz bilan' }))
    const sheet = await screen.findByRole('dialog', { name: 'AI ovozli yordamchi' })
    expect(within(sheet).getByRole('button', { name: 'Gapirishni boshlash' })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Yopish' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
