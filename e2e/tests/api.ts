import type { Page } from '@playwright/test'
import { urls } from './env'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function json(method: Method, url: string, response: Awaited<ReturnType<Page['request']['fetch']>>) {
  if (!response.ok()) throw new Error(`${method} ${url}: ${response.status()} ${await response.text()}`)
  return response.status() === 204 ? null : response.json()
}

/**
 * The admin API of a business as the user signed in on `page` — its session cookie and CSRF token: for what a test
 * only needs to have (a setting, a second record), not to look at.
 */
export function adminApi(page: Page, slug: string) {
  const base = `${urls.admin(slug)}/api/v1`
  const call = async (method: Method, path: string, data?: unknown) => {
    const cookies = await page.context().cookies(urls.admin(slug))
    const csrf = cookies.find((cookie) => cookie.name === 'csrftoken')?.value ?? ''
    const response = await page.request.fetch(`${base}${path}`, { method, data, headers: { 'X-CSRFToken': csrf } })
    return json(method, `${base}${path}`, response)
  }
  return {
    get: (path: string) => call('GET', path),
    post: (path: string, data: unknown) => call('POST', path, data),
  }
}

/** A shop customer's token: phone sign-in with the code the throwaway stack returns (SHOP_OTP_DEBUG). */
export async function customerToken(page: Page, slug: string, phone: string) {
  const base = `${urls.shop(slug)}/api/v1`
  const sent = await json('POST', 'auth/phone/request', await page.request.post(`${base}/auth/phone/request`, { data: { phone } }))
  const verified = await json(
    'POST',
    'auth/phone/verify',
    await page.request.post(`${base}/auth/phone/verify`, { data: { phone, code: sent.debug_code } }),
  )
  return verified.token as string
}

/** The shop API as a signed-in customer. */
export function shopApi(page: Page, slug: string, token: string) {
  const base = `${urls.shop(slug)}/api/v1`
  const headers = { Authorization: `Bearer ${token}` }
  return {
    get: async (path: string) => json('GET', path, await page.request.get(`${base}${path}`, { headers })),
    post: async (path: string, data: unknown) =>
      json('POST', path, await page.request.post(`${base}${path}`, { data, headers })),
  }
}
