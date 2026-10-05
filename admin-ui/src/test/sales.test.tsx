import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { SalesProduct } from '../api/types'
import { addOne, cartLines, cartTotal, filterProducts, itemsCount, MAX_QTY, qtyOf, setQty, statusFor } from '../features/sales/cart'
import { resetDb, store } from '../mocks/data'
import { renderApp } from './render'
import { recordRequests, server } from './server'

const product = (id: number, price: number, category: number | null = 1, name = `P${id}`): SalesProduct => ({
  id,
  name_uz: name,
  name_ru: `${name} ru`,
  price,
  unit_uz: 'dona',
  unit_ru: 'шт',
  category_id: category,
  image: null,
  thumb: null,
  frozen: false,
})

describe('cart math', () => {
  const catalog = new Map([product(1, 32000), product(2, 9000, 3), product(3, 79000, 2)].map((item) => [item.id, item]))

  it('adds, sets and removes quantities without mutating', () => {
    const empty: Array<{ product_id: number; quantity: number }> = []
    const one = addOne(empty, 1)
    expect(empty).toEqual([])
    expect(one).toEqual([{ product_id: 1, quantity: 1 }])
    const two = addOne(one, 1)
    expect(qtyOf(two, 1)).toBe(2)
    expect(setQty(two, 2, 3)).toEqual([
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 3 },
    ])
    expect(setQty(two, 1, 0)).toEqual([])
    expect(setQty(two, 1, -4)).toEqual([])
    expect(qtyOf(setQty(two, 1, 500), 1)).toBe(MAX_QTY)
  })

  it('totals lines and ignores products missing from the catalog', () => {
    const items = [
      { product_id: 1, quantity: 2 },
      { product_id: 2, quantity: 3 },
      { product_id: 99, quantity: 5 },
    ]
    const lines = cartLines(items, catalog)
    expect(lines.map((line) => line.product_id)).toEqual([1, 2])
    expect(itemsCount(lines)).toBe(5)
    expect(cartTotal(lines)).toBe(2 * 32000 + 3 * 9000)
  })

  it('filters products by category and by name in both languages', () => {
    const products = [product(1, 1, 1, 'Chizburger'), product(2, 1, 2, 'Pepperoni'), product(3, 1, 2, 'Margarita')]
    expect(filterProducts(products, '', 2).map((item) => item.id)).toEqual([2, 3])
    expect(filterProducts(products, 'peppe', null).map((item) => item.id)).toEqual([2])
    expect(filterProducts(products, 'MARGARITA RU', null).map((item) => item.id)).toEqual([3])
  })

  it('defaults the status from the delivery type', () => {
    expect(statusFor('pickup')).toBe('completed')
    expect(statusFor('delivery')).toBe('ordered')
  })
})

function orderPanel() {
  return screen.getByRole('region', { name: 'Yangi buyurtma' })
}

