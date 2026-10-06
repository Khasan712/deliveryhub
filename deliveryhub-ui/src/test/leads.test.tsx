import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, onTestFinished } from 'vitest'
import { leadsPolling } from '../api/queries'
import { backend } from './backend'
import { makeLead, sampleBusinesses, sampleLeads } from './fixtures'
import { renderApp } from './render'
import { server } from './server'

/** The card of an application by the name on it. */
function card(name: string) {
  return within(screen.getByRole('article', { name }))
}

const tabs = () => within(screen.getByRole('group', { name: "Holati bo'yicha" }))
const menu = () => within(screen.getByRole('navigation', { name: 'Asosiy menyu' }))
/** The requests of the list (the menu badge asks for the counts without a status). */
const listRequests = () => backend.requests('GET', '/leads').filter((request) => request.search.get('page_size') === '20')
const lead = (id: number) => backend.state.leads.find((each) => each.id === id)

describe('applications', () => {
  it('shows the number of new ones in the main menu', async () => {
    backend.state.leads = sampleLeads()
    const { user } = renderApp('/')

    await screen.findByRole('heading', { level: 1, name: 'Bizneslar' })
    const link = await menu().findByRole('link', { name: 'Arizalar, 2 ta yangi' })
    // The number itself, not only for screen readers: on phones the menu shows icons only.
    expect(within(link).getByText('2')).toBeInTheDocument()
    expect(backend.requests('GET', '/leads')[0]?.search.toString()).toBe('page_size=1')

    await user.click(link)
    expect(await screen.findByRole('heading', { level: 1, name: 'Arizalar' })).toBeInTheDocument()
    expect(menu().getByRole('link', { name: /^Arizalar/ })).toHaveAttribute('aria-current', 'page')
  })

  it('lists the new ones by default, newest first, with what the call needs', async () => {
    backend.state.leads = sampleLeads()
    const { user } = renderApp('/leads')

    await screen.findByRole('article', { name: 'Aziz Karimov' })
    expect(tabs().getByRole('button', { name: 'Yangi 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('article').map((article) => article.querySelector('h2')?.textContent)).toEqual([
      'Ольга Ким',
      'Aziz Karimov',
    ])
    expect(listRequests()[0]?.search.toString()).toBe('status=new&page=1&page_size=20')

    const aziz = card('Aziz Karimov')
    expect(aziz.getByText("Navro'z Choyxona")).toBeInTheDocument()
    expect(aziz.getByText(/Kafe yoki restoran/)).toBeInTheDocument()
    expect(aziz.getByRole('link', { name: '+998 93 555 11 22' })).toHaveAttribute('href', 'tel:+998935551122')
    expect(aziz.getByText('UZ')).toBeInTheDocument()
    expect(aziz.getByTitle("O'zbek tilida gaplashing")).toBeInTheDocument()
    expect(aziz.getByText("Menyuda 40 ta taom bor, o'zimiz yetkazib beramiz")).toBeInTheDocument()
    expect(aziz.getByText(/^5-oktabr( 2026)?, 09:30$/)).toBeInTheDocument()
    expect(aziz.queryByText(/Bog'lanilgan/)).not.toBeInTheDocument()
    expect(within(aziz.getByRole('group', { name: 'Holati' })).getByRole('button', { name: 'Yangi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const olga = card('Ольга Ким')
    expect(olga.getByText('RU')).toBeInTheDocument()
    expect(olga.getByTitle('Rus tilida gaplashing')).toBeInTheDocument()
    expect(olga.getByText(/Fast food/)).toBeInTheDocument()

    await user.click(aziz.getByRole('button', { name: 'Raqamni nusxalash' }))
    expect(await navigator.clipboard.readText()).toBe('+998935551122')
  })

  it('switches between the tabs and keeps the tab in the address', async () => {
    backend.state.leads = sampleLeads()
    const { user, router } = renderApp('/leads')
    await screen.findByRole('article', { name: 'Aziz Karimov' })

    await user.click(tabs().getByRole('button', { name: "Bog'lanildi 1" }))
    expect(await screen.findByRole('article', { name: 'Jasur' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=contacted')
    expect(tabs().getByRole('button', { name: "Bog'lanildi 1" })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('article', { name: 'Aziz Karimov' })).not.toBeInTheDocument()

    // Only a name and a phone on it; when we called; no quick action once it is not new.
    const jasur = card('Jasur')
    expect(jasur.getByText(/^4-oktabr( 2026)?, 19:00$/)).toBeInTheDocument()
    expect(jasur.queryByText(/Kafe|Fast food|Do'kon|Boshqa/)).not.toBeInTheDocument()
    expect(jasur.queryByRole('button', { name: /deb belgilash/ })).not.toBeInTheDocument()
    expect(jasur.getByRole('textbox', { name: /^Izoh/ })).toHaveValue("Ertaga qayta qo'ng'iroq qilamiz")

    await user.click(tabs().getByRole('button', { name: 'Hammasi 4' }))
    expect(router.state.location.search).toBe('?status=all')
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4))
    expect(listRequests().at(-1)?.search.toString()).toBe('page=1&page_size=20')

    // The default tab has a clean address.
    await user.click(tabs().getByRole('button', { name: 'Yangi 2' }))
    expect(router.state.location.search).toBe('')
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  })

  it('opens the tab from the address', async () => {
    backend.state.leads = sampleLeads()
    renderApp('/leads?status=won')

    expect(await screen.findByRole('article', { name: 'Malika Yusupova' })).toBeInTheDocument()
    expect(tabs().getByRole('button', { name: "Mijoz bo'ldi 1" })).toHaveAttribute('aria-pressed', 'true')
    expect(card('Malika Yusupova').getByText(/Gul Market/)).toBeInTheDocument()
    expect(card('Malika Yusupova').getByText(/Do'kon/)).toBeInTheDocument()
  })

  it('marks an application contacted: it leaves the new ones and the menu badge drops', async () => {
    backend.state.leads = sampleLeads()
    const { user } = renderApp('/leads')
    await screen.findByRole('article', { name: 'Aziz Karimov' })
    expect(menu().getByRole('link', { name: 'Arizalar, 2 ta yangi' })).toBeInTheDocument()

    await user.click(card('Aziz Karimov').getByRole('button', { name: "Bog'lanildi deb belgilash" }))

    expect(await screen.findByText("«Bog'lanildi» deb belgilandi")).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Aziz Karimov' })).not.toBeInTheDocument()
    const [patch] = backend.requests('PATCH', '/leads/3')
    expect(patch?.body).toEqual({ status: 'contacted' })
    expect(patch?.headers['x-csrftoken']).toBe('csrf-token-1')
    expect(lead(3)?.contacted_at).toBe('2026-10-05T12:00:00+05:00')
    expect(menu().getByRole('link', { name: 'Arizalar, 1 ta yangi' })).toBeInTheDocument()
    expect(tabs().getByRole('button', { name: 'Yangi 1' })).toBeInTheDocument()
    expect(tabs().getByRole('button', { name: "Bog'lanildi 2" })).toBeInTheDocument()
    // The keyboard focus moves on to the next application, not back to the top of the page.
    expect(screen.getByRole('article', { name: 'Ольга Ким' })).toHaveFocus()

    // The last new one: the tab is empty, the badge is gone, the focus is on the tab.
    await user.click(card('Ольга Ким').getByRole('button', { name: "Bog'lanildi deb belgilash" }))
    expect(await screen.findByText("Yangi arizalar yo'q")).toBeInTheDocument()
    expect(menu().getByRole('link', { name: 'Arizalar' })).toBeInTheDocument()
    expect(tabs().getByRole('button', { name: 'Yangi 0' })).toHaveFocus()
  })

  it('sets any status, and keeps the time of the first call', async () => {
    backend.state.leads = sampleLeads()
    const { user } = renderApp('/leads?status=all')
    await screen.findByRole('article', { name: 'Jasur' })

    // "Hammasi" keeps a called one: its quick action goes away, the focus moves to its new status.
    await user.click(card('Aziz Karimov').getByRole('button', { name: "Bog'lanildi deb belgilash" }))
    const azizStatus = within(card('Aziz Karimov').getByRole('group', { name: 'Holati' }))
    await waitFor(() => expect(azizStatus.getByRole('button', { name: "Bog'lanildi" })).toHaveFocus())
    expect(azizStatus.getByRole('button', { name: "Bog'lanildi" })).toHaveAttribute('aria-pressed', 'true')
    expect(card('Aziz Karimov').queryByRole('button', { name: "Bog'lanildi deb belgilash" })).not.toBeInTheDocument()

    const status = within(card('Jasur').getByRole('group', { name: 'Holati' }))
    expect(status.getByRole('button', { name: "Bog'lanildi" })).toHaveAttribute('aria-pressed', 'true')

    await user.click(status.getByRole('button', { name: "Mijoz bo'ldi" }))

    expect(await screen.findByText("«Mijoz bo'ldi» deb belgilandi")).toBeInTheDocument()
    // "Hammasi" keeps it, with its new status.
    expect(status.getByRole('button', { name: "Mijoz bo'ldi" })).toHaveAttribute('aria-pressed', 'true')
    expect(status.getByRole('button', { name: "Bog'lanildi" })).toHaveAttribute('aria-pressed', 'false')
    expect(backend.requests('PATCH', '/leads/2')[0]?.body).toEqual({ status: 'won' })
    expect(lead(2)?.contacted_at).toBe('2026-10-04T19:00:00+05:00')
    expect(tabs().getByRole('button', { name: "Mijoz bo'ldi 2" })).toBeInTheDocument()
  })

  it('saves our note', async () => {
    backend.state.leads = sampleLeads()
    const { user } = renderApp('/leads')
    const aziz = within(await screen.findByRole('article', { name: 'Aziz Karimov' }))
    const note = aziz.getByLabelText("Izoh (faqat xodimlar ko'radi)")
    expect(aziz.queryByRole('button', { name: 'Saqlash' })).not.toBeInTheDocument()

    await user.type(note, '  Ertaga 10:00 da uchrashuv ')
    await user.click(aziz.getByRole('button', { name: 'Saqlash' }))

    expect(await screen.findByText('Izoh saqlandi')).toBeInTheDocument()
    expect(backend.requests('PATCH', '/leads/3')[0]?.body).toEqual({ note: 'Ertaga 10:00 da uchrashuv' })
    expect(lead(3)?.note).toBe('Ertaga 10:00 da uchrashuv')
    expect(note).toHaveValue('Ertaga 10:00 da uchrashuv')
    expect(note).toHaveFocus()
    expect(aziz.queryByRole('button', { name: 'Saqlash' })).not.toBeInTheDocument()
    // A note does not change the status.
    expect(aziz.getByRole('button', { name: "Bog'lanildi deb belgilash" })).toBeInTheDocument()

    // "Bekor qilish" brings the saved note back.
    await user.type(note, ' — bekor')
    await user.click(aziz.getByRole('button', { name: 'Bekor qilish' }))
    expect(note).toHaveValue('Ertaga 10:00 da uchrashuv')
    expect(backend.requests('PATCH', '/leads/3')).toHaveLength(1)
  })

  it('saves an unsaved note together with a new status', async () => {
    backend.state.leads = sampleLeads()
    const { user } = renderApp('/leads')
    const aziz = within(await screen.findByRole('article', { name: 'Aziz Karimov' }))

    await user.type(aziz.getByRole('textbox', { name: /^Izoh/ }), "Qiziqdi, narxlarni yuboramiz")
    await user.click(aziz.getByRole('button', { name: "Bog'lanildi deb belgilash" }))

    expect(await screen.findByText('Aziz Karimov — izoh ham saqlandi.')).toBeInTheDocument()
    expect(backend.requests('PATCH', '/leads/3')[0]?.body).toEqual({
      status: 'contacted',
      note: 'Qiziqdi, narxlarni yuboramiz',
    })
    expect(lead(3)?.note).toBe('Qiziqdi, narxlarni yuboramiz')
  })

  it('shows why a note was not saved', async () => {
    backend.state.leads = sampleLeads()
    const { user } = renderApp('/leads')
    const aziz = within(await screen.findByRole('article', { name: 'Aziz Karimov' }))
    const note = aziz.getByRole('textbox', { name: /^Izoh/ })
    expect(note).toHaveAttribute('maxlength', '1000')

    // Typing stops at 1000; a longer text (pasted around the limit) is the API's to refuse.
    fireEvent.change(note, { target: { value: 'x'.repeat(1001) } })
    expect(aziz.getByText('1001 / 1000')).toBeInTheDocument()
    await user.click(aziz.getByRole('button', { name: 'Saqlash' }))

    expect(await screen.findByText("Izohni saqlab bo'lmadi")).toBeInTheDocument()
    expect(aziz.getByText('Juda uzun')).toBeInTheDocument()
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(note).toHaveFocus()
    expect(note).toHaveValue('x'.repeat(1001))
    expect(lead(3)?.note).toBe('')
  })

  it('says when a tab is empty', async () => {
    const { user } = renderApp('/leads')

    expect(await screen.findByText("Yangi arizalar yo'q")).toBeInTheDocument()
    expect(tabs().getByRole('button', { name: 'Yangi 0' })).toBeInTheDocument()

    await user.click(tabs().getByRole('button', { name: "Rad etildi 0" }))
    expect(await screen.findByText("Rad etilgan arizalar yo'q")).toBeInTheDocument()
    await user.click(tabs().getByRole('button', { name: 'Hammasi 0' }))
    expect(await screen.findByText("Hali ariza yo'q")).toBeInTheDocument()
  })

  it('shows skeletons while loading, then an error with a retry', async () => {
    backend.state.leads = sampleLeads()
    let down = true
    server.use(
      http.get('/api/v1/leads', ({ request }) => {
        // Only the list fails (the menu badge asks without a status).
        if (!down || !new URL(request.url).searchParams.has('status')) return undefined
        return HttpResponse.json({ error: 'server_error' }, { status: 500 })
      }),
    )
    const { user } = renderApp('/leads')

    expect(await screen.findByText('Arizalar yuklanmoqda…')).toBeInTheDocument()
    expect(await screen.findByText("Ma'lumotlarni yuklab bo'lmadi")).toBeInTheDocument()
    expect(screen.getByText(/Serverda xatolik yuz berdi/)).toBeInTheDocument()

    down = false
    await user.click(screen.getByRole('button', { name: 'Qayta urinish' }))
    expect(await screen.findByRole('article', { name: 'Aziz Karimov' })).toBeInTheDocument()
  })

  it('pages through many applications', async () => {
    backend.state.leads = Array.from({ length: 25 }, (_, index) =>
      makeLead({ id: index + 1, name: `Ariza ${index + 1}`, created_at: `2026-10-04T10:${String(index).padStart(2, '0')}:00+05:00` }),
    )
    const { user, router } = renderApp('/leads')

    await screen.findByRole('article', { name: 'Ariza 25' })
    expect(screen.getAllByRole('article')).toHaveLength(20)
    let pager = within(screen.getByRole('navigation', { name: 'Sahifalar' }))
    expect(pager.getByText('1 / 2')).toBeInTheDocument()
    expect(pager.getByRole('button', { name: /Oldingi/ })).toBeDisabled()

    await user.click(pager.getByRole('button', { name: /Keyingi/ }))
    expect(await screen.findByRole('article', { name: 'Ariza 5' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(router.state.location.search).toBe('?page=2')
    expect(listRequests().at(-1)?.search.toString()).toBe('status=new&page=2&page_size=20')
    // The focus goes to the top of the new page.
    expect(screen.getByRole('region', { name: "Arizalar ro'yxati" })).toHaveFocus()
    pager = within(screen.getByRole('navigation', { name: 'Sahifalar' }))
    expect(pager.getByRole('button', { name: /Keyingi/ })).toBeDisabled()

    // A tab opens on its first page.
    await user.click(tabs().getByRole('button', { name: 'Hammasi 25' }))
    expect(router.state.location.search).toBe('?status=all')
  })

  it('picks up new applications by itself', async () => {
    const interval = leadsPolling.intervalMs
    leadsPolling.intervalMs = 50
    onTestFinished(() => {
      leadsPolling.intervalMs = interval
    })
    backend.state.leads = [makeLead()]
    renderApp('/leads')
    await screen.findByRole('article', { name: 'Aziz Karimov' })
    expect(menu().getByRole('link', { name: 'Arizalar, 1 ta yangi' })).toBeInTheDocument()

    // Someone leaves an application on the landing page.
    backend.state.leads.push(makeLead({ id: 9, name: 'Bobur', phone: '+998901234500', created_at: '2026-10-05T11:40:00+05:00' }))

    expect(await screen.findByRole('article', { name: 'Bobur' })).toBeInTheDocument()
    expect(menu().getByRole('link', { name: 'Arizalar, 2 ta yangi' })).toBeInTheDocument()
    expect(tabs().getByRole('button', { name: 'Yangi 2' })).toBeInTheDocument()
  })
})

describe('our page for businesses', () => {
  it('links to the sample shop chosen here, active businesses only', async () => {
    backend.state.businesses = sampleBusinesses()
    const active = backend.state.businesses.filter((business) => business.status === 'active')
    const suspended = backend.state.businesses.find((business) => business.status === 'suspended')
    const { user } = renderApp('/leads')

    const site = within(await screen.findByRole('region', { name: /^Sayt/ }))
    const select = site.getByLabelText("Namuna do'kon")
    await waitFor(() => expect(select).toBeEnabled())
    expect(select).toHaveValue('')
    expect(site.getByRole('link', { name: /Saytni ochish/ })).toHaveAttribute('href', 'https://portex.uz/')
    const offered = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(offered).toEqual(["Ko'rsatilmasin", ...active.map((business) => business.name)])
    expect(offered).not.toContain(suspended?.name)

    const sample = active[0]!
    await user.selectOptions(select, sample.slug)
    expect(await screen.findByText(`Saytda namuna do'kon: «${sample.name}»`)).toBeInTheDocument()
    expect(backend.requests('PUT', '/landing')[0]?.body).toEqual({ sample: sample.slug })
    expect(backend.state.landingSample).toBe(sample.slug)
    expect(select).toHaveValue(sample.slug)

    await user.selectOptions(select, '')
    expect(await screen.findByText("Saytda namuna do'kon ko'rsatilmaydi")).toBeInTheDocument()
    expect(backend.state.landingSample).toBeNull()
  })
})
