/**
 * MSW handlers implementing the Shop API of docs/api.md against an in-memory "database", so tests
 * exercise real request/response shapes (including error bodies).
 */
import { http, HttpResponse, type JsonBodyType } from 'msw'
import type { Business, Category, Client, NewOrder, Order, Place, Product, Shift } from '../api/types'
import { openStatus } from '../lib/hours'
import * as fixtures from './fixtures'

export const API = '/api/v1'

/** What the fake backend serves: the test fixtures, or the richer demo menu of `npm run dev:mock`. */
export interface MockData {
  business: Business
  categories: Category[]
  products: Product[]
  popular: number[]
  client: Client
  token: string
  orders: () => Order[]
  /** The map server behind GET /geo/*: the address of any point, and the places any search finds. */
  geo?: { address: string; places: Place[] }
  /** Demo mode: "Telegram orqali kirish" confirms itself a few seconds after the link is opened. */
  demo?: boolean
}

export const GEO = {
  address: "Bunyodkor ko'chasi, 3, Chilonzor tumani, Toshkent",
  places: [
    { address: 'Chorsu bozori, Shayxontohur tumani, Toshkent', lat: 41.3266, lng: 69.2353 },
    { address: 'Chorsu, Toshkent', lat: 41.3251, lng: 69.2369 },
  ],
}

const testData: MockData = {
  business: fixtures.business,
  categories: fixtures.categories,
  products: fixtures.products,
  popular: fixtures.popular,
  client: fixtures.client,
  token: fixtures.TOKEN,
  orders: () => [fixtures.makeOrder()],
  geo: GEO,
}

interface LoggedRequest {
  method: string
  path: string
  auth: string | null
  body: unknown
}

interface Db {
  clients: Map<string, Client>
  orders: Order[]
  minOrder: number
  phoneAttempts: number
  telegramLogin: 'pending' | 'confirmed' | 'expired'
  /** The map server is out of reach (GET /geo/* → 503). */
  geoDown: boolean
  /** Products the business froze (on top of the data's own `frozen`). */
  frozen: Set<number>
  /** Working hours set by a test (undefined: those of the data). */
  week?: (Shift | null)[] | null
  requests: LoggedRequest[]
  nextOrderId: number
}

function createDb(data: MockData): Db {
  return {
    clients: new Map([[data.token, { ...data.client }]]),
    orders: data.orders(),
    minOrder: data.business.min_order,
    phoneAttempts: 5,
    telegramLogin: 'pending',
    geoDown: false,
    frozen: new Set(),
    requests: [],
    nextOrderId: 200,
  }
}

export const db: Db = createDb(testData)

export function resetDb(): void {
  Object.assign(db, createDb(testData))
}

/** The requests the app made (method + path), for assertions. */
export const requestsTo = (method: string, path: string) =>
  db.requests.filter((request) => request.method === method && request.path === `${API}/${path}`)

const error = (status: number, code: string, extra: Record<string, JsonBodyType> = {}) =>
  HttpResponse.json({ error: code, ...extra }, { status })

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

async function log(db: Db, request: Request): Promise<unknown> {
  let body: unknown = null
  if (request.method !== 'GET') {
    const text = await request.clone().text()
    body = text ? JSON.parse(text) : null
  }
  db.requests.push({ method: request.method, path: new URL(request.url).pathname, auth: request.headers.get('Authorization'), body })
  return body
}

function authorised(db: Db, request: Request): Client | null {
  const token = bearer(request)
  return token ? (db.clients.get(token) ?? null) : null
}

