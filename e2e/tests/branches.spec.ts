import { expect, test, type Page } from '@playwright/test'
import { adminApi, customerToken, shopApi } from './api'
import { newBusiness, urls } from './env'
import { fillCatalog, openBusiness, placeOrder, signInToAdmin } from './steps'

const CHILONZOR = { name: 'Chilonzor', point: '41.2856, 69.2044', address: 'Bunyodkor shoh ko‘chasi, 42' }
const YUNUSOBOD = { name: 'Yunusobod', lat: 41.364, lng: 69.287, address: 'Amir Temur shoh ko‘chasi, 107' }
/** The delivery customer lives 0.7 km from Chilonzor (and 10 km from Yunusobod). */
const CUSTOMER = { lat: 41.29, lng: 69.21, address: 'Qatortol 5' }

/**
 * Branches, through every part: our panel lets the business have them → the owner opens two and a branch admin →
 * a delivery order waits for the head office, which sees the nearest branch and sends it to another one → only
 * that branch's admin sees it → a pickup customer picks the branch in the shop.
 */
test.describe.serial('a business with branches', () => {
  const business = newBusiness()
  const product = 'E2E Lavash'
  const cook = { phone: `+99891${String(Date.now()).slice(-7)}`, password: 'e2e-branch-pass' }
  let deliveryId = 0
  let owner: Page
  let customer: Page

  test.beforeAll(async ({ browser }) => {
    owner = await (await browser.newContext()).newPage()
    customer = await (await browser.newContext()).newPage()
  })

  test.afterAll(async () => {
    await owner.context().close()
    await customer.context().close()
  })

  test('our panel lets the business open branches', async ({ page }) => {
    await openBusiness(page, business)
    const allowed = page.getByRole('switch', { name: 'Filial ochishga ruxsat' })
    await expect(allowed).toHaveAttribute('aria-checked', 'false')
    await allowed.click()
    await expect(page.getByText('Filial ochishga ruxsat berildi')).toBeVisible()
    await expect(allowed).toHaveAttribute('aria-checked', 'true')
  })

  test('the owner opens two branches and a branch admin', async () => {
    await signInToAdmin(owner, business)
    await fillCatalog(owner, business, product)

    // The first one through the form: its place typed into the map search (this stack has no map server).
    await owner.goto(`${urls.admin(business.slug)}/branches`)
    await expect(owner.getByRole('heading', { name: "Hali filial yo'q" })).toBeVisible()
    await owner.goto(`${urls.admin(business.slug)}/branches/new`)
    await owner.getByLabel('Filial nomi').fill(CHILONZOR.name)
    await owner.getByLabel('Xaritadan qidirish').fill(CHILONZOR.point)
    await owner.getByRole('button', { name: 'Topish' }).click()
    // The label also holds the required mark («Manzil *»): the field's accessible name is the plain word.
    await owner.getByRole('textbox', { name: 'Manzil', exact: true }).fill(CHILONZOR.address)
    await owner.getByRole('button', { name: 'Filial yaratish' }).click()
    await expect(owner.getByText("Filial qo'shildi")).toBeVisible()

    // The second one and the branch admin straight through the API.
    const api = adminApi(owner, business.slug)
    const yunusobod = await api.post('/branches', YUNUSOBOD)
    await api.post('/users', {
      phone_number: cook.phone, first_name: 'Filial', last_name: 'Admini', role: 'branch', branch_id: yunusobod.id,
      is_active: true, password: cook.password,
    })

    await owner.goto(`${urls.admin(business.slug)}/branches`)
    for (const name of [CHILONZOR.name, YUNUSOBOD.name]) {
      await expect(owner.getByRole('main').getByText(name, { exact: true }).first()).toBeVisible()
    }
  })

  test('a delivery order waits for the head office, which sends it to a branch', async ({ page }) => {
    const token = await customerToken(page, business.slug, '+998905559876')
    const shop = shopApi(page, business.slug, token)
    const { products } = await shop.get('/shop')
    const { order } = await shop.post('/orders', {
      items: [{ product_id: products[0].id, quantity: 2 }], name: 'E2E Yetkazish', phone: '905559876',
      delivery_type: 'delivery', address: CUSTOMER.address, lat: CUSTOMER.lat, lng: CUSTOMER.lng,
      payment_method: 'cash', platform: 'web',
    })
    deliveryId = order.id

    await owner.goto(`${urls.admin(business.slug)}/orders/${deliveryId}`)
    await expect(owner.getByText('Filial tanlanmagan').first()).toBeVisible()
    const chilonzor = owner.getByRole('radio', { name: new RegExp(`^${CHILONZOR.name}`) })
    // The nearest one is suggested and chosen; the owner sends it to the other one.
    await expect(chilonzor).toBeChecked()
    await expect(owner.getByRole('main').getByText('Eng yaqin').first()).toBeVisible()
    await owner.getByRole('main').getByText(YUNUSOBOD.name, { exact: true }).first().click()
    await owner.getByRole('button', { name: 'Yunusobodga yuborish' }).click()
    await expect(owner.getByText('Yunusobod filialiga yuborildi')).toBeVisible()
  })

  test('only the branch admin of that branch sees it, and no customers', async ({ page }) => {
    await page.goto(`${urls.admin(business.slug)}/login`)
    await page.getByLabel(/Telefon raqami/).fill(cook.phone)
    await page.getByLabel('Parol', { exact: true }).fill(cook.password)
    await page.getByRole('button', { name: 'Kirish' }).click()
    await expect(page).toHaveURL(`${urls.admin(business.slug)}/`)
    await page.goto(`${urls.admin(business.slug)}/orders`)
    await expect(page.getByRole('main').getByText(`#${deliveryId}`).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mijozlar' })).toHaveCount(0)
  })

  test('a pickup customer chooses the branch in the shop', async () => {
    const orderId = await placeOrder(customer, business, product, { branch: YUNUSOBOD.name })
    await expect(customer.getByText(YUNUSOBOD.address)).toBeVisible()

    await owner.goto(`${urls.admin(business.slug)}/orders/${orderId}`)
    await expect(owner.getByRole('main').getByText(YUNUSOBOD.name).first()).toBeVisible()
  })
})
