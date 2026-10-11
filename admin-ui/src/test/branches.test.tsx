import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { branchAccess } from '../auth/session'
import { branchVars, formatDistance, uzDative } from '../lib/branches'
import { parsePoint, toPoint } from '../lib/map'
import { BRANCH_USER_ID, withBranches } from '../mocks/branches'
import { store } from '../mocks/data'
import { MAP_CLICK } from './fixtures'
import { locationOf, renderApp } from './render'
import { recordRequests } from './server'
import { viewport } from './setup'

function card(name: string) {
  return screen.getByRole('link', { name }).closest('article')!
}

describe('branches off (the default): everything as before', () => {
  it('shows nothing of branches anywhere', async () => {
    const { user } = renderApp('/orders')
    const nav = await screen.findByRole('navigation', { name: 'Admin panel' })
    expect(within(nav).queryByRole('link', { name: 'Filiallar' })).not.toBeInTheDocument()
    await screen.findByRole('link', { name: '#163' })
    expect(screen.queryByRole('combobox', { name: 'Filial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Filial' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'dona' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Filial tanlanmagan/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '#163' }))
    expect(await screen.findByRole('heading', { name: "Buyurtma mahsulotlari" })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Filial' })).not.toBeInTheDocument()
  })

  it('keeps the branches page closed and the role list as it was', async () => {
    renderApp('/branches')
    expect(await screen.findByText('Filiallar bu biznes uchun yoqilmagan.')).toBeInTheDocument()

    renderApp('/users/new')
    expect(await screen.findByRole('radio', { name: /^Menejer/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Filial admini/ })).not.toBeInTheDocument()
  })

  it('lets a branch admin work like a manager', async () => {
    withBranches(store.db)
    store.db.business.branches_enabled = false
    renderApp('/', { as: 'branch' })
    const nav = await screen.findByRole('navigation', { name: 'Admin panel' })
    expect(within(nav).getByRole('link', { name: 'Mijozlar' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Kategoriyalar' })).toBeInTheDocument()
    expect(screen.queryByText('Chilonzor filiali')).not.toBeInTheDocument()
  })
})

describe('branches page (admin)', () => {
  it('lists the branches with today, staff and how orders are split, all on a map', async () => {
    withBranches(store.db)
    renderApp('/branches')

    expect(await screen.findByRole('heading', { level: 1, name: 'Filiallar' })).toBeInTheDocument()
    expect(await screen.findByText('4 ta filial · 3 ta faol')).toBeInTheDocument()
    expect(screen.getByText(/Yetkazib berish buyurtmalari avval sizga keladi/)).toBeInTheDocument()

    const chilonzor = card('Chilonzor')
    expect(within(chilonzor).getByText('Faol')).toBeInTheDocument()
    expect(within(chilonzor).getByRole('link', { name: '+998 71 200 11 01' })).toHaveAttribute('href', 'tel:+998712001101')
    // Its staff, by first name, each a tap from their page; one more a tap away.
    const staff = within(chilonzor).getByRole('region', { name: 'Xodimlar · 2' })
    expect(within(staff).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'BXBobur Xolmatov+998 90 111 22 44',
      'JQJahongir Qodirov+998 97 700 44 55',
    ])
    expect(within(staff).getByRole('link', { name: 'Bobur Xolmatov' })).toHaveAttribute('href', `/users/${BRANCH_USER_ID}/edit`)
    expect(within(chilonzor).getByRole('link', { name: "Xodim qo'shish: Chilonzor" })).toHaveAttribute(
      'href',
      '/users/new?role=branch&branch=1',
    )
    const sergeli = card('Sergeli')
    expect(within(sergeli).getByText('Nofaol')).toBeInTheDocument()
    expect(within(sergeli).getByText("Hali xodim yo'q")).toBeInTheDocument()
    // A stopped branch takes no new staff.
    expect(within(sergeli).queryByRole('link', { name: /^Xodim qo'shish/ })).not.toBeInTheDocument()

    const map = await screen.findByRole('region', { name: 'Xarita: filiallar' })
    const pins = within(map).getAllByRole('listitem')
    expect(pins.map((pin) => pin.dataset.tone)).toEqual(['branch', 'branch', 'branch', 'muted'])
    expect(within(map).getByRole('button', { name: 'Xaritada: Chilonzor' })).toBeInTheDocument()
  })

  it('creates a branch: its place picked on the map fills in the address', async () => {
    withBranches(store.db)
    const creates = recordRequests('post', '/api/v1/branches')
    const sessions = recordRequests('get', '/api/v1/auth/me')
    const { user, router } = renderApp('/branches')

    await user.click(await screen.findByRole('link', { name: "Filial qo'shish" }))
    expect(await screen.findByRole('heading', { name: "Filial qo'shish" })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Filial nomi/), 'Olmazor')
    await user.click(await screen.findByRole('button', { name: 'Xaritaga bosish' }))
    expect(screen.getByText(`Belgi: ${MAP_CLICK.lat}, ${MAP_CLICK.lng}`)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText(/^Manzil/)).toHaveValue("Bunyodkor shoh ko'chasi, 42, Chilonzor tumani, Toshkent"),
    )
    await user.type(screen.getByLabelText('Telefon'), '71 200 11 09')
    const loaded = sessions.length
    await user.click(screen.getByRole('button', { name: 'Filial yaratish' }))

    expect(await screen.findByText("Filial qo'shildi")).toBeInTheDocument()
    expect(creates[0].body).toEqual({
      name: 'Olmazor',
      address: "Bunyodkor shoh ko'chasi, 42, Chilonzor tumani, Toshkent",
      lat: MAP_CLICK.lat,
      lng: MAP_CLICK.lng,
      phone: '71 200 11 09',
    })
    expect(locationOf(router)).toBe('/branches')
    expect(await screen.findByRole('link', { name: 'Olmazor' })).toBeInTheDocument()
    // The session is read again: how many branches work decides whether orders wait for the head office.
    await waitFor(() => expect(sessions.length).toBeGreaterThan(loaded))
  })

  it('checks the form first', async () => {
    withBranches(store.db)
    const creates = recordRequests('post', '/api/v1/branches')
    const { user } = renderApp('/branches/new')
    await user.click(await screen.findByRole('button', { name: 'Filial yaratish' }))
    expect(screen.getAllByText('Majburiy maydon')).toHaveLength(2)
    expect(screen.getByText('Joyni xaritada belgilang')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Filial nomi/)).toHaveFocus()
    expect(creates).toHaveLength(0)
  })

  it('finds a place by its name or by a link of Yandex Maps', async () => {
    withBranches(store.db)
    const { user } = renderApp('/branches/new')

    const search = await screen.findByRole('searchbox', { name: 'Xaritadan qidirish' })
    await user.type(search, 'Chorsu{Enter}')
    const results = await screen.findByRole('list', { name: 'Topilgan joylar' })
    await user.click(within(results).getByRole('button', { name: 'Chorsu bozori, Shayxontohur tumani, Toshkent' }))
    expect(await screen.findByText('Belgi: 41.3266, 69.2353')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Manzil/)).toHaveValue('Chorsu bozori, Shayxontohur tumani, Toshkent')

    // A typed address stays: only an address filled in from the map is replaced.
    await user.clear(screen.getByLabelText(/^Manzil/))
    await user.type(screen.getByLabelText(/^Manzil/), "Chorsu, 2-qavat")
    await user.clear(search)
    await user.type(search, 'https://yandex.uz/maps/?ll=69.240562%2C41.299496&z=12')
    await user.click(screen.getByRole('button', { name: 'Topish' }))
    expect(await screen.findByText('Belgi: 41.299496, 69.240562')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Manzil/)).toHaveValue('Chorsu, 2-qavat')
  })

  it('says when the address search is out of reach', async () => {
    withBranches(store.db)
    store.db.geoDown = true
    const { user } = renderApp('/branches/new')
    await user.type(await screen.findByRole('searchbox', { name: 'Xaritadan qidirish' }), 'Chorsu{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Manzil qidiruvi hozir ishlamayapti')
  })

  it('edits a branch', async () => {
    withBranches(store.db)
    const patches = recordRequests('patch', '/api/v1/branches/2')
    const { user } = renderApp('/branches/2/edit')
    const name = await screen.findByDisplayValue('Yunusobod')
    expect(screen.getByText('Belgi: 41.36479, 69.28853')).toBeInTheDocument()
    await user.clear(name)
    await user.type(name, 'Yunusobod 4')
    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))
    expect(await screen.findByText('Filial saqlandi')).toBeInTheDocument()
    expect(patches[0].body).toEqual({
      name: 'Yunusobod 4',
      address: "Amir Temur shoh ko'chasi, 107, Yunusobod tumani",
      lat: 41.36479,
      lng: 69.28853,
      phone: '+998712001102',
      is_active: true,
    })
  })

  it('stops a branch after asking, and starts it again', async () => {
    withBranches(store.db)
    const patches = recordRequests('patch', '/api/v1/branches/:id')
    const { user } = renderApp('/branches')

    await user.click(await screen.findByRole('button', { name: 'Faolsizlantirish: Yunusobod' }))
    const dialog = await screen.findByRole('dialog', { name: '«Yunusobod» faolsizlantirilsinmi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Faolsizlantirish' }))
    expect(await screen.findByText('«Yunusobod» faolsizlantirildi')).toBeInTheDocument()
    expect(patches[0].body).toEqual({ is_active: false })
    await waitFor(() => expect(within(card('Yunusobod')).getByText('Nofaol')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Faollashtirish: Sergeli' }))
    expect(await screen.findByText('«Sergeli» faollashtirildi')).toBeInTheDocument()
    expect(patches[1].body).toEqual({ is_active: true })
  })

  it('offers to stop a branch with orders instead of deleting it', async () => {
    withBranches(store.db)
    const patches = recordRequests('patch', '/api/v1/branches/1')
    const { user } = renderApp('/branches')

    await user.click(await screen.findByRole('button', { name: "O'chirish: Chilonzor" }))
    await user.click(within(await screen.findByRole('dialog', { name: "Filialni o'chirish" })).getByRole('button', { name: "Ha, o'chirish" }))
    const dialog = await screen.findByRole('dialog', { name: "Filialni o'chirib bo'lmaydi" })
    expect(dialog).toHaveTextContent("Uning o'rniga faolsizlantiring")
    await user.click(within(dialog).getByRole('button', { name: 'Faolsizlantirish' }))
    await waitFor(() => expect(patches[0]?.body).toEqual({ is_active: false }))
    expect(store.db.branches.find((branch) => branch.id === 1)?.is_active).toBe(false)
  })

  it('deletes a branch nobody uses', async () => {
    withBranches(store.db)
    store.db.branches.push({
      id: 9,
      name: 'Olmazor',
      address: "Qorasaroy ko'chasi, 102",
      lat: 41.348,
      lng: 69.221,
      phone: '',
      is_active: true,
      created_at: new Date().toISOString(),
    })
    const { user } = renderApp('/branches')
    await user.click(await screen.findByRole('button', { name: "O'chirish: Olmazor" }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: "Ha, o'chirish" }))
    expect(await screen.findByText("Filial o'chirildi")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Olmazor' })).not.toBeInTheDocument())
  })

  it('explains branches while there are none yet', async () => {
    store.db.business.branches_enabled = true
    renderApp('/branches')
    expect(await screen.findByRole('heading', { name: "Hali filial yo'q" })).toBeInTheDocument()
    expect(screen.getByText('Buyurtma avval sizga keladi')).toBeInTheDocument()
    expect(screen.getByText("Olib ketishda mijoz o'zi tanlaydi")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Birinchi filialni qo'shish" })).toHaveAttribute('href', '/branches/new')
  })

  it('is for admins only', async () => {
    withBranches(store.db)
    renderApp('/', { as: 'manager' })
    const nav = await screen.findByRole('navigation', { name: 'Admin panel' })
    expect(within(nav).getByRole('link', { name: 'Mijozlar' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Filiallar' })).not.toBeInTheDocument()

    renderApp('/branches', { as: 'manager' })
    expect(await screen.findByRole('heading', { name: "Ruxsat yo'q" })).toBeInTheDocument()
  })

  it('is under «Yana» on a phone', async () => {
    withBranches(store.db)
    viewport.width = 390
    renderApp('/more')
    expect(await screen.findByRole('link', { name: /^Filiallar/ })).toHaveAttribute('href', '/branches')
  })
})

describe('staff users and branches', () => {
  it('a branch admin needs a branch', async () => {
    withBranches(store.db)
    const creates = recordRequests('post', '/api/v1/users')
    const { user } = renderApp('/users/new')

    await user.type(await screen.findByLabelText(/^Telefon/), '93 111 22 33')
    await user.type(screen.getByLabelText(/^Parol\*?$/), 'secret-pass-1')
    await user.type(screen.getByLabelText(/Parolni tasdiqlang/), 'secret-pass-1')
    await user.click(screen.getByRole('radio', { name: /^Filial admini/ }))
    const select = await screen.findByRole('combobox', { name: /^Filial/ })
    // The stopped Sergeli is not offered.
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(4))
    await user.click(screen.getByRole('button', { name: 'Foydalanuvchi yaratish' }))
    expect(screen.getByText('Filialni tanlang', { selector: 'p[id$="-error"]' })).toBeInTheDocument()
    expect(creates).toHaveLength(0)

    await user.selectOptions(select, 'Yunusobod')
    await user.click(screen.getByRole('button', { name: 'Foydalanuvchi yaratish' }))
    expect(await screen.findByText('Foydalanuvchi yaratildi')).toBeInTheDocument()
    expect(creates[0].body).toMatchObject({ role: 'branch', branch_id: 2 })
  })

  it("«Xodim qo'shish» of a branch opens a new branch admin of it", async () => {
    withBranches(store.db)
    const creates = recordRequests('post', '/api/v1/users')
    const { user, router } = renderApp('/branches')

    await user.click(await screen.findByRole('link', { name: "Xodim qo'shish: Yunusobod" }))
    expect(locationOf(router)).toBe('/users/new?role=branch&branch=2')
    expect(await screen.findByRole('radio', { name: /^Filial admini/ })).toBeChecked()
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Filial/ })).toHaveValue('2'))
    expect(screen.getByRole('link', { name: 'Filiallarga qaytish' })).toHaveAttribute('href', '/branches')

    await user.type(screen.getByLabelText(/^Telefon/), '93 222 33 44')
    await user.type(screen.getByLabelText('Ism'), 'Nodira')
    await user.type(screen.getByLabelText(/^Parol\*?$/), 'secret-pass-1')
    await user.type(screen.getByLabelText(/Parolni tasdiqlang/), 'secret-pass-1')
    await user.click(screen.getByRole('button', { name: 'Foydalanuvchi yaratish' }))

    expect(await screen.findByText('Foydalanuvchi yaratildi')).toBeInTheDocument()
    expect(creates[0].body).toMatchObject({ role: 'branch', branch_id: 2, first_name: 'Nodira' })
    expect(locationOf(router)).toBe('/branches')
    await screen.findByRole('link', { name: 'Yunusobod' })
    const staff = await within(card('Yunusobod')).findByRole('region', { name: 'Xodimlar · 2' })
    expect(within(staff).getByRole('link', { name: 'Nodira' })).toBeInTheDocument()
  })

  it('the list can show one branch or the head office', async () => {
    withBranches(store.db)
    const { user } = renderApp('/users')
    const table = await screen.findByRole('table', { name: 'Tizim foydalanuvchilari' })
    await within(table).findByRole('link', { name: 'Bobur Xolmatov' })
    const names = () => within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('link')[0].textContent)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filial' }), 'Chilonzor')
    await waitFor(() => expect(names()).toEqual(['Bobur Xolmatov', 'Jahongir Qodirov']))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filial' }), 'Bosh ofis')
    await waitFor(() => expect(names()).toEqual(['Aziz Karimov', 'Dilnoza Rahimova', 'Sardor Aliyev']))
  })

  it('the list says where each one works', async () => {
    withBranches(store.db)
    renderApp('/users')
    const table = await screen.findByRole('table', { name: 'Tizim foydalanuvchilari' })
    const bobur = (await within(table).findByRole('link', { name: 'Bobur Xolmatov' })).closest('tr')!
    expect(within(bobur).getByText('Filial admini')).toBeInTheDocument()
    expect(within(bobur).getByText('Chilonzor')).toBeInTheDocument()
    const aziz = within(table).getByRole('link', { name: 'Aziz Karimov' }).closest('tr')!
    expect(within(aziz).getByText('Bosh ofis')).toBeInTheDocument()
  })

  it("a branch admin's own branch and role are sent only when they change", async () => {
    withBranches(store.db)
    const patches = recordRequests('patch', `/api/v1/users/${BRANCH_USER_ID}`)
    const { user } = renderApp(`/users/${BRANCH_USER_ID}/edit`)
    const first = await screen.findByDisplayValue('Bobur')
    expect(screen.getByRole('radio', { name: /^Filial admini/ })).toBeChecked()
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Filial/ })).toHaveValue('1'))

    await user.clear(first)
    await user.type(first, 'Boburjon')
    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].body).not.toHaveProperty('role')
    expect(patches[0].body).not.toHaveProperty('branch_id')
  })
})

