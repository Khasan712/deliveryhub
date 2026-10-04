import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { formatPriceInput, productRequestBody, validateProductForm, EMPTY_PRODUCT_FORM } from '../features/products/productForm'
import { translate } from '../i18n/translate'
import { resetDb, store } from '../mocks/data'
import { locationOf, renderApp } from './render'
import { recordRequests, server } from './server'

const t = (key: Parameters<typeof translate>[1]) => translate('uz', key)

describe('product form helpers', () => {
  it('groups the price by thousands while typing', () => {
    expect(formatPriceInput('35000')).toBe('35 000')
    expect(formatPriceInput('1 2a3,4.5')).toBe('12 345')
    expect(formatPriceInput('0007')).toBe('7')
    expect(formatPriceInput('')).toBe('')
  })

  it('requires both names and a whole non-negative price', () => {
    expect(validateProductForm(EMPTY_PRODUCT_FORM, t)).toEqual({
      name_uz: 'Majburiy maydon',
      name_ru: 'Majburiy maydon',
      price: 'Majburiy maydon',
    })
    expect(validateProductForm({ ...EMPTY_PRODUCT_FORM, name_uz: 'a', name_ru: 'b', price: '2 000 000 000' }, t)).toEqual({
      price: 'Qiymat juda katta',
    })
    expect(validateProductForm({ ...EMPTY_PRODUCT_FORM, name_uz: 'a', name_ru: 'b', price: '12 500' }, t)).toEqual({})
  })

  it('sends JSON without a file, multipart with a file and image: null to remove the image', () => {
    const form = { ...EMPTY_PRODUCT_FORM, name_uz: ' Lavash ', name_ru: 'Лаваш', price: '28 000', category_id: '2' }
    expect(productRequestBody(form, null, false)).toEqual({
      name_uz: 'Lavash',
      name_ru: 'Лаваш',
      price: 28000,
      desc_uz: '',
      desc_ru: '',
      unit_id: null,
      category_id: 2,
      frozen: false,
    })
    expect(productRequestBody(form, null, true)).toMatchObject({ image: null })

    const file = new File(['png'], 'lavash.png', { type: 'image/png' })
    const multipart = productRequestBody({ ...form, frozen: true }, file, false) as FormData
    expect(multipart).toBeInstanceOf(FormData)
    expect(multipart.get('price')).toBe('28000')
    expect(multipart.get('unit_id')).toBe('')
    expect(multipart.get('frozen')).toBe('true')
    expect((multipart.get('image') as File).name).toBe('lavash.png')
  })
})

