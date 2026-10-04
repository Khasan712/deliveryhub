import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { backend } from './backend'
import { makeBusiness, sampleBusinesses } from './fixtures'
import { renderApp } from './render'

const SETUP_TITLE = 'Botlarni yaratish — ikki bosishda'
const GOOD_TOKEN = '123456789:AAHgoodTokenGoodTokenGoodToken123'
const USED_TOKEN = '987654321:AAHusedTokenUsedTokenUsedToken123'
const WRONG_TOKEN = '555555555:AAHwrongTokenWrongTokenWrongToken1'

/** The card of a bot by its title ("Mijozlar boti" / "Xodimlar boti"). */
function botCard(title: string) {
  const card = screen.getByRole('heading', { level: 3, name: title }).closest('.rounded-2xl')
  if (!(card instanceof HTMLElement)) throw new Error(`no bot card ${title}`)
  return within(card)
}

const valueOf = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling

describe('business page', () => {
  it('shows the header, numbers, addresses, bots and owner', async () => {
    backend.state.businesses = sampleBusinesses()
    renderApp('/b/pizza-palace')

    expect(await screen.findByRole('heading', { level: 1, name: 'Pizza Palace' })).toBeInTheDocument()
    expect(screen.getByText('Faol')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Do'kon/ })).toHaveAttribute('href', 'https://pizza-palace.portex.uz/')
    expect(screen.getByRole('link', { name: /^Admin panel/ })).toHaveAttribute('href', 'https://pizza-palace-admin.portex.uz/')
    expect(valueOf('Bugungi buyurtmalar')).toHaveTextContent('5')
    expect(valueOf('Bugungi tushum')).toHaveTextContent("1 200 000 so'm")
    expect(valueOf('Jami buyurtmalar')).toHaveTextContent('140')
    expect(valueOf('Mijozlar')).toHaveTextContent('52')

    const addresses = within(screen.getByRole('region', { name: 'Manzillar' }))
    expect(addresses.getByRole('link', { name: /pizza-palace\.portex\.uz/ })).toHaveAttribute(
      'href',
      'https://pizza-palace.portex.uz/',
    )
    expect(addresses.getByRole('link', { name: /pizza-palace-admin\.portex\.uz/ })).toBeInTheDocument()

    const client = botCard('Mijozlar boti')
    expect(client.getByRole('link', { name: /@pizza_palace_bot/ })).toHaveAttribute('href', 'https://t.me/pizza_palace_bot')
    expect(client.getByText('Ishlayapti')).toBeInTheDocument()
    expect(client.getByText('Token bilan ulangan')).toBeInTheDocument()
    const staff = botCard('Xodimlar boti')
    expect(staff.getByText('@pizza_staff_bot')).toBeInTheDocument()
    expect(staff.getByText("Jarayon o'chiq")).toBeInTheDocument()
    expect(staff.getByText('Platforma orqali yaratilgan')).toBeInTheDocument()
    // Both bots are there: nothing to set up.
    expect(screen.queryByText(SETUP_TITLE)).not.toBeInTheDocument()

    const owner = within(screen.getByRole('region', { name: 'Egasi' }))
    expect(owner.getByText('Aziz')).toBeInTheDocument()
    expect(owner.getByText('+998 90 111 22 33')).toBeInTheDocument()
  })

  it('creates bots in two taps: setup link with QR, then the bots show up by themselves', async () => {
    backend.state.businesses = [makeBusiness({ bots: { client: null, admin: null }, missing_roles: ['client', 'admin'] })]
    const { user } = renderApp('/b/burger-house')

    expect(await screen.findByText(SETUP_TITLE)).toBeInTheDocument()
    expect(botCard('Mijozlar boti').getByText('Ulanmagan')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'QR va havola olish' }))

    const url = 'https://t.me/deliveryhub_bot?start=setup_burgerhouse'
    const qr = await screen.findByRole('img', { name: 'Botlarni yaratish havolasining QR kodi' })
    const src = qr.getAttribute('src') ?? ''
    expect(src).toMatch(/^data:image\/svg\+xml/)
    expect(decodeURIComponent(src)).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"')
    expect(screen.getByText(url)).toBeInTheDocument()
    expect(screen.getByText(/9-oktabr, 19:40 gacha amal qiladi/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Telegram'da ochish/ })).toHaveAttribute('href', url)
    expect(screen.getByText('Platforma boti: @deliveryhub_bot')).toBeInTheDocument()
    expect(backend.requests('POST', '/businesses/burger-house/bots/setup-link')[0]?.headers['x-csrftoken']).toBe(
      'csrf-token-1',
    )

    await user.click(screen.getByRole('button', { name: 'Nusxalash' }))
    expect(await navigator.clipboard.readText()).toBe(url)

    // The owner taps the two buttons in Telegram; the page notices on its own.
    backend.createManagedBots('burger-house')
    expect(await screen.findByText('@burger_house_client_bot ulandi')).toBeInTheDocument()
    expect(await screen.findByText('@burger_house_admin_bot ulandi')).toBeInTheDocument()
    expect(screen.queryByText(SETUP_TITLE)).not.toBeInTheDocument()
    expect(botCard('Xodimlar boti').getByText('@burger_house_admin_bot')).toBeInTheDocument()
    expect(botCard('Xodimlar boti').getByText('Platforma orqali yaratilgan')).toBeInTheDocument()
  })

  it('explains the platform bot when there is none and opens the token form', async () => {
    backend.state.businesses = [makeBusiness({ platform_bot: null })]
    renderApp('/b/burger-house')

    expect(await screen.findByText(/Buning uchun platforma boti kerak/)).toBeInTheDocument()
    expect(screen.getByText('PLATFORM_BOT_TOKEN')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'QR va havola olish' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Bot tokeni')).toBeVisible()
  })

  it('shows why a setup link could not be made', async () => {
    backend.state.businesses = [makeBusiness()]
    backend.state.platformBot = null // the token was removed after the page loaded
    const { user } = renderApp('/b/burger-house')

    await user.click(await screen.findByRole('button', { name: 'QR va havola olish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Havola yaratib bo'lmadi. Platforma boti tokenini tekshiring.",
    )
  })

  it('connects a bot with a @BotFather token and explains every error', async () => {
    backend.state.businesses = [makeBusiness()]
    backend.state.telegramBots = { [GOOD_TOKEN]: 'burger_staff_bot', [USED_TOKEN]: 'someone_elses_bot' }
    backend.state.botsInUse = [USED_TOKEN]
    const { user } = renderApp('/b/burger-house')

    await user.click(await screen.findByText('@BotFather tokeni bilan ulash'))
    // The missing bot is picked by default.
    expect(screen.getByLabelText('Bot turi')).toHaveValue('admin')
    const token = screen.getByLabelText('Bot tokeni')
    const connect = screen.getByRole('button', { name: 'Ulash' })

    await user.type(token, 'not a token')
    await user.click(connect)
    expect(screen.getByText(/Token ko'rinishi noto'g'ri/)).toBeInTheDocument()
    expect(backend.requests('POST', '/businesses/burger-house/bots')).toHaveLength(0)

    await user.clear(token)
    await user.type(token, WRONG_TOKEN)
    await user.click(connect)
    expect(await screen.findByText("Token noto'g'ri yoki Telegram javob bermadi")).toBeInTheDocument()
    expect(token).toHaveAttribute('aria-invalid', 'true')

    await user.clear(token)
    await user.type(token, USED_TOKEN)
    await user.click(connect)
    expect(await screen.findByText('Bu bot boshqa biznesga ulangan')).toBeInTheDocument()

    await user.clear(token)
    await user.type(token, GOOD_TOKEN)
    await user.click(connect)
    expect(await screen.findByText('@burger_staff_bot ulandi')).toBeInTheDocument()
    const staff = botCard('Xodimlar boti')
    expect(staff.getByText('@burger_staff_bot')).toBeInTheDocument()
    expect(staff.getByText('Token bilan ulangan')).toBeInTheDocument()
    expect(token).toHaveValue('')

    const requests = backend.requests('POST', '/businesses/burger-house/bots')
    expect(requests.at(-1)?.body).toEqual({ role: 'admin', token: GOOD_TOKEN })
    expect(requests.at(-1)?.headers['x-csrftoken']).toBe('csrf-token-1')
    // Every bot is connected now: the setup block is gone.
    expect(screen.queryByText(SETUP_TITLE)).not.toBeInTheDocument()
  })

  it('disconnects a bot after confirmation', async () => {
    backend.state.businesses = [makeBusiness()]
    const { user } = renderApp('/b/burger-house')

    await user.click(await screen.findByRole('button', { name: 'Mijozlar botini uzish' }))
    let dialog = screen.getByRole('alertdialog', { name: 'Bot platformadan uzilsinmi?' })
    expect(within(dialog).getByText('@burger_house_bot')).toBeInTheDocument()
    // The safe choice has the focus.
    expect(within(dialog).getByRole('button', { name: 'Bekor qilish' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Bekor qilish' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(backend.requests('DELETE', '/businesses/burger-house/bots/client')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Mijozlar botini uzish' }))
    dialog = screen.getByRole('alertdialog', { name: 'Bot platformadan uzilsinmi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Uzish' }))

    expect(await screen.findByText('Bot uzildi')).toBeInTheDocument()
    expect(botCard('Mijozlar boti').getByText('Ulanmagan')).toBeInTheDocument()
    expect(backend.requests('DELETE', '/businesses/burger-house/bots/client')[0]?.headers['x-csrftoken']).toBe(
      'csrf-token-1',
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText(SETUP_TITLE)).toBeInTheDocument()
  })

  it('suspends and activates the business with confirmation', async () => {
    backend.state.businesses = [makeBusiness()]
    const { user } = renderApp('/b/burger-house')

    await user.click(await screen.findByRole('button', { name: "To'xtatish" }))
    let dialog = screen.getByRole('alertdialog', { name: "Biznes to'xtatilsinmi?" })
    expect(within(dialog).getByText("Do'kon, admin panel va botlar ishlamay qoladi.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: "To'xtatish" }))

    expect(await screen.findByText("Biznes to'xtatildi")).toBeInTheDocument()
    expect(backend.requests('POST', '/businesses/burger-house/status')[0]?.body).toEqual({ status: 'suspended' })
    expect(screen.getAllByText("To'xtatilgan").length).toBeGreaterThan(0)
    expect(screen.getByText(/Do'kon, admin panel va botlar hozir ishlamayapti/)).toBeInTheDocument()

    const [activate] = screen.getAllByRole('button', { name: 'Yoqish' })
    await user.click(activate!)
    dialog = screen.getByRole('alertdialog', { name: 'Biznes yoqilsinmi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Yoqish' }))

    expect(await screen.findByText('Biznes yoqildi')).toBeInTheDocument()
    expect(backend.requests('POST', '/businesses/burger-house/status')[1]?.body).toEqual({ status: 'active' })
    expect(screen.getByText('Faol')).toBeInTheDocument()
    expect(screen.queryByText(/hozir ishlamayapti/)).not.toBeInTheDocument()
  })

  it('deletes a suspended business for good once its address is typed', async () => {
    backend.state.businesses = [makeBusiness({ status: 'suspended' }), makeBusiness({ slug: 'pizza-palace', name: 'Pizza Palace' })]
    const { user } = renderApp('/b/burger-house')

    const zone = within(await screen.findByRole('region', { name: "Biznesni o'chirish" }))
    await user.click(zone.getByRole('button', { name: "Biznesni o'chirish" }))
    const dialog = within(screen.getByRole('alertdialog', { name: "«Burger House» butunlay o'chirilsinmi?" }))
    const confirm = dialog.getByRole('button', { name: "Butunlay o'chirish" })
    expect(confirm).toBeDisabled()
    const field = dialog.getByLabelText(/Tasdiqlash uchun manzilni yozing/)
    await user.type(field, 'burger')
    expect(confirm).toBeDisabled()
    await user.type(field, '-house')
    await user.click(confirm)

    expect(await screen.findByText("Biznes o'chirildi")).toBeInTheDocument()
    expect(backend.requests('DELETE', '/businesses/burger-house')[0]?.body).toEqual({ confirm: 'burger-house' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Bizneslar' })).toBeInTheDocument()
    expect(await screen.findByText('Pizza Palace')).toBeInTheDocument()
    // Gone from the list (its name is only in the toast now).
    expect(document.querySelector('a[href="/b/burger-house"]')).toBeNull()
  })

  it('asks to suspend an active business before deleting it', async () => {
    backend.state.businesses = [makeBusiness()]
    renderApp('/b/burger-house')

    const zone = within(await screen.findByRole('region', { name: "Biznesni o'chirish" }))
    expect(zone.getByRole('button', { name: "Biznesni o'chirish" })).toBeDisabled()
    expect(zone.getByText(/Avval biznesni to'xtating/)).toBeInTheDocument()
  })

  it('shows why the business could not be deleted', async () => {
    backend.state.businesses = [makeBusiness({ status: 'suspended' })]
    const { server } = await import('./server')
    const { http, HttpResponse } = await import('msw')
    server.use(http.delete('/api/v1/businesses/burger-house', () =>
      HttpResponse.json({ error: 'business_active' }, { status: 409 }), { once: true }))
    const { user } = renderApp('/b/burger-house')

    await user.click(await screen.findByRole('button', { name: "Biznesni o'chirish" }))
    const dialog = within(screen.getByRole('alertdialog'))
    await user.type(dialog.getByLabelText(/Tasdiqlash uchun manzilni yozing/), 'burger-house')
    await user.click(dialog.getByRole('button', { name: "Butunlay o'chirish" }))
    expect(await dialog.findByText(/Avval biznesni to'xtating/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Burger House' })).toBeInTheDocument()
  })

  it('makes a new owner password and shows it once', async () => {
    backend.state.businesses = [makeBusiness()]
    const { user } = renderApp('/b/burger-house')

    await user.click(await screen.findByRole('button', { name: 'Yangi parol yaratish' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Egasi uchun yangi parol yaratilsinmi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Yangi parol yaratish' }))

    const panel = await screen.findByRole('region', { name: "Egasi uchun kirish ma'lumotlari — faqat hozir ko'rinadi" })
    expect(within(panel).getByText('Fresh-Pass-42')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Hammasini nusxalash' }))
    expect(await navigator.clipboard.readText()).toBe(
      'Admin panel: https://burger-house-admin.portex.uz/\nTelefon: +998901112233\nParol: Fresh-Pass-42',
    )
    await user.click(within(panel).getByRole('button', { name: 'Yopish' }))
    expect(screen.queryByText('Fresh-Pass-42')).not.toBeInTheDocument()
  })

  it('explains when the owner account is missing', async () => {
    backend.state.businesses = [makeBusiness()]
    const { user } = renderApp('/b/burger-house')
    await screen.findByRole('heading', { level: 1, name: 'Burger House' })
    backend.business('burger-house').owner = null // removed in the meantime

    await user.click(screen.getByRole('button', { name: 'Yangi parol yaratish' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Egasi uchun yangi parol yaratilsinmi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Yangi parol yaratish' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Egasining admin akkaunti topilmadi.')
  })

  it('edits the profile and sends only what changed', async () => {
    backend.state.businesses = [makeBusiness()]
    const { user } = renderApp('/b/burger-house')

    const save = await screen.findByRole('button', { name: 'Saqlash' })
    expect(save).toBeDisabled()
    const name = screen.getByLabelText('Nomi')
    await user.clear(name)
    await user.type(name, 'Burger House Plus')
    const minOrder = screen.getByLabelText('Min. buyurtma')
    await user.clear(minOrder)
    await user.type(minOrder, '25000')
    expect(minOrder).toHaveValue('25 000')
    await user.click(save)

    expect(await screen.findByText('Profil saqlandi')).toBeInTheDocument()
    expect(backend.requests('PATCH', '/businesses/burger-house')[0]?.body).toEqual({
      name: 'Burger House Plus',
      min_order: 25000,
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Burger House Plus' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saqlash' })).toBeDisabled()
  })

  it('removes the logo', async () => {
    backend.state.businesses = [makeBusiness({ logo: '/media/burger_house/logos/old.png' })]
    const { user } = renderApp('/b/burger-house')

    await user.click(await screen.findByRole('button', { name: 'Olib tashlash' }))
    expect(screen.getByText('Logo olib tashlanadi')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Saqlash' }))

    expect(await screen.findByText('Profil saqlandi')).toBeInTheDocument()
    expect(backend.requests('PATCH', '/businesses/burger-house')[0]?.body).toEqual({ logo: null })
    await waitFor(() => expect(backend.business('burger-house').logo).toBeNull())
    expect(screen.queryByRole('button', { name: 'Olib tashlash' })).not.toBeInTheDocument()
  })

  it('puts a business opened before maps on the map', async () => {
    backend.state.businesses = sampleBusinesses()
    const { user } = renderApp('/b/sushi-bar')

    const card = within(await screen.findByRole('region', { name: 'Joylashuv' }))
    expect(card.getByText(/Biznes hali xaritada belgilanmagan/)).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Joylashuvni saqlash' })).toBeDisabled()

    await user.click(await card.findByRole('button', { name: 'Xaritaga bosish' }))
    await waitFor(() =>
      expect(card.getByLabelText('Biznes manzili')).toHaveValue("Bunyodkor ko'chasi, 3, Chilonzor tumani, Toshkent"),
    )
    await user.click(card.getByRole('button', { name: 'Joylashuvni saqlash' }))

    expect(await screen.findByText('Joylashuv saqlandi')).toBeInTheDocument()
    const [patch] = backend.requests('PATCH', '/businesses/sushi-bar')
    expect(patch?.body).toEqual({ address: "Bunyodkor ko'chasi, 3, Chilonzor tumani, Toshkent", lat: 41.2856, lng: 69.2035 })
    expect(backend.business('sushi-bar')).toMatchObject({ lat: 41.2856, lng: 69.2035 })
    expect(card.queryByText(/Biznes hali xaritada belgilanmagan/)).not.toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Joylashuvni saqlash' })).toBeDisabled()
  })

  it('moves a business on the map and keeps its own address text', async () => {
    backend.state.businesses = [makeBusiness()]
    const { user } = renderApp('/b/burger-house')

    const card = within(await screen.findByRole('region', { name: 'Joylashuv' }))
    expect(card.getByText('41.311081, 69.279737')).toBeInTheDocument()
    expect(card.getByLabelText('Biznes manzili')).toHaveValue("Amir Temur ko'chasi, 15")

    await user.click(await card.findByRole('button', { name: 'Xaritaga bosish' }))
    expect(card.getByText('41.285600, 69.203500')).toBeInTheDocument()
    await waitFor(() => expect(backend.requests('GET', '/geo/reverse')).toHaveLength(1))
    // The saved address was not filled in by the map: it stays until changed by hand.
    expect(card.getByLabelText('Biznes manzili')).toHaveValue("Amir Temur ko'chasi, 15")

    await user.click(card.getByRole('button', { name: 'Bekor qilish' }))
    expect(card.getByText('41.311081, 69.279737')).toBeInTheDocument()
    await user.clear(card.getByLabelText('Biznes manzili'))
    await user.click(card.getByRole('button', { name: 'Joylashuvni saqlash' }))
    expect(card.getByText('Biznes manzilini kiriting')).toBeInTheDocument()
    expect(card.getByLabelText('Biznes manzili')).toHaveFocus()
    expect(backend.requests('PATCH', '/businesses/burger-house')).toHaveLength(0)
  })

  it('focuses the business heading once it has loaded after navigating to it', async () => {
    backend.state.businesses = sampleBusinesses()
    const { user } = renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'Pizza Palace' }))

    const heading = await screen.findByRole('heading', { level: 1, name: 'Pizza Palace' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('says when the business does not exist', async () => {
    renderApp('/b/nope')
    expect(await screen.findByRole('heading', { level: 1, name: 'Biznes topilmadi' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bizneslarga qaytish' })).toHaveAttribute('href', '/')
  })
})