describe('branch staff', () => {
  it("have a panel of their branch's own: its orders, sales and bot", async () => {
    withBranches(store.db)
    const { unmount } = renderApp('/', { as: 'branch' })

    const nav = await screen.findByRole('navigation', { name: 'Admin panel' })
    expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/sales',
      '/orders',
      '/telegram',
    ])
    expect(screen.getAllByText('Chilonzor filiali').length).toBeGreaterThan(0)

    // Their dashboard: their branch's today, the new ones, on their way and done — nothing business-wide.
    expect(await screen.findByText('Bugungi tushum')).toBeInTheDocument()
    expect(screen.getByText('Bugungi buyurtmalar').closest('a')).toHaveAttribute('href', '/orders')
    expect(screen.getByText('Yangi buyurtmalar').closest('a')).toHaveAttribute('href', '/orders?status=ordered')
    const tiles = (label: string) => screen.getAllByText(label).map((element) => element.closest('a')?.getAttribute('href'))
    expect(tiles("Yo'lda")).toContain('/orders?status=on_the_way')
    expect(tiles('Bajarilgan')).toContain('/orders?status=completed')
    for (const wide of ['Jami mijozlar', 'Jami mahsulotlar', 'Kategoriyalar', 'Jami buyurtmalar']) {
      expect(screen.queryByText(wide)).not.toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: "So'nggi 7 kundagi buyurtmalar" })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: "So'nggi buyurtmalar" })).toBeInTheDocument()

    unmount()
    const paths = ['/products', '/products/new', '/products/1/edit', '/hours', '/clients', '/clients/1', '/categories', '/units']
    for (const path of paths) {
      const view = renderApp(path, { as: 'branch' })
      expect(await screen.findByText("Bu bo'limni bosh ofis boshqaradi.")).toBeInTheDocument()
      view.unmount()
    }
  })

  it("see only their branch's orders, each with its branch and without links to customers", async () => {
    withBranches(store.db)
    const own = [...store.db.orders].reverse().filter((order) => order.branch_id === 1)
    renderApp('/orders', { as: 'branch' })
    expect(await screen.findByText(`${own.length} ta buyurtma`)).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Filial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Filial' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: `#${own[0].id}` })).toBeInTheDocument()

    const withClient = own.find((order) => order.client)!
    renderApp(`/orders/${withClient.id}`, { as: 'branch' })
    expect(await screen.findByRole('heading', { name: "Mijoz ma'lumotlari" })).toBeInTheDocument()
    expect(screen.getByText('Chilonzor')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Yunusobod/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: "Mijoz profilini ko'rish" })).not.toBeInTheDocument()

    // Another branch's order does not exist for them.
    const other = store.db.orders.find((order) => order.branch_id === 2)!
    renderApp(`/orders/${other.id}`, { as: 'branch' })
    expect(await screen.findByRole('heading', { name: 'Sahifa topilmadi' })).toBeInTheDocument()
  })

  it('on a phone: the branch under the business; the bot in the bottom menu, «Yana» for the settings', async () => {
    withBranches(store.db)
    viewport.width = 390
    const { user, router } = renderApp('/', { as: 'branch' })
    expect(await screen.findByRole('heading', { name: 'Burger House' })).toBeInTheDocument()
    expect(screen.getByText('Chilonzor filiali')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /filial tanlashni kutmoqda/ })).not.toBeInTheDocument()

    const menu = screen.getByRole('navigation', { name: 'Asosiy menyu' })
    expect(within(menu).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/orders',
      '/sales',
      '/telegram',
      '/more',
    ])
    await user.click(within(menu).getByRole('link', { name: 'Telegram' }))
    expect(locationOf(router)).toBe('/telegram')
    await waitFor(() => expect(within(menu).getByRole('link', { name: 'Telegram' })).toHaveAttribute('aria-current', 'page'))
    expect(within(menu).getByRole('link', { name: 'Yana' })).not.toHaveAttribute('aria-current')

    await user.click(within(menu).getByRole('link', { name: 'Yana' }))
    expect(await screen.findByText('Burger House · Chilonzor filiali')).toBeInTheDocument()
    for (const page of ['Ish vaqti', 'Mijozlar', 'Kategoriyalar', 'Mahsulotlar', 'Telegram bot']) {
      expect(screen.queryByRole('link', { name: new RegExp(`^${page}`) })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('switch', { name: 'Tungi rejim' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chiqish' })).toBeInTheDocument()
  })
})

