import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { withBranches } from '../mocks/branches'
import { store } from '../mocks/data'
import { locationOf, renderApp } from './render'
import { recordRequests } from './server'
import { viewport } from './setup'

// The mock business with branches on (src/mocks/branches.ts): Chilonzor (1), Yunusobod (2), Mirzo Ulug'bek (3) work,
// Sergeli (4) is stopped; #161 (by Yunusobod), #162 (a typed address only) and #163 (2,1 km from Chilonzor) wait for
// the head office; #160 is Yunusobod's, on its way.
beforeEach(() => {
  withBranches(store.db)
})

function rows() {
  const table = screen.getByRole('table', { name: 'Buyurtmalar' })
  return within(table).getAllByRole('row').slice(1)
}

function rowOf(id: number) {
  return screen.getByRole('link', { name: `#${id}` }).closest('tr')!
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

describe('orders: dispatch (head office)', () => {
  it('shows the orders waiting for a branch and filters them in one tap', async () => {
    const requests = recordRequests('get', '/api/v1/orders')
    const { user, router } = renderApp('/orders')

    const shortcut = await screen.findByRole('button', { name: /^Filial tanlanmagan/ })
    await waitFor(() => expect(shortcut).toHaveTextContent('3'))
    expect(shortcut).toHaveAttribute('aria-pressed', 'false')

    await user.click(shortcut)
    expect(locationOf(router)).toBe('/orders?branch=none&status=ordered')
    await waitFor(() => {
      const last = requests.at(-1)!.url.searchParams
      expect([last.get('branch'), last.get('status')]).toEqual(['none', 'ordered'])
    })
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(screen.getByRole('button', { name: /^Filial tanlanmagan/ })).toHaveAttribute('aria-pressed', 'true')

    // Pressed again: every order.
    await user.click(screen.getByRole('button', { name: /^Filial tanlanmagan/ }))
    expect(locationOf(router)).toBe('/orders')
  })

  it('filters by branch', async () => {
    const requests = recordRequests('get', '/api/v1/orders')
    const { user, router } = renderApp('/orders')
    const select = await screen.findByRole('combobox', { name: 'Filial' })
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Chilonzor' })).toBeInTheDocument())
    expect(within(select).getByRole('option', { name: 'Sergeli (faol emas)' })).toBeInTheDocument()

    await user.selectOptions(select, 'Chilonzor')
    await waitFor(() => expect(requests.at(-1)!.url.searchParams.get('branch')).toBe('1'))
    expect(locationOf(router)).toBe('/orders?branch=1')
    await waitFor(() => {
      for (const row of rows()) expect(within(row).getByText('Chilonzor')).toBeInTheDocument()
    })
  })

  it('shows each order\'s branch, or the nearest one to send it to in one tap', async () => {
    const puts = recordRequests('put', '/api/v1/orders/163/branch')
    const { user } = renderApp('/orders')
    await screen.findByRole('link', { name: '#163' })
    expect(screen.getByRole('columnheader', { name: 'Filial' })).toBeInTheDocument()

    expect(within(rowOf(160)).getByText('Yunusobod')).toBeInTheDocument()
    expect(within(rowOf(162)).getByText('Filial tanlanmagan')).toBeInTheDocument()
    expect(within(rowOf(161)).getByRole('button', { name: 'Yunusobodga yuborish: #161' })).toBeInTheDocument()
    const row = rowOf(163)
    expect(within(row).getByText('Eng yaqin · 2,1 km')).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Chilonzorga yuborish: #163' }))
    await waitFor(() => expect(puts[0]?.body).toEqual({ branch_id: 1 }))
    expect(await screen.findByText('Chilonzor filialiga yuborildi')).toBeInTheDocument()
    expect(screen.getByText('Filial xodimlariga Telegram orqali xabar boradi')).toBeInTheDocument()
    await waitFor(() => expect(within(rowOf(163)).getByText('Chilonzor')).toBeInTheDocument())
    expect(store.db.orders.find((order) => order.id === 163)).toMatchObject({ branch_id: 1, assigned_by: { id: 1 } })
  })
})

describe('order page: the branch (head office)', () => {
  function dispatchSection() {
    return screen.getByRole('region', { name: 'Filial' })
  }

  it('puts the map and the branches across the page, nearest first, and sends the order to the one chosen', async () => {
    const puts = recordRequests('put', '/api/v1/orders/163/branch')
    const { user } = renderApp('/orders/163')

    const section = await screen.findByRole('region', { name: 'Filial' })
    // Under the page's header, before the order's cards (not in their side column).
    const items = screen.getByRole('heading', { name: 'Buyurtma mahsulotlari' })
    expect(section.compareDocumentPosition(items) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(section).getByText('Filial tanlanmagan')).toBeInTheDocument()
    const options = within(section).getAllByRole('radio')
    expect(options.map((option) => option.closest('label')!.textContent)).toEqual([
      expect.stringMatching(/^Chilonzor\s*Eng yaqin.*2,1\s*km$/),
      expect.stringMatching(/^Yunusobod.*10,1\s*km$/),
      expect.stringMatching(/^Mirzo Ulug'bek.*10,8\s*km$/),
    ])
    expect(options[0]).toBeChecked()

    // The map: the customer and every active branch, the chosen one marked, a line between them.
    const map = await within(section).findByRole('region', { name: 'Xarita: mijoz va filiallar' })
    const places = within(map).getAllByRole('listitem')
    // (The distances keep a no-break space before «km».)
    expect(places.map((place) => [place.textContent?.replace(/\s+/g, ' '), place.dataset.tone])).toEqual([
      ['Xaritada: Chilonzor · 2,1 km', 'selected'],
      ['Xaritada: Yunusobod · 10,1 km', 'branch'],
      ["Xaritada: Mirzo Ulug'bek · 10,8 km", 'branch'],
      ['Mijoz', 'customer'],
    ])
    expect(within(map).getByText(/^Chiziq:/)).toBeInTheDocument()

    // A pin on the map chooses too.
    await user.click(within(map).getByRole('button', { name: 'Xaritada: Yunusobod' }))
    expect(within(section).getByRole('radio', { name: /^Yunusobod/ })).toBeChecked()
    expect(within(map).getByRole('button', { name: 'Xaritada: Chilonzor' }).closest('li')).toHaveAttribute('data-tone', 'nearest')

    await user.click(within(section).getByRole('button', { name: 'Yunusobodga yuborish' }))
    await waitFor(() => expect(puts[0]?.body).toEqual({ branch_id: 2 }))
    expect(await screen.findByText('Yunusobod filialiga yuborildi')).toBeInTheDocument()
    // With its branch the section folds into a strip: the branch, who sent it there and when.
    expect(await screen.findByRole('heading', { name: /^Filial: Yunusobod · Aziz Karimov yubordi, \d\d:\d\d$/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Yunusobod/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Boshqa filialga o'tkazish" })).toBeInTheDocument()
  })

  it('moves an order to another branch from its strip, after asking', async () => {
    const puts = recordRequests('put', '/api/v1/orders/160/branch')
    const { user } = renderApp('/orders/160')

    expect(await screen.findByRole('heading', { name: /^Filial: Yunusobod · Aziz Karimov yubordi, / })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Chilonzor/ })).not.toBeInTheDocument()

    // Opened and closed again: nothing changes.
    await user.click(screen.getByRole('button', { name: "Boshqa filialga o'tkazish" }))
    await user.click(within(dispatchSection()).getByRole('button', { name: 'Yopish' }))
    expect(screen.queryByRole('radio', { name: /^Chilonzor/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Boshqa filialga o'tkazish" }))
    const section = dispatchSection()
    expect(within(section).getByRole('radio', { name: /^Yunusobod\s*Eng yaqin\s*Hozirgi/ })).toBeChecked()
    expect(within(section).getByRole('button', { name: "Boshqa filialga o'tkazish" })).toBeDisabled()

    await user.click(within(section).getByRole('radio', { name: /^Chilonzor/ }))
    await user.click(within(section).getByRole('button', { name: "Chilonzorga o'tkazish" }))
    const dialog = await screen.findByRole('dialog', { name: "Buyurtma «Chilonzor» filialiga o'tkazilsinmi?" })
    expect(dialog).toHaveTextContent("«Yunusobod» xodimlari uni endi ko'rmaydi")
    await user.click(within(dialog).getByRole('button', { name: "Ha, o'tkazish" }))
    await waitFor(() => expect(puts[0]?.body).toEqual({ branch_id: 1 }))
    expect(await screen.findByText("Chilonzor filialiga o'tkazildi")).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /^Filial: Chilonzor · Aziz Karimov yubordi/ })).toBeInTheDocument()
  })

  it('says the distance is unknown for an order with a typed address only', async () => {
    renderApp('/orders/162')
    const section = await screen.findByRole('region', { name: 'Filial' })
    expect(within(section).getByText(/Mijozning nuqtasi xaritada yo'q/)).toBeInTheDocument()
    expect(within(section).queryByText('Eng yaqin')).not.toBeInTheDocument()
    // By name, none chosen for it: the first one is.
    expect(within(section).getAllByRole('radio').map((option) => option.closest('label')!.textContent)).toEqual([
      expect.stringMatching(/^Chilonzor/),
      expect.stringMatching(/^Mirzo Ulug'bek/),
      expect.stringMatching(/^Yunusobod/),
    ])
    expect(within(section).getByRole('button', { name: 'Chilonzorga yuborish' })).toBeEnabled()
  })

  it('has nothing to send to while no branch is active', async () => {
    for (const branch of store.db.branches) branch.is_active = false
    renderApp('/orders/163')
    const section = await screen.findByRole('region', { name: 'Filial' })
    expect(within(section).getAllByText(/Faol filial yo'q/).length).toBeGreaterThan(0)
    expect(within(section).getAllByRole('link', { name: 'Filiallar' })[0]).toHaveAttribute('href', '/branches')
    expect(within(section).queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows branch staff just their branch, by the order\'s status', async () => {
    renderApp('/orders/159', { as: 'branch' })
    expect(await screen.findByText('Chilonzor')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Buyurtma\s+#159/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Filial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Yunusobod/ })).not.toBeInTheDocument()
  })
})

describe('phone: dispatch', () => {
  it('an order waiting for a branch is sent to the nearest one from its card', async () => {
    viewport.width = 390
    const puts = recordRequests('put', '/api/v1/orders/163/branch')
    const { user } = renderApp('/orders')

    const card = (await screen.findAllByRole('article')).find((item) => item.textContent?.includes('#163'))!
    expect(card).toHaveTextContent('Filial tanlanmagan')
    expect(card).toHaveTextContent('Eng yaqin: Chilonzor · 2,1 km')
    // Sending it to a branch takes the place of moving it on.
    expect(within(card).queryByRole('button', { name: "Yo'lga chiqarish: #163" })).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Filial tanlash: #163' })).toHaveAttribute('href', '/orders/163')

    await user.click(within(card).getByRole('button', { name: 'Chilonzorga yuborish: #163' }))
    await waitFor(() => expect(puts[0]?.body).toEqual({ branch_id: 1 }))
    expect(await within(card).findByRole('button', { name: "Yo'lga chiqarish: #163" })).toBeInTheDocument()
    expect(card).not.toHaveTextContent('Filial tanlanmagan')
    expect(card).toHaveTextContent('Chilonzor')

    // Without a point there is no nearest one: the order's page has every branch.
    const unknown = screen.getAllByRole('article').find((item) => item.textContent?.includes('#162'))!
    expect(within(unknown).getByRole('link', { name: 'Filial tanlash' })).toHaveAttribute('href', '/orders/162')
  })

  it("an order's page puts the branch right after its progress and sends it from the bottom bar", async () => {
    viewport.width = 390
    const puts = recordRequests('put', '/api/v1/orders/163/branch')
    const { user } = renderApp('/orders/163')

    const progress = await screen.findByRole('list', { name: 'Buyurtma holati' })
    const card = await screen.findByRole('region', { name: 'Filial' })
    expect(await within(card).findByRole('region', { name: 'Xarita: mijoz va filiallar' })).toBeInTheDocument()
    const after = (node: Element) => (progress.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(after(card)).toBe(true)
    // The customer's card comes after it.
    const customer = screen.getByRole('heading', { name: "Mijoz ma'lumotlari" })
    expect(card.compareDocumentPosition(customer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.queryByRole('button', { name: "Yo'lga chiqarish" })).not.toBeInTheDocument()
    const send = screen.getAllByRole('button', { name: 'Chilonzorga yuborish' })
    expect(send).toHaveLength(1)
    await user.click(send[0])
    await waitFor(() => expect(puts[0]?.body).toEqual({ branch_id: 1 }))
    // With its branch it moves on as usual.
    expect(await screen.findByRole('button', { name: "Yo'lga chiqarish" })).toBeInTheDocument()
  })

  it('the home page shows the orders waiting for a branch and today per branch', async () => {
    viewport.width = 390
    renderApp('/')
    const banner = await screen.findByRole('link', { name: /3 ta buyurtma filial tanlashni kutmoqda/ })
    expect(banner).toHaveAttribute('href', '/orders?branch=none&status=ordered')
    expect(await screen.findByRole('heading', { name: "Bugun filiallar bo'yicha" })).toBeInTheDocument()
  })
})

describe('dashboard (head office)', () => {
  it('shows the orders waiting for a branch and today per branch', async () => {
    const { user, router } = renderApp('/')

    const banner = await screen.findByRole('link', { name: /3 ta buyurtma filial tanlashni kutmoqda/ })
    const today = await screen.findByRole('heading', { name: "Bugun filiallar bo'yicha" })
    const list = within(today.closest('section')!).getAllByRole('link')
    // The working branches (Sergeli had no orders today).
    expect(list.map((link) => link.getAttribute('href'))).toEqual(['/orders?branch=1', '/orders?branch=3', '/orders?branch=2'])
    const todays = store.db.orders.filter(
      (order) => order.branch_id === 1 && order.status !== 'rejected' && new Date(order.created_at).getTime() >= startOfToday(),
    )
    expect(list[0]).toHaveTextContent(`Chilonzor`)
    expect(list[0]).toHaveTextContent(`${todays.length} ta buyurtma`)

    await user.click(banner)
    expect(locationOf(router)).toBe('/orders?branch=none&status=ordered')
    expect(await screen.findByRole('button', { name: /^Filial tanlanmagan/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('point of sale: the branch', () => {
  async function addBurger(user: ReturnType<typeof renderApp>['user']) {
    await user.click(await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ }))
  }

  function branchChoice() {
    return screen.getByRole('group', { name: 'Qaysi filial uchun?' })
  }

  it('the head office has to name the branch of every sale while orders are dispatched', async () => {
    const creates = recordRequests('post', '/api/v1/sales')
    const { user } = renderApp('/sales')
    await addBurger(user)

    const choice = branchChoice()
    expect(within(choice).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual([
      'Chilonzor',
      "Mirzo Ulug'bek",
      'Yunusobod',
    ])
    expect(within(choice).queryByRole('radio', { checked: true })).not.toBeInTheDocument()

    // Not chosen: the sale waits, the choice says what is missing and takes the focus.
    await user.click(screen.getByRole('button', { name: /^Buyurtma yaratish/ }))
    expect(within(choice).getByText('Filialni tanlang')).toBeInTheDocument()
    await waitFor(() => expect(within(choice).getAllByRole('radio')[0]).toHaveFocus())
    expect(creates).toHaveLength(0)

    await user.click(within(choice).getByRole('radio', { name: 'Yunusobod' }))
    expect(within(choice).queryByText('Filialni tanlang')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Buyurtma yaratish/ }))
    await waitFor(() => expect(creates[0]?.body).toMatchObject({ branch_id: 2 }))
    expect(store.db.orders.at(-1)).toMatchObject({ branch_id: 2, assigned_by: { id: 1 } })

    // The next sale is chosen for again.
    await waitFor(() => expect(within(branchChoice()).queryByRole('radio', { checked: true })).not.toBeInTheDocument())
  })

  it("says so when the server refuses the sale's branch", async () => {
    const { user } = renderApp('/sales')
    await addBurger(user)
    // Stopped meanwhile in another tab.
    store.db.branches.find((branch) => branch.name === 'Yunusobod')!.is_active = false
    await user.click(within(branchChoice()).getByRole('radio', { name: 'Yunusobod' }))
    await user.click(screen.getByRole('button', { name: /^Buyurtma yaratish/ }))
    expect(await within(branchChoice()).findByText('Filial faol emas')).toBeInTheDocument()
    // The choice is read again: the stopped branch is gone from it.
    await waitFor(() => expect(within(branchChoice()).queryByRole('radio', { name: 'Yunusobod' })).not.toBeInTheDocument())
  })

  it('asks for the branch when a second one opened meanwhile (the server requires it)', async () => {
    for (const branch of store.db.branches) branch.is_active = branch.id === 1
    const creates = recordRequests('post', '/api/v1/sales')
    const { user } = renderApp('/sales')
    await addBurger(user)
    expect(screen.getByText('Sotuv Chilonzor filiali uchun')).toBeInTheDocument()
    // Yunusobod opens in another tab: orders are dispatched from now on.
    store.db.branches.find((branch) => branch.id === 2)!.is_active = true
    await user.click(screen.getByRole('button', { name: /^Buyurtma yaratish/ }))
    await waitFor(() => expect(creates).toHaveLength(1))
    const choice = await screen.findByRole('group', { name: 'Qaysi filial uchun?' })
    expect(within(choice).getByText('Filialni tanlang')).toBeInTheDocument()
    expect(within(choice).getAllByRole('radio')).toHaveLength(2)
    expect(store.db.orders.at(-1)!.id).toBeLessThan(1000)
  })

  it('on a phone the details step asks for the branch first', async () => {
    viewport.width = 390
    const creates = recordRequests('post', '/api/v1/sales')
    const { user } = renderApp('/sales')
    await addBurger(user)
    await user.click(screen.getByRole('button', { name: /Davom etish/ }))
    expect(await screen.findByRole('heading', { name: 'Rasmiylashtirish' })).toBeInTheDocument()
    // Above the way it is received.
    const choice = branchChoice()
    const receive = screen.getByRole('group', { name: /Qabul qilish/ })
    expect(choice.compareDocumentPosition(receive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Buyurtma yaratish' }))
    expect(within(choice).getByText('Filialni tanlang')).toBeInTheDocument()
    expect(creates).toHaveLength(0)
    await user.click(within(choice).getByRole('radio', { name: 'Chilonzor' }))
    await user.click(screen.getByRole('button', { name: 'Buyurtma yaratish' }))
    await waitFor(() => expect(creates[0]?.body).toMatchObject({ branch_id: 1 }))
    expect(await screen.findByRole('heading', { name: 'Buyurtma yaratildi' })).toBeInTheDocument()
    expect(screen.getByText('Chilonzor')).toBeInTheDocument()
  })

  it('branch staff sell for their own branch', async () => {
    const creates = recordRequests('post', '/api/v1/sales')
    const { user } = renderApp('/sales', { as: 'branch' })
    await addBurger(user)
    expect(screen.getByText('Sotuv Chilonzor filiali uchun')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Qaysi filial uchun?' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Buyurtma yaratish/ }))
    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0].body).not.toHaveProperty('branch_id')
    expect(store.db.orders.at(-1)).toMatchObject({ branch_id: 1, assigned_by: null })
  })
})

describe('one active branch: nothing to dispatch', () => {
  it('orders get it by themselves; the branch column and the filter stay; a sale is that branch\'s', async () => {
    for (const branch of store.db.branches) branch.is_active = branch.id === 1
    const { unmount } = renderApp('/orders')
    await screen.findByRole('link', { name: '#163' })
    expect(screen.queryByRole('button', { name: /^Filial tanlanmagan/ })).not.toBeInTheDocument()
    expect(within(rowOf(163)).queryByRole('button')).not.toBeInTheDocument()
    expect(within(rowOf(160)).getByText('Yunusobod')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filial' })).toBeInTheDocument()
    unmount()

    const creates = recordRequests('post', '/api/v1/sales')
    const { user } = renderApp('/sales')
    await user.click(await screen.findByRole('button', { name: /^Buyurtmaga qo'shish: Chizburger,/ }))
    // The sale gets the only branch by itself: a note, nothing to choose.
    expect(screen.getByText('Sotuv Chilonzor filiali uchun')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Qaysi filial uchun?' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Buyurtma yaratish/ }))
    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0].body).not.toHaveProperty('branch_id')
    expect(store.db.orders.at(-1)).toMatchObject({ branch_id: 1, assigned_by: null })
  })
})
