import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { backend } from './backend'
import { sampleBusinesses } from './fixtures'
import { renderApp } from './render'

const slugField = () => screen.getByLabelText('Manzil (subdomen)')
const checkedSlugs = () => backend.requests('GET', '/businesses/check-slug').map((request) => request.search.get('slug'))
const MAP_ADDRESS = "Bunyodkor ko'chasi, 3, Chilonzor tumani, Toshkent"

/** A click on the (fake) map: the pin lands in Chilonzor and the map server names the address. */
async function putOnMap(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Xaritaga bosish' }))
  await waitFor(() => expect(screen.getByLabelText('Biznes manzili')).toHaveValue(MAP_ADDRESS))
}

describe('new business', () => {
  it('generates the address from a Cyrillic name and checks it live (debounced)', async () => {
    backend.state.businesses = sampleBusinesses()
    const { user } = renderApp('/new')

    await user.type(await screen.findByLabelText('Nomi'), 'Бургер Хаус')

    expect(slugField()).toHaveValue('burger-xaus')
    // The preview of both addresses (under the field and in the side preview).
    expect(screen.getAllByText('burger-xaus.portex.uz').length).toBeGreaterThan(0)
    expect(screen.getAllByText('burger-xaus-admin.portex.uz').length).toBeGreaterThan(0)
    expect(screen.getByText('Tekshirilmoqda…')).toBeInTheDocument()
    expect(await screen.findByText("Manzil bo'sh")).toBeInTheDocument()
    // One request for the final address, none for the letters typed on the way.
    expect(checkedSlugs()).toEqual(['burger-xaus'])
  })

  it('keeps an address edited by hand and can take it from the name again', async () => {
    const { user } = renderApp('/new')
    const name = await screen.findByLabelText('Nomi')

    await user.type(name, 'Pizza')
    expect(slugField()).toHaveValue('pizza')

    await user.clear(slugField())
    await user.type(slugField(), 'My Pizza')
    expect(slugField()).toHaveValue('my-pizza')

    await user.type(name, ' Palace')
    expect(slugField()).toHaveValue('my-pizza')

    await user.click(screen.getByRole('button', { name: 'Nomdan olish' }))
    expect(slugField()).toHaveValue('pizza-palace')
    await user.type(name, ' 2')
    expect(slugField()).toHaveValue('pizza-palace-2')
  })

  it('tells why an address cannot be used', async () => {
    backend.state.businesses = sampleBusinesses()
    const { user } = renderApp('/new')

    await user.type(await screen.findByLabelText('Nomi'), 'Burger House')
    expect(await screen.findByText('Bu manzil boshqa biznesda ishlatilgan.')).toBeInTheDocument()
    expect(slugField()).toHaveAttribute('aria-invalid', 'true')

    await user.clear(slugField())
    await user.type(slugField(), 'admin')
    expect(await screen.findByText('Bu manzil band qilingan, boshqasini tanlang.')).toBeInTheDocument()

    await user.clear(slugField())
    await user.type(slugField(), 'burger-')
    expect(await screen.findByText(/Manzil 3–30 belgi/)).toBeInTheDocument()

    await user.clear(slugField())
    await user.type(slugField(), 'ab')
    expect(screen.getByText('Kamida 3 belgi.')).toBeInTheDocument()
    expect(checkedSlugs()).not.toContain('ab')
  })

  it('opens the business and shows the owner credentials once', async () => {
    backend.state.businesses = sampleBusinesses()
    const { user, router } = renderApp('/new')

    await user.type(await screen.findByLabelText('Nomi'), 'Ёқимли Таом')
    await user.type(screen.getByLabelText(/Qisqa shior/), 'Uy taomlari')
    await user.type(screen.getByLabelText(/Aloqa telefoni/), '712001122')
    await user.clear(screen.getByLabelText('Yetkazish vaqti (daqiqa)'))
    await user.type(screen.getByLabelText('Yetkazish vaqti (daqiqa)'), '40–60')
    const minOrder = screen.getByLabelText("Minimal buyurtma (so'm)")
    await user.clear(minOrder)
    await user.type(minOrder, '50000')
    expect(minOrder).toHaveValue('50 000')
    await user.click(screen.getByRole('radio', { name: 'Yashil' }))
    await user.type(screen.getByLabelText('Ismi'), 'Aziz')
    await user.type(screen.getByLabelText('Telefoni (login)'), '90 111 22 33')
    await putOnMap(user)
    await screen.findByText("Manzil bo'sh")

    await user.click(screen.getByRole('button', { name: 'Biznesni ochish' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Ёқимли Таом' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/b/yoqimli-taom')
    expect(screen.getByText('Ёқимли Таом ochildi')).toBeInTheDocument()

    const [create] = backend.requests('POST', '/businesses')
    expect(create?.headers['x-csrftoken']).toBe('csrf-token-1')
    expect(create?.body).toEqual({
      name: 'Ёқимли Таом',
      slug: 'yoqimli-taom',
      tagline: 'Uy taomlari',
      address: MAP_ADDRESS,
      lat: 41.2856,
      lng: 69.2035,
      support_phone: '+998 71 200 11 22',
      delivery_time: '40–60',
      min_order: 50000,
      brand_color: '#16a34a',
      owner_name: 'Aziz',
      owner_phone: '+998901112233',
      owner_password: '',
    })

    // The generated password, shown once with "copy all".
    const panel = screen.getByRole('region', { name: "Egasi uchun kirish ma'lumotlari — faqat hozir ko'rinadi" })
    expect(within(panel).getByText('yoqimli-taom-admin.portex.uz')).toBeInTheDocument()
    expect(within(panel).getByText('+998 90 111 22 33')).toBeInTheDocument()
    expect(within(panel).getByText('Gen-3rated-Pw')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Hammasini nusxalash' }))
    expect(await navigator.clipboard.readText()).toBe(
      'Admin panel: https://yoqimli-taom-admin.portex.uz/\nTelefon: +998901112233\nParol: Gen-3rated-Pw',
    )
    expect(await within(panel).findByRole('button', { name: 'Nusxalandi' })).toBeInTheDocument()

    // Gone from the history entry: coming back to the page does not show them again.
    await waitFor(() => expect(router.state.location.state).toBeNull())
    await router.navigate('/')
    await screen.findByRole('heading', { level: 1, name: 'Bizneslar' })
    await router.navigate('/b/yoqimli-taom')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ёқимли Таом' })).toBeInTheDocument()
    expect(screen.queryByText('Gen-3rated-Pw')).not.toBeInTheDocument()
  })

  it('checks the form before sending it', async () => {
    const { user } = renderApp('/new')

    await user.click(await screen.findByRole('button', { name: 'Biznesni ochish' }))

    expect(screen.getByText('Biznes nomini kiriting')).toBeInTheDocument()
    expect(screen.getByText('Manzilni kiriting')).toBeInTheDocument()
    expect(screen.getByText('Xaritada biznes joyini belgilang')).toBeInTheDocument()
    expect(screen.getByText('Biznes manzilini kiriting')).toBeInTheDocument()
    expect(screen.getByText('Egasining ismini kiriting')).toBeInTheDocument()
    expect(screen.getByText('Telefon raqamini kiriting')).toBeInTheDocument()
    expect(screen.getByLabelText('Nomi')).toHaveFocus()

    await user.type(screen.getByLabelText('Nomi'), 'Somsa Markazi')
    await user.type(screen.getByLabelText('Ismi'), 'Aziz')
    await user.type(screen.getByLabelText('Telefoni (login)'), '123')
    await user.type(screen.getByLabelText(/^Parol/), 'short')
    await putOnMap(user)
    expect(screen.queryByText('Xaritada biznes joyini belgilang')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Biznesni ochish' }))

    expect(screen.getByText("Telefon raqami noto'g'ri")).toBeInTheDocument()
    expect(screen.getByText("Kamida 8 belgi (yoki bo'sh qoldiring)")).toBeInTheDocument()
    expect(screen.getByLabelText('Telefoni (login)')).toHaveFocus()
    expect(backend.requests('POST', '/businesses')).toHaveLength(0)
  })

  it('shows field errors from the API next to the fields', async () => {
    const { user } = renderApp('/new')

    await user.type(await screen.findByLabelText('Nomi'), 'Somsa Markazi')
    await user.type(screen.getByLabelText('Ismi'), 'Aziz')
    // A valid number for the form, but not an Uzbek one: the API answers fields.owner_phone = ["invalid"].
    await user.type(screen.getByLabelText('Telefoni (login)'), '+1 555 000 0000')
    await putOnMap(user)
    await screen.findByText("Manzil bo'sh")
    await user.click(screen.getByRole('button', { name: 'Biznesni ochish' }))

    expect(await screen.findByText("Telefon raqami noto'g'ri")).toBeInTheDocument()
    expect(screen.getByLabelText('Telefoni (login)')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Biznesni ochish' })).toBeEnabled()
  })

  it('uploads the logo as multipart with a preview', async () => {
    const append = vi.spyOn(FormData.prototype, 'append')
    const { user } = renderApp('/new')

    await user.type(await screen.findByLabelText('Nomi'), 'Lavash Club')
    await user.upload(screen.getByLabelText(/^Logo/), new File(['png-bytes'], 'lavash.png', { type: 'image/png' }))
    expect(screen.getByText('lavash.png')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Ismi'), 'Aziz')
    await user.type(screen.getByLabelText('Telefoni (login)'), '901112233')
    await putOnMap(user)
    await screen.findByText("Manzil bo'sh")
    await user.click(screen.getByRole('button', { name: 'Biznesni ochish' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Lavash Club' })).toBeInTheDocument()
    const [create] = backend.requests('POST', '/businesses')
    expect(create?.headers['content-type']).toMatch(/^multipart\/form-data/)
    expect(create?.body).toMatchObject({
      name: 'Lavash Club',
      slug: 'lavash-club',
      min_order: '0',
      address: MAP_ADDRESS,
      lat: '41.2856',
      lng: '69.2035',
      logo: { type: 'image/png' },
    })
    // The file goes with its name (Vitest's jsdom → Node fetch bridge drops file names on the wire; browsers do not).
    expect(append).toHaveBeenCalledWith('logo', expect.objectContaining({ name: 'lavash.png' }), 'lavash.png')
    expect(backend.business('lavash-club').logo).toMatch(/^\/media\/lavash_club\/logos\//)
  })

  it('puts the business on the map: a search, a pasted point or a click', async () => {
    const { user } = renderApp('/new')
    const search = await screen.findByLabelText('Xaritadan qidirish')
    const address = screen.getByLabelText('Biznes manzili')

    // A search on Enter (the form is not sent): the chosen place brings its own address.
    await user.type(search, 'Chorsu{Enter}')
    const found = await screen.findByRole('list', { name: 'Topilgan joylar' })
    expect(within(found).getAllByRole('button')).toHaveLength(2)
    await user.click(within(found).getByRole('button', { name: 'Chorsu bozori, Shayxontohur tumani, Toshkent' }))
    expect(address).toHaveValue('Chorsu bozori, Shayxontohur tumani, Toshkent')
    expect(screen.getByText('41.326600, 69.235300')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Yandex Kartada tekshirish/ })).toHaveAttribute(
      'href',
      'https://yandex.uz/maps/?pt=69.2353,41.3266&z=17&l=map',
    )
    expect(backend.requests('GET', '/geo/search')[0]?.search.get('q')).toBe('Chorsu')
    expect(backend.requests('POST', '/businesses')).toHaveLength(0)

    // An address typed by hand stays when the pin moves.
    await user.clear(address)
    await user.type(address, "Chorsu, mo'ljal: metro")
    await user.click(screen.getByRole('button', { name: 'Xaritaga bosish' }))
    expect(await screen.findByText('41.285600, 69.203500')).toBeInTheDocument()
    await waitFor(() => expect(backend.requests('GET', '/geo/reverse')).toHaveLength(1))
    expect(address).toHaveValue("Chorsu, mo'ljal: metro")

    // A point copied from Yandex Maps (longitude first) needs no search.
    await user.clear(search)
    await user.type(search, 'https://yandex.uz/maps/?ll=69.240562%2C41.299496&z=16')
    await user.click(screen.getByRole('button', { name: 'Topish' }))
    expect(await screen.findByText('41.299496, 69.240562')).toBeInTheDocument()
    expect(backend.requests('GET', '/geo/search')).toHaveLength(1)
  })

  it('works when the map server is out of reach', async () => {
    backend.state.geo.down = true
    const { user } = renderApp('/new')

    await user.type(await screen.findByLabelText('Xaritadan qidirish'), 'Chorsu')
    await user.click(screen.getByRole('button', { name: 'Topish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Manzil qidiruvi hozir ishlamayapti — joyni xaritada o'zingiz belgilang.",
    )
    await user.click(screen.getByRole('button', { name: 'Xaritaga bosish' }))
    expect(await screen.findByText('41.285600, 69.203500')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Manzil aniqlanmoqda…')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Biznes manzili')).toHaveValue('')
  })

  it('rejects files that are not images', async () => {
    // A file manager may still offer other files (drag and drop ignores `accept` too).
    const { user } = renderApp('/new', { user: { applyAccept: false } })
    await user.upload(await screen.findByLabelText(/^Logo/), new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' }))
    expect(screen.getByText('Faqat PNG, JPG, WEBP yoki GIF rasm yuklang')).toBeInTheDocument()
  })

  it('asks before leaving a filled form', async () => {
    const { user, router } = renderApp('/new')

    await user.type(await screen.findByLabelText('Nomi'), 'Choyxona')
    await user.click(screen.getByRole('link', { name: 'Bekor qilish' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Sahifadan chiqilsinmi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Qolish' }))
    expect(router.state.location.pathname).toBe('/new')
    expect(screen.getByLabelText('Nomi')).toHaveValue('Choyxona')

    await user.click(screen.getByRole('link', { name: 'Bekor qilish' }))
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Sahifadan chiqilsinmi?' })).getByRole('button', {
        name: 'Chiqish',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
