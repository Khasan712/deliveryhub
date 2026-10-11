import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { backend } from './backend'
import { makeBusiness, sampleBusinesses } from './fixtures'
import { renderApp } from './render'
import { server } from './server'

const SWITCH = 'Filial ochishga ruxsat'
const OFF_TITLE = "Filial ochishga ruxsat o'chirilsinmi?"

/** The «Filiallar» card of the business page and its switch. */
async function branchesCard() {
  const card = within(await screen.findByRole('region', { name: 'Filiallar' }))
  return { card, toggle: card.getByRole('switch', { name: SWITCH }) }
}

const patches = () => backend.requests('PATCH', '/businesses/burger-house')

describe('branches of a business', () => {
  it('lets a business open branches and links to them in its admin panel', async () => {
    backend.state.businesses = [makeBusiness()]
    const { user } = renderApp('/b/burger-house')

    const { card, toggle } = await branchesCard()
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAccessibleDescription(/admin paneldagi «Filiallar» bo'limida qo'shadi/)
    expect(toggle).toHaveAccessibleDescription(/mijoz filialni o'zi tanlaydi/)
    expect(card.queryByRole('link')).not.toBeInTheDocument()

    await user.click(toggle)
    expect(await screen.findByText('Filial ochishga ruxsat berildi')).toBeInTheDocument()
    expect(patches()).toHaveLength(1)
    expect(patches()[0]?.body).toEqual({ branches_enabled: true })
    expect(patches()[0]?.headers['x-csrftoken']).toBe('csrf-token-1')
    expect(toggle).toBeChecked()
    expect(card.getByText("Hali filial qo'shilmagan")).toBeInTheDocument()
    expect(card.getByRole('link', { name: /Admin paneldagi filiallar/ })).toHaveAttribute(
      'href',
      'https://burger-house-admin.portex.uz/branches',
    )
  })

  it('counts the branches and asks before turning them off', async () => {
    backend.state.businesses = [makeBusiness({ branches_enabled: true, branches: { total: 3, active: 2 } })]
    const { user } = renderApp('/b/burger-house')

    const { card, toggle } = await branchesCard()
    expect(toggle).toBeChecked()
    expect(card.getByText('3 ta filial (2 faol)')).toBeInTheDocument()

    // Cancelled: nothing changes.
    await user.click(toggle)
    let dialog = within(screen.getByRole('alertdialog', { name: OFF_TITLE }))
    expect(dialog.getByText(/3 ta filial saqlanib qoladi/)).toHaveTextContent(
      /buyurtmalar filiallarga taqsimlanmaydi va filial adminlari barcha buyurtmalarni ko'radi/,
    )
    // The safe choice has the focus.
    expect(dialog.getByRole('button', { name: 'Bekor qilish' })).toHaveFocus()
    await user.click(dialog.getByRole('button', { name: 'Bekor qilish' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(patches()).toHaveLength(0)
    expect(toggle).toBeChecked()

    await user.click(toggle)
    dialog = within(screen.getByRole('alertdialog', { name: OFF_TITLE }))
    await user.click(dialog.getByRole('button', { name: "Ruxsatni o'chirish" }))

    expect(await screen.findByText("Filial ochishga ruxsat o'chirildi")).toBeInTheDocument()
    expect(screen.getByText('Filiallar saqlanib qoldi.')).toBeInTheDocument()
    expect(patches()[0]?.body).toEqual({ branches_enabled: false })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(toggle).not.toBeChecked()
    // The branches are kept, the link is gone.
    expect(card.getByText('3 ta filial saqlangan — ruxsat qayta yoqilsa, yana ishlaydi.')).toBeInTheDocument()
    expect(card.queryByRole('link')).not.toBeInTheDocument()

    // Back on: no question, and it says where delivery orders go now.
    await user.click(toggle)
    expect(
      await screen.findByText('2 ta faol filial: yetkazib berish buyurtmalari endi avval bosh ofisga keladi.'),
    ).toBeInTheDocument()
    expect(patches()[1]?.body).toEqual({ branches_enabled: true })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(card.getByText('3 ta filial (2 faol)')).toBeInTheDocument()
  })

  it('turns branches off at once while there are none', async () => {
    backend.state.businesses = [makeBusiness({ branches_enabled: true })]
    const { user } = renderApp('/b/burger-house')

    const { toggle } = await branchesCard()
    await user.click(toggle)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await screen.findByText("Filial ochishga ruxsat o'chirildi")).toBeInTheDocument()
    expect(screen.queryByText('Filiallar saqlanib qoldi.')).not.toBeInTheDocument()
    expect(patches()[0]?.body).toEqual({ branches_enabled: false })
    expect(toggle).not.toBeChecked()
  })

  it('says why the switch was not saved and keeps it as it was', async () => {
    backend.state.businesses = [makeBusiness()]
    server.use(
      http.patch('/api/v1/businesses/burger-house', () => HttpResponse.json({ error: 'forbidden' }, { status: 403 }), {
        once: true,
      }),
    )
    const { user } = renderApp('/b/burger-house')

    const { toggle } = await branchesCard()
    await user.click(toggle)
    expect(await screen.findByText("Saqlab bo'lmadi")).toBeInTheDocument()
    expect(screen.getByText("Bu amal uchun ruxsat yo'q.")).toBeInTheDocument()
    expect(toggle).not.toBeChecked()
    expect(toggle).toBeEnabled()
  })

  it('shows a refused turn-off in the dialog', async () => {
    backend.state.businesses = [makeBusiness({ branches_enabled: true, branches: { total: 2, active: 2 } })]
    server.use(
      http.patch('/api/v1/businesses/burger-house', () => HttpResponse.json({ error: 'forbidden' }, { status: 403 }), {
        once: true,
      }),
    )
    const { user } = renderApp('/b/burger-house')

    const { toggle } = await branchesCard()
    await user.click(toggle)
    const dialog = within(screen.getByRole('alertdialog', { name: OFF_TITLE }))
    await user.click(dialog.getByRole('button', { name: "Ruxsatni o'chirish" }))
    expect(await dialog.findByRole('alert')).toHaveTextContent("Bu amal uchun ruxsat yo'q.")
    expect(toggle).toBeChecked()
  })

  it('marks the businesses with branches in the list', async () => {
    const [burger, pizza, sushi] = sampleBusinesses()
    backend.state.businesses = [burger!, { ...pizza!, branches_enabled: true }, sushi!]
    renderApp('/')

    const card = (name: string) => within(screen.getByRole('link', { name }).closest('article')!)
    await screen.findByRole('link', { name: 'Pizza Palace' })
    expect(card('Pizza Palace').getByText('Filiallar')).toBeInTheDocument()
    expect(card('Burger House').queryByText('Filiallar')).not.toBeInTheDocument()
    expect(card('Sushi Bar').queryByText('Filiallar')).not.toBeInTheDocument()
  })
})
