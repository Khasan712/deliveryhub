import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { backend } from './backend'
import { sampleBusinesses } from './fixtures'
import { renderApp } from './render'
import { server } from './server'

/** The value next to a label in a description list. */
function valueOf(scope: ReturnType<typeof within>, label: string) {
  return scope.getByText(label).nextElementSibling
}

function cardOf(name: string) {
  const article = screen.getByRole('link', { name }).closest('article')
  if (!article) throw new Error(`no card for ${name}`)
  return within(article)
}

describe('businesses list', () => {
  it('shows the totals and a card per business', async () => {
    backend.state.businesses = sampleBusinesses()
    renderApp('/')

    await screen.findByRole('link', { name: 'Burger House' })

    const totals = within(screen.getByRole('region', { name: "Umumiy ko'rsatkichlar" }))
    expect(valueOf(totals, 'Bizneslar')).toHaveTextContent('3')
    expect(valueOf(totals, 'Faol')).toHaveTextContent('2')
    expect(valueOf(totals, 'Bugungi buyurtmalar')).toHaveTextContent('7')
    expect(valueOf(totals, 'Bugungi tushum')).toHaveTextContent("1 705 000 so'm")

    // Burger House: no logo → its initial on the brand color; active; customers' bot alive, staff bot missing.
    const burger = cardOf('Burger House')
    expect(burger.getByText('B')).toHaveStyle({ backgroundColor: '#ff6b00' })
    expect(burger.getByText('Faol')).toBeInTheDocument()
    expect(burger.getByText('burger-house.portex.uz')).toBeInTheDocument()
    expect(valueOf(burger, 'bugun')).toHaveTextContent('2')
    expect(valueOf(burger, 'jami buyurtma')).toHaveTextContent('11')
    expect(valueOf(burger, 'mijoz')).toHaveTextContent('7')
    expect(burger.getByText('@burger_house_bot')).toBeInTheDocument()
    expect(burger.getByText('(ishlayapti)')).toBeInTheDocument()
    expect(burger.getByText('ulanmagan')).toBeInTheDocument()

    // Pizza Palace: logo image; the staff bot is connected but its process is not running.
    const pizza = cardOf('Pizza Palace')
    expect(pizza.getByRole('presentation')).toHaveAttribute('src', '/media/pizza_palace/logos/pizza.png')
    expect(pizza.getByText('@pizza_staff_bot')).toBeInTheDocument()
    expect(pizza.getByText('(bot jarayoni ishlamayapti)')).toBeInTheDocument()

    // Sushi Bar: suspended, no brand color → the shop's own default (orange).
    const sushi = cardOf('Sushi Bar')
    expect(sushi.getByText("To'xtatilgan")).toBeInTheDocument()
    expect(sushi.getByText('S')).toHaveStyle({ backgroundColor: '#ff5a1f' })
    expect(sushi.getAllByText('ulanmagan')).toHaveLength(2)

    expect(screen.getByRole('link', { name: 'Pizza Palace' })).toHaveAttribute('href', '/b/pizza-palace')
  })

  it('filters by name and status', async () => {
    backend.state.businesses = sampleBusinesses()
    const { user } = renderApp('/')
    await screen.findByRole('link', { name: 'Burger House' })

    await user.type(screen.getByRole('searchbox', { name: 'Biznes qidirish' }), 'pizza')
    expect(screen.getByRole('link', { name: 'Pizza Palace' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Burger House' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /To'xtatilgan/ }))
    expect(screen.getByText('Hech narsa topilmadi')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Filtrni tozalash' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('moves the focus to the heading of the next page (screen readers announce it)', async () => {
    const { user } = renderApp('/')
    const list = await screen.findByRole('heading', { level: 1, name: 'Bizneslar' })
    expect(list).not.toHaveFocus()

    await user.click(screen.getByRole('link', { name: 'Yangi biznes' }))
    const heading = await screen.findByRole('heading', { level: 1, name: 'Yangi biznes' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('invites to open the first business when there are none', async () => {
    const { user, router } = renderApp('/')

    expect(await screen.findByText("Hali biznes yo'q")).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Yangi biznes ochish' }))
    expect(router.state.location.pathname).toBe('/new')
  })

  it('shows skeletons while loading, then an error with a retry', async () => {
    backend.state.businesses = sampleBusinesses()
    server.use(
      http.get('/api/v1/businesses', () => HttpResponse.json({ error: 'server_error' }, { status: 500 }), { once: true }),
    )
    const { user } = renderApp('/')

    expect(await screen.findByText('Bizneslar yuklanmoqda…')).toBeInTheDocument()
    expect(await screen.findByText("Ma'lumotlarni yuklab bo'lmadi")).toBeInTheDocument()
    expect(screen.getByText(/Serverda xatolik yuz berdi/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Qayta urinish' }))
    expect(await screen.findByRole('link', { name: 'Sushi Bar' })).toBeInTheDocument()
  })
})
