import { expect, test } from '@playwright/test'
import { platformAccount, urls } from './env'

/**
 * Our page for businesses (the bare domain; localhost here): a visitor leaves an application (the page in Uzbek at "/"
 * and in Russian at "/ru") → our panel shows it under "Arizalar" → our staff mark that they called back.
 */
test('a business leaves an application and our panel sees it', async ({ page }) => {
  const stamp = Date.now().toString(36)
  const name = `E2E Ariza ${stamp}`
  const phone = `90${String(Date.now()).slice(-7)}`

  await page.goto(`${urls.landing}/ru`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Пусть клиент заказывает сам.')
  await page.getByRole('link', { name: 'UZ', exact: true }).click()
  await expect(page).toHaveURL(`${urls.landing}/`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mijoz o‘zi buyurtma bersin.')

  await page.getByRole('link', { name: 'Ariza qoldirish' }).first().click()
  const form = page.locator('#leadForm')
  await form.getByRole('button', { name: 'Ariza yuborish' }).click()
  await expect(form.getByText('Ismingizni yozing')).toBeVisible()

  await form.getByLabel('Ismingiz').fill(name)
  await form.getByLabel('Telefon raqam').fill(phone)
  await form.getByLabel(/Biznesingiz nomi/).fill('E2E Choyxona')
  await form.getByText('Kafe yoki restoran').click()
  await form.getByLabel(/Izoh/).fill('2 ta filial')
  await form.getByRole('button', { name: 'Ariza yuborish' }).click()
  await expect(page.getByRole('heading', { name: 'Arizangiz qabul qilindi!' })).toBeVisible()

  // Our panel: sign in; the new application waits under "Yangi".
  const account = platformAccount()
  await page.goto(`${urls.platform}/login`)
  await page.getByLabel('Telefon').fill(account.phone)
  await page.getByLabel('Parol', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Kirish' }).click()
  await expect(page.getByRole('heading', { name: 'Bizneslar' })).toBeVisible()

  await page.getByRole('link', { name: /Arizalar/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Arizalar', level: 1 })).toBeVisible()
  const card = page.getByRole('article').filter({ hasText: name })
  await expect(card).toBeVisible()
  await expect(card.getByText('E2E Choyxona')).toBeVisible()
  await expect(card.getByText('2 ta filial')).toBeVisible()

  await card.getByRole('button', { name: /Bog'lanildi/ }).first().click()
  await expect(page.getByRole('article').filter({ hasText: name })).toHaveCount(0)

  // The page is not on our panel's host: there the front page is the panel.
  await page.goto(`${urls.platform}/`)
  await expect(page.getByRole('heading', { name: 'Bizneslar' })).toBeVisible()
})