describe('branch helpers', () => {
  it('put a branch name in the Uzbek dative', () => {
    expect(uzDative('Chilonzor')).toBe('Chilonzorga')
    expect(uzDative("Mirzo Ulug'bek")).toBe("Mirzo Ulug'bekka")
    expect(uzDative('Olmaliq')).toBe('Olmaliqqa')
    expect(uzDative("Tog'")).toBe('Toqqa')
    expect(uzDative('Filial 2')).toBe('Filial 2-ga')
    expect(uzDative('Чиланзар')).toBe('Чиланзарга')
    expect(uzDative('Markaz (1)')).toBe('Markaz (1) filialiga')
    expect(branchVars('Yunusobod')).toEqual({ name: 'Yunusobod', to: 'Yunusobodga' })
  })

  it('write a distance the Uzbek and Russian way', () => {
    expect(formatDistance(2.1, 'uz')).toBe('2,1 km')
    expect(formatDistance(12, 'ru')).toBe('12,0 км')
  })

  it('read points from the API and from pasted links', () => {
    expect(toPoint('41.311081', '69.279737')).toEqual({ lat: 41.311081, lng: 69.279737 })
    expect(toPoint('', '')).toBeNull()
    expect(toPoint(null, 69.2)).toBeNull()
    expect(parsePoint('41.311081, 69.279737')).toEqual({ lat: 41.311081, lng: 69.279737 })
    expect(parsePoint('https://maps.google.com/?q=41.3,69.2')).toEqual({ lat: 41.3, lng: 69.2 })
    expect(parsePoint('Chilonzor 9')).toBeNull()
  })

  it('tell the head office, branch staff and dispatch mode apart', () => {
    const business = { name: 'B', slug: 'b', logo: null, brand_color: '', shop_url: '', branches_enabled: true, dispatch: true }
    const branchUser = {
      id: 4,
      phone_number: '',
      first_name: '',
      last_name: '',
      role: 'branch' as const,
      branch: { id: 1, name: 'Chilonzor' },
      is_active: true,
      created_at: '',
    }
    expect(branchAccess(branchUser, business)).toEqual({
      branchesOn: true,
      branchStaff: true,
      headOffice: false,
      dispatch: false,
      branch: { id: 1, name: 'Chilonzor' },
    })
    expect(branchAccess({ ...branchUser, role: 'manager', branch: null }, business)).toMatchObject({ headOffice: true, dispatch: true })
    // Branches off: a branch admin is a manager.
    expect(branchAccess(branchUser, { ...business, branches_enabled: false, dispatch: false })).toEqual({
      branchesOn: false,
      branchStaff: false,
      headOffice: false,
      dispatch: false,
      branch: null,
    })
  })
})
