import { expect, type Page } from '@playwright/test'
import { platformAccount, urls } from './env'

type Business = ReturnType<typeof import('./env').newBusiness>

/** Our panel: sign in and open a new business; returns when its page shows the owner's credentials. */
export async function openBusiness(page: Page, business: Business) {
  const account = platformAccount()
  await page.goto(`${urls.platform}/login`)
  await page.getByLabel('Telefon').fill(account.phone)
  await page.getByLabel('Parol', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Kirish' }).click()
  await expect(page.getByRole('heading', { name: 'Bizneslar' })).toBeVisible()

  await page.getByRole('link', { name: 'Yangi biznes' }).first().click()
  const form = page.getByRole('form', { name: 'Yangi biznes' })
  await form.getByLabel('Nomi').fill(business.name)
  await form.getByLabel('Manzil (subdomen)').fill(business.slug)
  await expect(form.getByText(`${business.slug}-admin.`)).toBeVisible()
  await form.getByLabel('Ismi').fill(business.owner.name)
  await form.getByLabel('Telefoni (login)').fill(business.owner.phone)
  await form.getByLabel(/^Parol/).fill(business.owner.password)
  // Its place on the map: a point typed into the search (this stack has no map server), then the address.
  await form.getByLabel('Xaritadan qidirish').fill(business.place.point)
  await form.getByRole('button', { name: 'Topish' }).click()
  await expect(form.getByText(business.place.point, { exact: true })).toBeVisible()
  await form.getByLabel('Biznes manzili').fill(business.place.address)
  await form.getByRole('button', { name: 'Biznesni ochish' }).click()

  // Opening a business creates its schema (migrations): a few seconds.
  await expect(page.getByRole('button', { name: 'Hammasini nusxalash' })).toBeVisible({ timeout: 60_000 })
  await expect(page).toHaveURL(new RegExp(`/b/${business.slug}$`))
  await expect(page.getByRole('heading', { name: business.name })).toBeVisible()
}

/** The shop: put the product in the cart, sign in with a phone (test-mode code) and place a pickup order. */
export async function placeOrder(page: Page, business: Business, product: string) {
  await page.goto(urls.shop(business.slug))
  const card = page.getByRole('article', { name: product }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /Qo.shish/ }).click()
  // Desktop shows the cart beside the menu; phones open it as a sheet.
  const checkout = page.getByRole('button', { name: 'Rasmiylashtirish', exact: true })
  if (!(await checkout.isVisible())) await page.getByRole('button', { name: /Savatni ochish/ }).click()
  await checkout.click()

  // Sign-in: the stack runs with SHOP_OTP_DEBUG, so the code is shown in the sheet.
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Telefon raqam').fill('905551234')
  await sheet.getByRole('button', { name: 'Kod olish' }).click()
  const code = (await sheet.getByText(/^\d{6}$/).textContent())?.trim() ?? ''
  await sheet.getByLabel('SMS kod').fill(code)
  // A new customer is asked for a name.
  const name = page.getByRole('dialog').getByLabel('Ismingiz')
  if (await name.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) {
    await name.fill('E2E Mijoz')
    await page.getByRole('dialog').getByRole('button', { name: 'Davom etish' }).click()
  }

  await expect(page).toHaveURL(/\/checkout$/)
  await page.getByText('Olib ketish', { exact: true }).click()
  // Where to come: the place our panel put the business on.
  await expect(page.getByText(business.place.address)).toBeVisible()
  await page.getByRole('button', { name: /Buyurtma berish/ }).click()
  await expect(page.getByText('Buyurtma qabul qilindi!')).toBeVisible()
  const heading = await page.getByRole('heading', { name: /Buyurtma #\d+/ }).textContent()
  return Number(heading?.match(/#(\d+)/)?.[1])
}

/** The admin panel: the owner signs in with the credentials our panel gave. */
export async function signInToAdmin(page: Page, business: Business) {
  await page.goto(`${urls.admin(business.slug)}/login`)
  await page.getByLabel(/Telefon raqami/).fill(business.owner.phone)
  await page.getByLabel('Parol', { exact: true }).fill(business.owner.password)
  await page.getByRole('button', { name: 'Kirish' }).click()
  await expect(page).toHaveURL(`${urls.admin(business.slug)}/`)
}

/** The admin panel: a category and a product in it. */
export async function fillCatalog(page: Page, business: Business, product: string) {
  await page.goto(`${urls.admin(business.slug)}/categories`)
  await page.getByRole('button', { name: "Kategoriya qo'shish" }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/Nomi \(O'zbekcha\)/).fill('Burgerlar')
  await dialog.getByLabel(/Nomi \(Ruscha\)/).fill('Бургеры')
  await dialog.getByRole('button', { name: 'Yaratish' }).click()
  await expect(page.getByRole('main').getByText('Burgerlar')).toBeVisible()

  await page.goto(`${urls.admin(business.slug)}/products/new`)
  await page.getByLabel(/Nomi \(O'zbekcha\)/).fill(product)
  await page.getByLabel(/Nomi \(Ruscha\)/).fill(`${product} RU`)
  await page.getByLabel(/^Narxi/).fill('35000')
  await page.getByLabel(/^Kategoriya/).selectOption({ label: 'Burgerlar' })
  await page.getByRole('button', { name: 'Mahsulot yaratish' }).click()
  await expect(page).toHaveURL(`${urls.admin(business.slug)}/products`)
  await expect(page.getByRole('main').getByText(product).first()).toBeVisible()
}

/** The admin panel: the new order is in the list; its page changes the status. */
export async function completeOrder(page: Page, business: Business, orderId: number) {
  await page.goto(`${urls.admin(business.slug)}/orders`)
  await expect(page.getByRole('main').getByText(`#${orderId}`).first()).toBeVisible()
  await page.goto(`${urls.admin(business.slug)}/orders/${orderId}`)
  await expect(page.getByRole('heading', { name: `Buyurtma #${orderId}` })).toBeVisible()
  await page.getByText('Bajarilgan', { exact: true }).click()
  await expect(page.getByText('Holat yangilandi')).toBeVisible()
}