describe('point of sale', () => {
  it('builds an order from tiles and creates it', async () => {
    const creates = recordRequests('post', '/api/v1/sales')
    const { user } = renderApp('/sales')

    const burger = await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ })
    await user.click(burger)
    await user.click(burger)
    await user.click(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Coca-Cola 0\.5,/ }))

    const panel = orderPanel()
    expect(within(panel).getByText('Chizburger')).toBeInTheDocument()
    expect(within(panel).getByText('3 ta')).toBeInTheDocument()
    expect(within(panel).getByText("73 000 so'm")).toBeInTheDocument() // 2 × 32 000 + 9 000

    await user.click(within(panel).getByRole('button', { name: "Ko'paytirish: Coca-Cola 0.5" }))
    await user.click(within(panel).getByRole('button', { name: 'Kamaytirish: Chizburger' }))
    expect(within(panel).getByText("50 000 so'm")).toBeInTheDocument() // 32 000 + 2 × 9 000

    await user.type(within(panel).getByLabelText('Mijoz ismi'), 'Aziz')
    // Demo orders are spread around the real clock, so today's count is read, not assumed.
    const salesToday = () => Number(screen.getByText('Bugungi sotuvlar').nextElementSibling?.textContent)
    const before = salesToday()
    await user.click(within(panel).getByRole('button', { name: 'Buyurtma yaratish' }))

    expect(await screen.findByText('Buyurtma yaratildi · #1000')).toBeInTheDocument()
    expect(creates[0].body).toEqual({
      items: [
        { product_id: 1, quantity: 1 },
        { product_id: 8, quantity: 2 },
      ],
      customer_name: 'Aziz',
      phone: '',
      address: '',
      delivery_type: 'pickup',
      payment_method: 'cash',
      status: 'completed',
      comment: '',
    })
    // The form is cleared, the sale is on top of the recent list and today's stats are updated.
    await waitFor(() => expect(within(orderPanel()).getByText('Mahsulot tanlang yoki ovoz bilan ayting')).toBeInTheDocument())
    const recent = screen.getByRole('region', { name: "So'nggi sotuvlar" })
    expect(within(recent).getAllByRole('link')[1]).toHaveTextContent('#1000')
    await waitFor(() => expect(salesToday()).toBe(before + 1))
  })

  it('moves the status with the delivery type until it is chosen by hand', async () => {
    const { user } = renderApp('/sales')
    await screen.findByRole('region', { name: 'Yangi buyurtma' })
    const panel = orderPanel()
    const status = within(panel).getByLabelText('Holat')

    expect(status).toHaveValue('completed')
    await user.click(within(panel).getByRole('radio', { name: 'Yetkazib berish' }))
    expect(status).toHaveValue('ordered')
    expect(within(panel).getByLabelText('Manzil')).toBeInTheDocument()
    await user.click(within(panel).getByRole('radio', { name: 'Olib ketish' }))
    expect(status).toHaveValue('completed')

    await user.selectOptions(status, "Yo'lda")
    await user.click(within(panel).getByRole('radio', { name: 'Yetkazib berish' }))
    expect(status).toHaveValue('on_the_way')
  })

  it('does not create an empty order and supports Ctrl+Enter', async () => {
    const creates = recordRequests('post', '/api/v1/sales')
    const { user } = renderApp('/sales')
    await screen.findByRole('region', { name: 'Yangi buyurtma' })

    expect(within(orderPanel()).getByRole('button', { name: 'Buyurtma yaratish' })).toBeDisabled()
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(await screen.findByText("Avval mahsulot qo'shing")).toBeInTheDocument()
    expect(creates).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Pepperoni,/ }))
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0].body).toMatchObject({ items: [{ product_id: 5, quantity: 1 }] })
  })

  it('focuses the product search with "/" and filters by category', async () => {
    const { user } = renderApp('/sales')
    const search = await screen.findByRole('searchbox', { name: 'Mahsulot qidirish…' })

    await user.keyboard('/')
    expect(search).toHaveFocus()
    await user.type(search, 'pepp')
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Pepperoni,/ })).toBeInTheDocument()

    await user.clear(search)
    await user.click(screen.getByRole('button', { name: 'Ichimliklar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Buyurtmaga qo'shish: Pepperoni,/ })).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Limonad,/ })).toBeInTheDocument()
  })

  it('explains a product that disappeared from the catalog', async () => {
    server.use(
      http.post('/api/v1/sales', () => HttpResponse.json({ error: 'product_not_found', detail: [1] }, { status: 400 })),
    )
    const { user } = renderApp('/sales')
    await user.click(await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ }))
    await user.click(within(orderPanel()).getByRole('button', { name: 'Buyurtma yaratish' }))
    expect(await screen.findByText("Ba'zi mahsulotlar endi mavjud emas — sahifani yangilang")).toBeInTheDocument()
  })
})

describe('the count on a tile', () => {
  it('goes up and down right where the product was added', async () => {
    const { user } = renderApp('/sales')
    await user.click(await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ }))

    const tile = screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,.* · Buyurtmada: 1$/ }).closest('.tile')!
    const stepper = within(tile as HTMLElement).getByRole('group', { name: 'Chizburger: Buyurtmada' })
    await user.click(within(stepper).getByRole('button', { name: "Ko'paytirish: Chizburger" }))
    await user.click(within(stepper).getByRole('button', { name: "Ko'paytirish: Chizburger" }))
    expect(stepper).toHaveTextContent('3')
    expect(within(orderPanel()).getByText('3 ta')).toBeInTheDocument()

    await user.click(within(stepper).getByRole('button', { name: 'Kamaytirish: Chizburger' }))
    expect(within(orderPanel()).getByText('2 ta')).toBeInTheDocument()
    await user.click(within(stepper).getByRole('button', { name: 'Kamaytirish: Chizburger' }))
    await user.click(within(stepper).getByRole('button', { name: 'Kamaytirish: Chizburger' }))
    // Back to zero: out of the order, the tile offers "+ Qo'shish" again.
    expect(within(tile as HTMLElement).queryByRole('group')).not.toBeInTheDocument()
    expect(within(orderPanel()).queryByText('Chizburger')).not.toBeInTheDocument()
  })
})