export function createHandlers(data: MockData, state: Db = createDb(data)) {
  const { business, categories, products: catalog, popular, client: aziz } = data
  const db = state
  const products = () => catalog.map((product) => ({ ...product, frozen: product.frozen || db.frozen.has(product.id) }))
  // The hours with their status worked out now, like the backend does.
  const workingHours = () => {
    const hours = { ...business.working_hours, week: db.week === undefined ? business.working_hours.week : db.week }
    const status = openStatus(hours)
    return { ...hours, open: status?.open ?? true, opens_at: null, closes_at: null }
  }
  return [
    http.get(`${API}/shop`, async ({ request }) => {
      await log(db, request)
      return HttpResponse.json({
        business: { ...business, min_order: db.minOrder, working_hours: workingHours() },
        bot_username: 'burger_house_bot',
        categories,
        products: products(),
        popular,
        client: authorised(db, request),
      })
    }),

    // --- sign-in ---------------------------------------------------------------------------------
    http.post(`${API}/auth/telegram/webapp`, async ({ request }) => {
      const body = (await log(db, request)) as { init_data?: string }
      if (!body?.init_data) return error(401, 'invalid_init_data')
      const tgClient: Client = { ...aziz, id: 8, telegram: true, tg_nick: 'aziz_tg', phone: '' }
      db.clients.set('tg-token', tgClient)
      return HttpResponse.json({ token: 'tg-token', client: tgClient, created: false })
    }),

    http.post(`${API}/auth/telegram/start`, async ({ request }) => {
      await log(db, request)
      if (data.demo) {
        db.telegramLogin = 'pending'
        setTimeout(() => (db.telegramLogin = 'confirmed'), 6000)
      }
      return HttpResponse.json({ token: 'login-1', url: 'https://t.me/burger_house_bot?start=login_login-1', expires_in: 300 })
    }),

    http.get(`${API}/auth/telegram/check`, async ({ request }) => {
      await log(db, request)
      if (new URL(request.url).searchParams.get('token') !== 'login-1') return error(404, 'not_found')
      if (db.telegramLogin === 'confirmed') {
        const tgClient: Client = { ...aziz, id: 9, telegram: true, tg_nick: 'aziz_tg' }
        db.clients.set('tg-login-token', tgClient)
        return HttpResponse.json({ status: 'confirmed', token: 'tg-login-token', client: tgClient, created: false })
      }
      return HttpResponse.json({ status: db.telegramLogin })
    }),

    http.post(`${API}/auth/phone/request`, async ({ request }) => {
      const body = (await log(db, request)) as { phone?: string }
      if (!/^\+998\d{9}$/.test(body?.phone ?? '')) return error(400, 'invalid_phone')
      return HttpResponse.json({ ok: true, phone: body.phone, resend_in: 60, ttl: 300, debug_code: '123456' })
    }),

    http.post(`${API}/auth/phone/verify`, async ({ request }) => {
      const body = (await log(db, request)) as { phone: string; code: string; lang?: string }
      if (body.code !== '123456') {
        db.phoneAttempts -= 1
        return error(400, 'invalid_code', { attempts_left: db.phoneAttempts })
      }
      const newClient: Client = {
        id: 10,
        first_name: '',
        last_name: '',
        phone: body.phone,
        telegram: false,
        tg_nick: '',
        lang: body.lang === 'ru' ? 'ru' : 'uz',
        address: '',
        lat: null,
        lng: null,
      }
      db.clients.set('phone-token', newClient)
      return HttpResponse.json({ token: 'phone-token', client: newClient, created: true })
    }),

    // --- profile ---------------------------------------------------------------------------------
    http.get(`${API}/me`, async ({ request }) => {
      await log(db, request)
      const current = authorised(db, request)
      return current ? HttpResponse.json({ client: current }) : error(401, 'auth_required')
    }),

    http.patch(`${API}/me`, async ({ request }) => {
      const body = (await log(db, request)) as Partial<Client>
      const token = bearer(request)
      const current = authorised(db, request)
      if (!current || !token) return error(401, 'auth_required')
      const updated = { ...current, ...body }
      db.clients.set(token, updated)
      return HttpResponse.json({ client: updated })
    }),

    // --- orders ----------------------------------------------------------------------------------
    http.get(`${API}/orders`, async ({ request }) => {
      await log(db, request)
      if (!authorised(db, request)) return error(401, 'auth_required')
      return HttpResponse.json({ orders: db.orders })
    }),

    http.get(`${API}/orders/:id`, async ({ request, params }) => {
      await log(db, request)
      if (!authorised(db, request)) return error(401, 'auth_required')
      const order = db.orders.find((item) => item.id === Number(params.id))
      return order ? HttpResponse.json({ order }) : error(404, 'not_found')
    }),

    http.get(`${API}/geo/reverse`, async ({ request }) => {
      await log(db, request)
      if (db.geoDown || !data.geo) return error(503, 'geocoder_unavailable')
      return HttpResponse.json({ address: data.geo.address })
    }),

    http.get(`${API}/geo/search`, async ({ request }) => {
      await log(db, request)
      if (db.geoDown || !data.geo) return error(503, 'geocoder_unavailable')
      const query = new URL(request.url).searchParams.get('q') ?? ''
      return HttpResponse.json({ results: query.trim().length >= 2 ? data.geo.places : [] })
    }),

    http.post(`${API}/orders`, async ({ request }) => {
      const body = (await log(db, request)) as NewOrder
      if (!authorised(db, request)) return error(401, 'auth_required')
      if (!workingHours().open) return error(400, 'business_closed', { opens_at: null })
      if (!body.items?.length) return error(400, 'empty')
      const all = products()
      const missing = body.items.filter((item) => !all.some((product) => product.id === item.product_id))
      if (missing.length) return error(400, 'product_not_found', { detail: missing.map((item) => item.product_id) })
      const frozen = body.items.filter((item) => all.find((product) => product.id === item.product_id)?.frozen)
      if (frozen.length) return error(400, 'product_unavailable', { detail: frozen.map((item) => item.product_id) })
      const fields: Record<string, string[]> = {}
      if (!body.name?.trim()) fields.name = ['required']
      if (!/^\+998\d{9}$/.test(body.phone ?? '')) fields.phone = ['invalid']
      if (body.delivery_type === 'delivery' && !body.address && body.lat === null) fields.address = ['required']
      if (Object.keys(fields).length) return error(400, 'validation', { fields })
      const items = body.items.map((item) => {
        const product = all.find((candidate) => candidate.id === item.product_id)!
        return {
          product_id: product.id,
          name_uz: product.name_uz,
          name_ru: product.name_ru,
          image: product.image,
          quantity: item.quantity,
          price: product.price,
          total: product.price * item.quantity,
        }
      })
      const total = items.reduce((sum, item) => sum + item.total, 0)
      if (db.minOrder && total < db.minOrder) return error(400, 'min_order', { min_order: db.minOrder })
      const order: Order = {
        id: db.nextOrderId++,
        status: 'ordered',
        source: body.platform,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total,
        items,
        customer_name: body.name,
        phone: body.phone,
        address: body.address,
        lat: body.lat === null ? null : String(body.lat),
        lng: body.lng === null ? null : String(body.lng),
        delivery_type: body.delivery_type,
        payment_method: body.payment_method,
        comment: body.comment,
      }
      db.orders = [order, ...db.orders]
      return HttpResponse.json({ order }, { status: 201 })
    }),
  ]
}

export const handlers = createHandlers(testData, db)