describe('products', () => {
  it('validates the form without sending a request', async () => {
    const creates = recordRequests('post', '/api/v1/products')
    const { user } = renderApp('/products/new')

    await user.click(await screen.findByRole('button', { name: 'Mahsulot yaratish' }))

    expect(screen.getAllByText('Majburiy maydon')).toHaveLength(3)
    expect(screen.getByLabelText(/Nomi \(O'zbekcha\)/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Nomi \(O'zbekcha\)/)).toHaveFocus()
    expect(creates).toHaveLength(0)
  })

  it('creates a product with an image (multipart) after showing a preview', async () => {
    const creates = recordRequests('post', '/api/v1/products')
    const { user, router } = renderApp('/products/new')

    await user.type(await screen.findByLabelText(/Nomi \(O'zbekcha\)/), 'Lavash')
    await user.type(screen.getByLabelText(/Nomi \(Ruscha\)/), 'Лаваш')
    const price = screen.getByLabelText(/Narxi/)
    await user.type(price, '28000')
    expect(price).toHaveValue('28 000')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Burgerlar' })).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Kategoriya'), 'Burgerlar')
    await user.selectOptions(screen.getByLabelText("O'lchov birligi"), 'dona')

    const file = new File(['fake-png-bytes'], 'lavash.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(/Rasmni shu yerga tashlang/), file)
    const preview = screen.getByRole('img', { name: 'Mahsulot rasmi' })
    expect(preview.getAttribute('src')).toMatch(/^blob:/)
    expect(screen.getByText(/lavash\.png/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mahsulot yaratish' }))

    expect(await screen.findByText("Mahsulot qo'shildi")).toBeInTheDocument()
    expect(locationOf(router)).toBe('/products')
    const body = creates[0].body as FormData
    expect(creates[0].headers.get('content-type')).toMatch(/^multipart\/form-data/)
    expect(body.get('name_uz')).toBe('Lavash')
    expect(body.get('name_ru')).toBe('Лаваш')
    expect(body.get('price')).toBe('28000')
    expect(body.get('category_id')).toBe('1')
    expect(body.get('unit_id')).toBe('1')
    expect((body.get('image') as File).name).toBe('lavash.png')
    expect(await screen.findByRole('link', { name: 'Lavash' })).toBeInTheDocument()
  })

  it('accepts images only (e.g. a PDF dropped on the zone)', async () => {
    renderApp('/products/new')
    // The file dialog filters by `accept`; drag & drop does not — the picker checks the type itself.
    const user = userEvent.setup({ applyAccept: false })
    const input = await screen.findByLabelText(/Rasmni shu yerga tashlang/)
    await user.upload(input, new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Faqat rasm fayllari')
    expect(screen.queryByRole('img', { name: 'Mahsulot rasmi' })).not.toBeInTheDocument()
  })

  it('shows server-side field errors next to the fields', async () => {
    server.use(
      http.post('/api/v1/products', () =>
        HttpResponse.json({ error: 'validation', fields: { name_ru: ['unique'] } }, { status: 400 }),
      ),
    )
    const { user } = renderApp('/products/new')
    await user.type(await screen.findByLabelText(/Nomi \(O'zbekcha\)/), 'Chizburger')
    await user.type(screen.getByLabelText(/Nomi \(Ruscha\)/), 'Чизбургер')
    await user.type(screen.getByLabelText(/Narxi/), '32000')
    await user.click(screen.getByRole('button', { name: 'Mahsulot yaratish' }))

    expect(await screen.findByText('Bu qiymat allaqachon band')).toBeInTheDocument()
    expect(screen.getByLabelText(/Nomi \(Ruscha\)/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('edits a product and removes its image with image: null', async () => {
    const patches = recordRequests('patch', '/api/v1/products/1')
    const { user } = renderApp('/products/1/edit')

    const name = await screen.findByDisplayValue('Chizburger')
    expect(screen.getByLabelText(/Narxi/)).toHaveValue('32 000')
    await user.clear(name)
    await user.type(name, 'Chizburger XL')
    await user.click(screen.getByRole('button', { name: "Rasmni o'chirish" }))
    expect(screen.getByText("Saqlanganda rasm o'chiriladi")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))

    expect(await screen.findByText('Mahsulot saqlandi')).toBeInTheDocument()
    expect(patches[0].body).toMatchObject({ name_uz: 'Chizburger XL', price: 32000, image: null, category_id: 1, unit_id: 1 })
    expect(store.db.products.find((product) => product.id === 1)?.image).toBeNull()
  })

  it('filters the list by category and search', async () => {
    const requests = recordRequests('get', '/api/v1/products')
    const { user } = renderApp('/products')
    expect(await screen.findByRole('link', { name: 'Muzqaymoq' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Kategoriya' }), 'Pitsa')
    await waitFor(() => expect(requests.at(-1)!.url.searchParams.get('category')).toBe('2'))
    expect(await screen.findByRole('link', { name: 'Pepperoni' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Muzqaymoq' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'marg')
    await waitFor(() => expect(requests.at(-1)!.url.searchParams.get('search')).toBe('marg'))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Pepperoni' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Margarita' })).toBeInTheDocument()
  })

  it('deletes a product after confirmation', async () => {
    const deletes = recordRequests('delete', '/api/v1/products/16')
    const { user } = renderApp('/products')

    await user.click(await screen.findByRole('button', { name: "O'chirish: Muzqaymoq" }))
    const dialog = await screen.findByRole('dialog', { name: "Mahsulotni o'chirish" })
    expect(dialog).toHaveTextContent("«Muzqaymoq» mahsuloti o'chiriladi")
    await user.click(within(dialog).getByRole('button', { name: 'Bekor qilish' }))
    expect(deletes).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: "O'chirish: Muzqaymoq" }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: "Ha, o'chirish" }))

    expect(await screen.findByText("Mahsulot o'chirildi")).toBeInTheDocument()
    expect(deletes).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Muzqaymoq' })).not.toBeInTheDocument())
  })

  it('warns before leaving a form with unsaved changes', async () => {
    const { user, router } = renderApp('/products/new')
    await user.type(await screen.findByLabelText(/Nomi \(O'zbekcha\)/), 'Somsa')

    await user.click(screen.getByRole('link', { name: 'Kategoriyalar' }))
    const dialog = await screen.findByRole('dialog', { name: "Saqlanmagan o'zgarishlar" })
    await user.click(within(dialog).getByRole('button', { name: 'Qolish' }))
    expect(locationOf(router)).toBe('/products/new')

    await user.click(screen.getByRole('link', { name: 'Kategoriyalar' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Chiqish' }))
    await waitFor(() => expect(locationOf(router)).toBe('/categories'))
  })
})

describe('freezing products', () => {
  it('freezes a product from the list at once, and the toast can undo it', async () => {
    const patches = recordRequests('patch', '/api/v1/products/1')
    const { user } = renderApp('/products')
    const row = (await screen.findByRole('link', { name: 'Chizburger' })).closest('tr')!
    expect(within(row).queryByText('Muzlatilgan')).not.toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Muzlatish: Chizburger' }))

    expect(await within(row).findByText('Muzlatilgan')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Sotuvga qaytarish: Chizburger' })).toBeInTheDocument()
    expect(await screen.findByText('«Chizburger» muzlatildi')).toBeInTheDocument()
    expect(screen.getByText('Mijozlar uni hozir buyurtma qila olmaydi')).toBeInTheDocument()
    expect(patches[0].body).toEqual({ frozen: true })
    expect(store.db.products.find((product) => product.id === 1)).toMatchObject({ frozen: true })

    await user.click(screen.getByRole('button', { name: 'Bekor qilish' }))
    expect(await screen.findByText('«Chizburger» sotuvga qaytarildi')).toBeInTheDocument()
    expect(patches[1].body).toEqual({ frozen: false })
    await waitFor(() => expect(within(row).queryByText('Muzlatilgan')).not.toBeInTheDocument())
    expect(store.db.products.find((product) => product.id === 1)).toMatchObject({ frozen: false, frozen_at: null })
  })

  it('returns a frozen product to sale and puts the list back if the request fails', async () => {
    server.use(http.patch('/api/v1/products/13', () => HttpResponse.json({ error: 'not_found' }, { status: 404 })))
    const { user } = renderApp('/products')
    const row = (await screen.findByRole('link', { name: 'Naggetslar' })).closest('tr')!
    expect(within(row).getByText('Muzlatilgan')).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Sotuvga qaytarish: Naggetslar' }))

    expect(await screen.findByText('Topilmadi')).toBeInTheDocument()
    expect(within(row).getByText('Muzlatilgan')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Sotuvga qaytarish: Naggetslar' })).toBeInTheDocument()
  })

  it('filters by availability (kept in the URL) and counts the frozen products', async () => {
    const requests = recordRequests('get', '/api/v1/products')
    const { user, router } = renderApp('/products')
    await screen.findByRole('link', { name: 'Chizburger' })

    const frozenTab = screen.getByRole('button', { name: 'Muzlatilgan 1' })
    await user.click(frozenTab)
    await waitFor(() => expect(requests.at(-1)!.url.searchParams.get('frozen')).toBe('true'))
    expect(locationOf(router)).toBe('/products?frozen=true')
    expect(frozenTab).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Chizburger' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Naggetslar' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sotuvda' }))
    await waitFor(() => expect(requests.at(-1)!.url.searchParams.get('frozen')).toBe('false'))
    expect(await screen.findByRole('link', { name: 'Chizburger' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Naggetslar' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Hammasi' }))
    await waitFor(() => expect(requests.at(-1)!.url.searchParams.has('frozen')).toBe(false))
    expect(locationOf(router)).toBe('/products')
  })

  it('explains an empty "Frozen" tab', async () => {
    resetDb((db) => {
      for (const product of db.products) product.frozen = false
    })
    renderApp('/products?frozen=true')
    expect(await screen.findByText("Muzlatilgan mahsulot yo'q")).toBeInTheDocument()
    expect(screen.getByText(/Hamma mahsulotlar sotuvda/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Muzlatilgan' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('freezes a product from its form, saved with the other fields', async () => {
    const patches = recordRequests('patch', '/api/v1/products/1')
    const { user } = renderApp('/products/1/edit')
    await screen.findByDisplayValue('Chizburger')

    const toggle = screen.getByRole('switch', { name: 'Muzlatilgan' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveAccessibleDescription(/«Hozir mavjud emas» deb ko'radi/)
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))

    expect(await screen.findByText('Mahsulot saqlandi')).toBeInTheDocument()
    expect(patches[0].body).toMatchObject({ name_uz: 'Chizburger', price: 32000, frozen: true })
    const row = (await screen.findByRole('link', { name: 'Chizburger' })).closest('tr')!
    expect(within(row).getByText('Muzlatilgan')).toBeInTheDocument()
  })

  it('shows a frozen product as such on its form and returns it to sale', async () => {
    const patches = recordRequests('patch', '/api/v1/products/13')
    const { user } = renderApp('/products/13/edit')
    await screen.findByDisplayValue('Naggetslar')

    const toggle = screen.getByRole('switch', { name: 'Muzlatilgan' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/^Muzlatilgan: /)).toBeInTheDocument()
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))

    expect(await screen.findByText('Mahsulot saqlandi')).toBeInTheDocument()
    expect(patches[0].body).toMatchObject({ frozen: false })
    expect(store.db.products.find((product) => product.id === 13)).toMatchObject({ frozen: false, frozen_at: null })
  })
})