describe('frozen products at the point of sale', () => {
  it('shows them muted, warns in the order panel and still sells them', async () => {
    const creates = recordRequests('post', '/api/v1/sales')
    const { user } = renderApp('/sales')

    const tile = await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Naggetslar,.* · Muzlatilgan$/ })
    expect(tile.closest('.tile')).toHaveClass('is-frozen')
    expect(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ }).closest('.tile')).not.toHaveClass(
      'is-frozen',
    )
    expect(within(orderPanel()).queryByText(/Muzlatilgan mahsulot/)).not.toBeInTheDocument()

    await user.click(tile)
    const panel = orderPanel()
    expect(within(panel).getByText('Muzlatilgan mahsulot: Naggetslar')).toBeInTheDocument()
    expect(within(panel).getByText('Mijozlar hozir buyurtma qila olmaydi, siz baribir sotishingiz mumkin.')).toBeInTheDocument()
    // The order line carries the mark too.
    const lines = within(panel).getByRole('list', { name: 'Buyurtma mahsulotlari' })
    expect(within(lines).getByText('Muzlatilgan')).toBeInTheDocument()

    // Nothing is blocked: the sale goes through with the frozen product.
    await user.click(within(panel).getByRole('button', { name: 'Buyurtma yaratish' }))
    expect(await screen.findByText(/^Buyurtma yaratildi/)).toBeInTheDocument()
    expect(creates[0].body).toMatchObject({ items: [{ product_id: 13, quantity: 1 }] })
    await waitFor(() => expect(within(orderPanel()).queryByText(/Muzlatilgan mahsulot/)).not.toBeInTheDocument())
  })

  it('returns a product to sale in one tap — the warning goes away', async () => {
    const patches = recordRequests('patch', '/api/v1/products/13')
    const { user } = renderApp('/sales')
    await user.click(await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Naggetslar,/ }))
    await user.click(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ }))
    const panel = orderPanel()

    await user.click(within(panel).getByRole('button', { name: 'Sotuvga qaytarish: Naggetslar' }))

    await waitFor(() => expect(within(panel).queryByText(/Muzlatilgan mahsulot/)).not.toBeInTheDocument())
    expect(within(panel).queryByText('Muzlatilgan')).not.toBeInTheDocument()
    expect(patches[0].body).toEqual({ frozen: false })
    expect(await screen.findByText('«Naggetslar» sotuvga qaytarildi')).toBeInTheDocument()
    expect(store.db.products.find((product) => product.id === 13)?.frozen).toBe(false)
    // The order keeps both lines; the tile is an ordinary one again.
    expect(within(panel).getByText('Naggetslar')).toBeInTheDocument()
    expect(within(panel).getByText('Chizburger')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Naggetslar,/ }).closest('.tile')).not.toHaveClass(
      'is-frozen',
    )
  })

  it('lists several frozen products, each with its own button', async () => {
    resetDb((db) => {
      db.products[13].frozen = true // Sezar salati
    })
    const { user } = renderApp('/sales')
    await user.click(await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Naggetslar,/ }))
    await user.click(screen.getByRole('button', { name: /^Buyurtmaga qo'shish: Sezar salati,/ }))

    const panel = orderPanel()
    expect(within(panel).getByText('Muzlatilgan mahsulotlar')).toBeInTheDocument()
    expect(within(panel).getByText('Mijozlar ularni hozir buyurtma qila olmaydi, siz baribir sotishingiz mumkin.')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Sotuvga qaytarish: Naggetslar' })).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Sotuvga qaytarish: Sezar salati' }))
    expect(await within(panel).findByText('Muzlatilgan mahsulot: Naggetslar')).toBeInTheDocument()
  })

  it('warns about a frozen product added by a voice / typed command too', async () => {
    const { user } = renderApp('/sales')
    await user.type(await screen.findByRole('textbox', { name: 'Yoki yozib yuboring…' }), '2 ta naggetslar{Enter}')

    const panel = orderPanel()
    expect(await within(panel).findByText('Muzlatilgan mahsulot: Naggetslar')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Sotuvga qaytarish: Naggetslar' })).toBeInTheDocument()
  })
})
