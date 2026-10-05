import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { backend } from './backend'
import { sampleBusinesses } from './fixtures'
import { renderApp } from './render'

function option(name: RegExp) {
  return screen.getByRole('button', { name })
}

describe('mobile app', () => {
  it('opens the shop of the business chosen here', async () => {
    backend.state.businesses = sampleBusinesses()
    const { user } = renderApp('/mobile')

    expect(await screen.findByRole('heading', { level: 1, name: 'Mobil ilova' })).toBeInTheDocument()
    expect(await screen.findByText("Do'kon tanlanmagan")).toBeInTheDocument()
    // A suspended business cannot be shown.
    expect(await screen.findByRole('button', { name: /Sushi Bar/ })).toBeDisabled()

    await user.click(option(/Pizza Palace/))
    expect(await screen.findByText("Ilova endi «Pizza Palace» do'konini ochadi")).toBeInTheDocument()
    expect(backend.requests('PUT', '/mobile-app')[0]?.body).toEqual({ business: 'pizza-palace' })
    expect(option(/Pizza Palace/)).toHaveAttribute('aria-pressed', 'true')
    expect(within(option(/Pizza Palace/)).getByText('Ilovada')).toBeInTheDocument()

    // The live preview is the shop itself.
    const preview = screen.getByTitle("Pizza Palace — ilovadagi ko'rinishi")
    expect(preview).toHaveAttribute('src', 'https://pizza-palace.portex.uz/')

    await user.click(screen.getByRole('button', { name: 'Tanlovni olib tashlash' }))
    expect(await screen.findByText("Ilovada do'kon tanlanmagan")).toBeInTheDocument()
    expect(backend.state.mobileApp).toBeNull()
    expect(screen.getByText("Do'kon tanlanmagan")).toBeInTheDocument()
  })

  it('is in the main menu', async () => {
    backend.state.businesses = sampleBusinesses()
    const { user } = renderApp('/')
    const menu = await screen.findByRole('navigation', { name: 'Asosiy menyu' })
    await user.click(within(menu).getByRole('link', { name: 'Mobil ilova' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Mobil ilova' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Mobil ilova' })).toHaveAttribute('aria-current', 'page')
  })
})
