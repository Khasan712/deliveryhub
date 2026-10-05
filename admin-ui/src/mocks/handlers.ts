/* Mock Admin API following docs/api.md — used by the tests (MSW in Node) and by `npm run dev:mock` (MSW in the
   browser). Session cookie, CSRF check, roles, pagination and error codes behave like the contract describes. */
import { http, HttpResponse, delay } from 'msw'
import type {
  Category,
  ClientSummary,
  OrderDetail,
  OrderStatus,
  OrderSummary,
  Product,
  SalesStats,
  StaffUser,
  TelegramLink,
  VoiceResult,
  VoiceState,
} from '../api/types'
import { QR_SVG, saleSummary, store } from './data'
import { parseWeek, workingHours } from './hours'
import { localParse } from './voiceParser'

const API = '/api/v1'
let latency = 0

/** Artificial latency for the browser mock (skeletons and spinners become visible). */
export function setMockLatency(ms: number) {
  latency = ms
}

async function wait() {
  if (latency) await delay(latency + Math.round(Math.random() * latency * 0.6))
}

type Json = Record<string, unknown>

function fail(status: number, code: string, extra: Json = {}) {
  return HttpResponse.json({ error: code, ...extra }, { status })
}

function validation(fields: Record<string, string[]>) {
  return fail(400, 'validation', { fields })
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

/** Sets a new CSRF cookie (Set-Cookie for MSW + document.cookie for browser mode). */
function rotateCsrf(): Record<string, string> {
  const token = `csrf${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  if (typeof document !== 'undefined') document.cookie = `csrftoken=${token}; path=/`
  return { 'Set-Cookie': `csrftoken=${token}; Path=/` }
}

function sessionUser(): StaffUser | null {
  const db = store.db
  return db.users.find((user) => user.id === db.sessionUserId && user.is_active) ?? null
}

/** Session + CSRF + role checks; returns the user or the error response. */
function guard(request: Request, options: { adminOnly?: boolean } = {}): StaffUser | Response {
  const user = sessionUser()
  if (!user) return fail(401, 'auth_required')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const token = request.headers.get('x-csrftoken')
    if (!token || token !== readCookie('csrftoken')) return fail(403, 'csrf_failed')
  }
  if (options.adminOnly && user.role !== 'admin') return fail(403, 'forbidden')
  return user
}

function me(user: StaffUser) {
  return { user, business: store.db.business }
}

function paginate<T>(rows: T[], url: URL) {
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size')) || 20))
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const requested = Number(url.searchParams.get('page')) || 1
  if (requested > pages && rows.length) return null
  const page = Math.min(Math.max(1, requested), pages)
  return { count: rows.length, page, pages, results: rows.slice((page - 1) * pageSize, page * pageSize) }
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 9) return `+998${digits}`
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`
  return value.trim()
}

function summary(order: OrderDetail): OrderSummary {
  const { id, status, source, created_at, customer_name, phone, total, items_count, client_id } = order
  return { id, status, source, created_at, customer_name, phone, total, items_count, client_id }
}

function clientSummary(id: number): ClientSummary | null {
  const client = store.db.clients.find((item) => item.id === id)
  if (!client) return null
  const { location: _location, ...rest } = client
  return { ...rest, orders_count: store.db.orders.filter((order) => order.client_id === id).length }
}

function categoryWithCount(category: Category): Category {
  return {
    id: category.id,
    name_uz: category.name_uz,
    name_ru: category.name_ru,
    products_count: store.db.products.filter((product) => product.category?.id === category.id).length,
  }
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function salesStats(): SalesStats {
  const today = startOfToday()
  const todays = store.db.orders.filter((order) => new Date(order.created_at).getTime() >= today)
  const sales = todays.filter((order) => order.source === 'admin' && order.status !== 'rejected')
  const revenue = sales.reduce((sum, order) => sum + order.total, 0)
  return {
    count: sales.length,
    revenue,
    average: sales.length ? Math.floor(revenue / sales.length) : 0,
    all_orders_today: todays.length,
  }
}

async function readBody(request: Request): Promise<{ fields: Json; files: Record<string, File | null> }> {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) {
    const form = await request.formData()
    const fields: Json = {}
    const files: Record<string, File | null> = {}
    form.forEach((value, key) => {
      if (typeof value === 'string') fields[key] = value
      else files[key] = value as File
    })
    return { fields, files }
  }
  const text = await request.text()
  return { fields: text ? (JSON.parse(text) as Json) : {}, files: {} }
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return `data:${file.type || 'image/png'};base64,${btoa(binary)}`
}

function toId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) ? number : NaN
}

export const handlers = [
  // ---------------------------------------------------------------- auth
  http.get(`${API}/auth/csrf`, async () => {
    await wait()
    return new HttpResponse(null, { status: 204, headers: rotateCsrf() })
  }),

  http.get(`${API}/auth/me`, async () => {
    await wait()
    const user = sessionUser()
    return user ? HttpResponse.json(me(user)) : fail(401, 'auth_required')
  }),

  http.post(`${API}/auth/login`, async ({ request }) => {
    await wait()
    if (request.headers.get('x-csrftoken') !== readCookie('csrftoken')) return fail(403, 'csrf_failed')
    const body = (await request.json()) as { phone?: string; password?: string }
    const fields: Record<string, string[]> = {}
    if (!body.phone?.trim()) fields.phone = ['required']
    if (!body.password) fields.password = ['required']
    if (Object.keys(fields).length) return validation(fields)
    const phone = normalizePhone(body.phone ?? '')
    const user = store.db.users.find((item) => item.phone_number === phone)
    if (!user || !user.is_active || store.db.passwords[user.id] !== body.password) return fail(400, 'invalid_credentials')
    store.db.sessionUserId = user.id
    return HttpResponse.json(me(user), { headers: rotateCsrf() })
  }),

  http.post(`${API}/auth/logout`, async () => {
    await wait()
    store.db.sessionUserId = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/auth/telegram`, async ({ request }) => {
    await wait()
    const { init_data: initData = '' } = (await request.json()) as { init_data?: string }
    if (!initData || initData.includes('invalid')) return fail(403, 'invalid_init_data')
    const link = store.db.links.find((item) => initData.includes(String(item.telegram_id)))
    const user = link && store.db.users.find((item) => item.id === link.user.id && item.is_active)
    if (!user) return fail(403, 'not_linked')
    store.db.sessionUserId = user.id
    return HttpResponse.json(me(user), { headers: rotateCsrf() })
  }),

  // ---------------------------------------------------------------- dashboard
  http.get(`${API}/dashboard`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const { orders, clients, products, categories } = store.db
    const weekAgo = startOfToday() - 6 * 86_400_000
    const count = (status: OrderStatus) => orders.filter((order) => order.status === status).length
    const daily = Array.from({ length: 7 }, (_, index) => {
      const start = weekAgo + index * 86_400_000
      const date = new Date(start)
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const total = orders.filter((order) => {
        const time = new Date(order.created_at).getTime()
        return time >= start && time < start + 86_400_000
      }).length
      return { date: day, count: total }
    })
    return HttpResponse.json({
      orders: {
        total: orders.length,
        new: count('ordered'),
        on_the_way: count('on_the_way'),
        completed: count('completed'),
        last_7_days: daily.reduce((sum, day) => sum + day.count, 0),
      },
      clients: {
        total: clients.length,
        new_7_days: clients.filter((client) => new Date(client.created_at).getTime() >= weekAgo).length,
      },
      products: { total: products.length },
      categories: { total: categories.length },
      by_status: (['completed', 'ordered', 'on_the_way', 'rejected'] as const).map((status) => ({ status, count: count(status) })),
      daily,
      latest_orders: [...orders].reverse().slice(0, 6).map(summary),
    })
  }),

  // ---------------------------------------------------------------- working hours
  http.get(`${API}/business`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    return HttpResponse.json(workingHours(store.db.hours))
  }),

  http.patch(`${API}/business`, async ({ request }) => {
    await wait()
    const user = guard(request, { adminOnly: true })
    if (user instanceof Response) return user
    const body = (await request.json()) as { week?: unknown }
    if (!('week' in body)) return validation({ week: ['required'] })
    const week = parseWeek(body.week)
    if (week === undefined) return validation({ week: ['invalid'] })
    store.db.hours = week
    return HttpResponse.json(workingHours(week))
  }),

  // ---------------------------------------------------------------- orders
  http.get(`${API}/orders`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const source = url.searchParams.get('source')
    const search = url.searchParams.get('search')?.trim().toLowerCase()
    const rows = [...store.db.orders]
      .reverse()
      .filter((order) => !status || order.status === status)
      .filter((order) => !source || order.source === source)
      .filter(
        (order) =>
          !search ||
          String(order.id) === search.replace('#', '') ||
          order.customer_name.toLowerCase().includes(search) ||
          order.phone.replace(/\D/g, '').includes(search.replace(/\D/g, '') || '\u0000'),
      )
      .map(summary)
    const page = paginate(rows, url)
    return page ? HttpResponse.json(page) : fail(404, 'not_found')
  }),

  http.get(`${API}/orders/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const order = store.db.orders.find((item) => item.id === Number(params.id))
    return order ? HttpResponse.json(order) : fail(404, 'not_found')
  }),

  http.patch(`${API}/orders/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const order = store.db.orders.find((item) => item.id === Number(params.id))
    if (!order) return fail(404, 'not_found')
    const { status } = (await request.json()) as { status?: string }
    if (!status || !['ordered', 'on_the_way', 'completed', 'rejected'].includes(status)) return validation({ status: ['invalid'] })
    order.status = status as OrderStatus
    order.updated_at = new Date().toISOString()
    return HttpResponse.json(order)
  }),

  // ---------------------------------------------------------------- clients
  http.get(`${API}/clients`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim().toLowerCase()
    const rows = [...store.db.clients]
      .reverse()
      .filter(
        (client) =>
          !search ||
          `${client.first_name} ${client.last_name} ${client.phone} ${client.tg_nick}`.toLowerCase().includes(search),
      )
      .map((client) => clientSummary(client.id) as ClientSummary)
    const page = paginate(rows, url)
    return page ? HttpResponse.json(page) : fail(404, 'not_found')
  }),

  http.get(`${API}/clients/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const id = Number(params.id)
    const client = store.db.clients.find((item) => item.id === id)
    if (!client) return fail(404, 'not_found')
    const orders = store.db.orders.filter((order) => order.client_id === id).reverse().map(summary)
    return HttpResponse.json({ ...clientSummary(id), location: client.location, orders })
  }),

  http.patch(`${API}/clients/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const client = store.db.clients.find((item) => item.id === Number(params.id))
    if (!client) return fail(404, 'not_found')
    const body = (await request.json()) as Partial<Record<'first_name' | 'last_name' | 'phone' | 'location', string>>
    if (body.phone && !/^\+?[\d\s()-]{7,}$/.test(body.phone)) return validation({ phone: ['invalid'] })
    Object.assign(client, {
      ...(body.first_name !== undefined && { first_name: body.first_name }),
      ...(body.last_name !== undefined && { last_name: body.last_name }),
      ...(body.phone !== undefined && { phone: body.phone ? normalizePhone(body.phone) : '' }),
      ...(body.location !== undefined && { location: body.location }),
    })
    return HttpResponse.json(clientSummary(client.id))
  }),

  // ---------------------------------------------------------------- products
  http.get(`${API}/products`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim().toLowerCase()
    const category = url.searchParams.get('category')
    const frozen = url.searchParams.get('frozen')
    const rows = [...store.db.products]
      .reverse()
      .filter((product) => !category || String(product.category?.id) === category)
      .filter((product) => (frozen === 'true' || frozen === 'false' ? product.frozen === (frozen === 'true') : true))
      .filter((product) => !search || `${product.name_uz} ${product.name_ru}`.toLowerCase().includes(search))
    const page = paginate(rows, url)
    return page ? HttpResponse.json(page) : fail(404, 'not_found')
  }),

  http.get(`${API}/products/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const product = store.db.products.find((item) => item.id === Number(params.id))
    return product ? HttpResponse.json(product) : fail(404, 'not_found')
  }),

  ...(['post', 'patch'] as const).map((method) =>
    http[method](method === 'post' ? `${API}/products` : `${API}/products/:id`, async ({ request, params }) => {
      await wait()
      const user = guard(request)
      if (user instanceof Response) return user
      const db = store.db
      const existing = method === 'patch' ? db.products.find((item) => item.id === Number(params.id)) : undefined
      if (method === 'patch' && !existing) return fail(404, 'not_found')
      const { fields, files } = await readBody(request)
      const errors: Record<string, string[]> = {}
      const text = (key: string) => (fields[key] === undefined ? undefined : String(fields[key] ?? '').trim())
      const nameUz = text('name_uz')
      const nameRu = text('name_ru')
      const priceRaw = fields.price
      if (method === 'post' || nameUz !== undefined) if (!nameUz) errors.name_uz = ['required']
      if (method === 'post' || nameRu !== undefined) if (!nameRu) errors.name_ru = ['required']
      let price: number | undefined
      if (method === 'post' || priceRaw !== undefined) {
        price = Number(priceRaw)
        if (priceRaw === undefined || priceRaw === '' || priceRaw === null) errors.price = ['required']
        else if (!Number.isInteger(price)) errors.price = ['invalid']
        else if (price < 0) errors.price = ['min_value']
      }
      const unitId = toId(fields.unit_id)
      const categoryId = toId(fields.category_id)
      const unit = unitId ? db.units.find((item) => item.id === unitId) : null
      const category = categoryId ? db.categories.find((item) => item.id === categoryId) : null
      if (unitId && !unit) errors.unit_id = ['does_not_exist']
      if (categoryId && !category) errors.category_id = ['does_not_exist']
      const file = files.image
      if (file && !file.type.startsWith('image/')) errors.image = ['invalid_image']
      let frozen: boolean | undefined
      if (fields.frozen !== undefined) {
        if (fields.frozen === true || fields.frozen === 'true') frozen = true
        else if (fields.frozen === false || fields.frozen === 'false') frozen = false
        else errors.frozen = ['invalid']
      }
      if (Object.keys(errors).length) return validation(errors)
      const isFrozen = frozen ?? existing?.frozen ?? false

      let image: string | null | undefined
      if (file) image = await fileToDataUrl(file)
      else if ('image' in fields && (fields.image === null || fields.image === '')) image = null

      const product: Product = {
        id: existing?.id ?? db.nextId++,
        name_uz: nameUz ?? existing?.name_uz ?? '',
        name_ru: nameRu ?? existing?.name_ru ?? '',
        desc_uz: text('desc_uz') ?? existing?.desc_uz ?? '',
        desc_ru: text('desc_ru') ?? existing?.desc_ru ?? '',
        price: price ?? existing?.price ?? 0,
        unit: unitId === undefined ? (existing?.unit ?? null) : unit ? { ...unit } : null,
        category:
          categoryId === undefined
            ? (existing?.category ?? null)
            : category
              ? { id: category.id, name_uz: category.name_uz, name_ru: category.name_ru }
              : null,
        image: image === undefined ? (existing?.image ?? null) : image,
        thumb: image === undefined ? (existing?.thumb ?? null) : image,
        frozen: isFrozen,
        // The moment of freezing is kept until the product returns to sale.
        frozen_at: !isFrozen ? null : existing?.frozen ? existing.frozen_at : new Date().toISOString(),
        created_at: existing?.created_at ?? new Date().toISOString(),
      }
      if (existing) Object.assign(existing, product)
      else db.products.push(product)
      return HttpResponse.json(product, { status: existing ? 200 : 201 })
    }),
  ),

  http.delete(`${API}/products/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const before = store.db.products.length
    store.db.products = store.db.products.filter((item) => item.id !== Number(params.id))
    return store.db.products.length === before ? fail(404, 'not_found') : new HttpResponse(null, { status: 204 })
  }),

  // ---------------------------------------------------------------- categories & units
  http.get(`${API}/categories`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const search = new URL(request.url).searchParams.get('search')?.trim().toLowerCase()
    return HttpResponse.json(
      store.db.categories
        .filter((category) => !search || `${category.name_uz} ${category.name_ru}`.toLowerCase().includes(search))
        .map(categoryWithCount),
    )
  }),

  http.get(`${API}/categories/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const category = store.db.categories.find((item) => item.id === Number(params.id))
    return category ? HttpResponse.json(categoryWithCount(category)) : fail(404, 'not_found')
  }),

  http.post(`${API}/categories`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const body = (await request.json()) as { name_uz?: string; name_ru?: string }
    const errors: Record<string, string[]> = {}
    if (!body.name_uz?.trim()) errors.name_uz = ['required']
    if (!body.name_ru?.trim()) errors.name_ru = ['required']
    if (Object.keys(errors).length) return validation(errors)
    const category: Category = { id: store.db.nextId++, name_uz: body.name_uz!.trim(), name_ru: body.name_ru!.trim(), products_count: 0 }
    store.db.categories.push(category)
    return HttpResponse.json(category, { status: 201 })
  }),

  http.patch(`${API}/categories/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const category = store.db.categories.find((item) => item.id === Number(params.id))
    if (!category) return fail(404, 'not_found')
    const body = (await request.json()) as { name_uz?: string; name_ru?: string }
    if (body.name_uz !== undefined && !body.name_uz.trim()) return validation({ name_uz: ['required'] })
    if (body.name_ru !== undefined && !body.name_ru.trim()) return validation({ name_ru: ['required'] })
    Object.assign(category, body)
    for (const product of store.db.products) {
      if (product.category?.id === category.id) product.category = { id: category.id, name_uz: category.name_uz, name_ru: category.name_ru }
    }
    return HttpResponse.json(categoryWithCount(category))
  }),

  http.delete(`${API}/categories/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const id = Number(params.id)
    if (!store.db.categories.some((item) => item.id === id)) return fail(404, 'not_found')
    store.db.categories = store.db.categories.filter((item) => item.id !== id)
    // Deleting a category keeps its products.
    for (const product of store.db.products) if (product.category?.id === id) product.category = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/units`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    return HttpResponse.json(store.db.units)
  }),

  http.post(`${API}/units`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const body = (await request.json()) as { name_uz?: string; name_ru?: string }
    const errors: Record<string, string[]> = {}
    if (!body.name_uz?.trim()) errors.name_uz = ['required']
    if (!body.name_ru?.trim()) errors.name_ru = ['required']
    if (Object.keys(errors).length) return validation(errors)
    const unit = { id: store.db.nextId++, name_uz: body.name_uz!.trim(), name_ru: body.name_ru!.trim() }
    store.db.units.push(unit)
    return HttpResponse.json(unit, { status: 201 })
  }),

  // ---------------------------------------------------------------- staff users (admin only)
  http.get(`${API}/users`, async ({ request }) => {
    await wait()
    const user = guard(request, { adminOnly: true })
    if (user instanceof Response) return user
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim().toLowerCase()
    const rows = store.db.users.filter(
      (item) => !search || `${item.first_name} ${item.last_name} ${item.phone_number}`.toLowerCase().includes(search),
    )
    const page = paginate(rows, url)
    return page ? HttpResponse.json(page) : fail(404, 'not_found')
  }),

  http.get(`${API}/users/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request, { adminOnly: true })
    if (user instanceof Response) return user
    const target = store.db.users.find((item) => item.id === Number(params.id))
    return target ? HttpResponse.json(target) : fail(404, 'not_found')
  }),

  http.post(`${API}/users`, async ({ request }) => {
    await wait()
    const user = guard(request, { adminOnly: true })
    if (user instanceof Response) return user
    const body = (await request.json()) as Partial<StaffUser> & { password?: string }
    const errors: Record<string, string[]> = {}
    const phone = normalizePhone(body.phone_number ?? '')
    if (!body.phone_number?.trim()) errors.phone_number = ['required']
    else if (store.db.users.some((item) => item.phone_number === phone)) errors.phone_number = ['unique']
    if (!body.password) errors.password = ['required']
    else if (body.password.length < 8) errors.password = ['min_length']
    if (!body.role || !['admin', 'manager'].includes(body.role)) errors.role = ['invalid']
    if (Object.keys(errors).length) return validation(errors)
    const created: StaffUser = {
      id: store.db.nextId++,
      phone_number: phone,
      first_name: body.first_name ?? '',
      last_name: body.last_name ?? '',
      role: body.role!,
      is_active: body.is_active ?? true,
      created_at: new Date().toISOString(),
    }
    store.db.users.push(created)
    store.db.passwords[created.id] = body.password!
    return HttpResponse.json(created, { status: 201 })
  }),

  http.patch(`${API}/users/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request, { adminOnly: true })
    if (user instanceof Response) return user
    const target = store.db.users.find((item) => item.id === Number(params.id))
    if (!target) return fail(404, 'not_found')
    const body = (await request.json()) as Partial<StaffUser> & { password?: string }
    if (target.id === user.id && ((body.role && body.role !== target.role) || body.is_active === false)) {
      return fail(400, 'cannot_change_self')
    }
    if (body.password !== undefined && body.password.length < 8) return validation({ password: ['min_length'] })
    if (body.phone_number !== undefined) {
      const phone = normalizePhone(body.phone_number)
      if (!body.phone_number.trim()) return validation({ phone_number: ['required'] })
      if (store.db.users.some((item) => item.id !== target.id && item.phone_number === phone)) return validation({ phone_number: ['unique'] })
      target.phone_number = phone
    }
    if (body.first_name !== undefined) target.first_name = body.first_name
    if (body.last_name !== undefined) target.last_name = body.last_name
    if (body.role) target.role = body.role
    if (body.is_active !== undefined) target.is_active = body.is_active
    if (body.password) store.db.passwords[target.id] = body.password
    return HttpResponse.json(target)
  }),

  http.delete(`${API}/users/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request, { adminOnly: true })
    if (user instanceof Response) return user
    const id = Number(params.id)
    if (id === user.id) return fail(400, 'cannot_delete_self')
    if (!store.db.users.some((item) => item.id === id)) return fail(404, 'not_found')
    store.db.users = store.db.users.filter((item) => item.id !== id)
    return new HttpResponse(null, { status: 204 })
  }),

  // ---------------------------------------------------------------- sales
  http.get(`${API}/sales`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const { products, categories, orders, voice } = store.db
    const used = new Set(products.map((product) => product.category?.id))
    return HttpResponse.json({
      categories: categories.filter((category) => used.has(category.id)).map(({ id, name_uz, name_ru }) => ({ id, name_uz, name_ru })),
      products: products.map((product) => ({
        id: product.id,
        name_uz: product.name_uz,
        name_ru: product.name_ru,
        desc_uz: product.desc_uz,
        desc_ru: product.desc_ru,
        price: product.price,
        unit_uz: product.unit?.name_uz ?? '',
        unit_ru: product.unit?.name_ru ?? '',
        category_id: product.category?.id ?? null,
        image: product.image,
        thumb: product.thumb,
        frozen: product.frozen,
      })),
      recent: orders.filter((order) => order.source === 'admin').reverse().slice(0, 8).map(saleSummary),
      stats: salesStats(),
      voice,
    })
  }),

  http.post(`${API}/sales`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const body = (await request.json()) as {
      items?: Array<{ product_id: number; quantity: number }>
      customer_name?: string
      phone?: string
      delivery_type?: string
      address?: string
      payment_method?: string
      status?: string
      comment?: string
    }
    const items = body.items ?? []
    if (!items.length) return fail(400, 'empty')
    const missing = items.filter((item) => !store.db.products.some((product) => product.id === item.product_id))
    if (missing.length) return fail(400, 'product_not_found', { detail: missing.map((item) => item.product_id) })
    const delivery = body.delivery_type === 'delivery' ? 'delivery' : 'pickup'
    const status = (['ordered', 'on_the_way', 'completed'].includes(body.status ?? '')
      ? body.status
      : delivery === 'pickup'
        ? 'completed'
        : 'ordered') as OrderStatus
    const lines = items.map((item) => {
      const product = store.db.products.find((entry) => entry.id === item.product_id)!
      return {
        product_id: product.id,
        name_uz: product.name_uz,
        name_ru: product.name_ru,
        quantity: item.quantity,
        price: product.price,
        total: item.quantity * product.price,
      }
    })
    const now = new Date().toISOString()
    const order: OrderDetail = {
      id: store.db.nextId++,
      status,
      source: 'admin',
      created_at: now,
      updated_at: now,
      customer_name: body.customer_name?.trim() ?? '',
      phone: body.phone ? normalizePhone(body.phone) : '',
      total: lines.reduce((sum, line) => sum + line.total, 0),
      items_count: lines.reduce((sum, line) => sum + line.quantity, 0),
      client_id: null,
      address: delivery === 'delivery' ? (body.address ?? '') : '',
      lat: '',
      lng: '',
      delivery_type: delivery,
      payment_method: body.payment_method === 'card' ? 'card' : 'cash',
      comment: body.comment ?? '',
      created_by: { id: user.id, name: `${user.first_name} ${user.last_name}`.trim() },
      client: null,
      items: lines,
    }
    store.db.orders.push(order)
    return HttpResponse.json({ order: saleSummary(order), stats: salesStats() }, { status: 201 })
  }),

  // ---------------------------------------------------------------- voice
  http.post(`${API}/voice/token`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    if (!store.db.voice.gemini) return fail(400, 'not_configured')
    return fail(502, 'live_unavailable')
  }),

  http.post(`${API}/voice/parse`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const { fields, files } = await readBody(request)
    const state = (typeof fields.state === 'string' ? JSON.parse(fields.state) : fields.state) as VoiceState
    const lang = fields.lang === 'ru' ? 'ru' : 'uz'
    const text = String(files.audio ? (fields.live_text ?? '') : (fields.text ?? '')).trim()
    if (files.audio && files.audio.size > 10 * 1024 * 1024) return fail(400, 'audio_too_large')
    if (!text) return fail(400, files.audio ? 'empty_transcript' : 'empty')
    const result: VoiceResult = localParse(text, state, store.db.products, lang)
    return HttpResponse.json({ result, engine: 'local' })
  }),

  // ---------------------------------------------------------------- telegram
  http.get(`${API}/telegram`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const admin = user.role === 'admin'
    return HttpResponse.json({
      bot: store.db.bot,
      voice_ready: store.db.voiceReady,
      my_links: store.db.links.filter((link) => link.user.id === user.id),
      team_links: admin ? store.db.links : [],
      users: admin
        ? store.db.users.filter((item) => item.is_active).map((item) => ({ id: item.id, name: `${item.first_name} ${item.last_name}`.trim() || item.phone_number }))
        : [],
    })
  }),

  http.post(`${API}/telegram/invites`, async ({ request }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    if (!store.db.bot) return fail(400, 'bot_missing')
    const body = (await request.json().catch(() => ({}))) as { user_id?: number | null }
    const targetId = body.user_id ?? user.id
    if (targetId !== user.id && user.role !== 'admin') return fail(403, 'forbidden')
    const target = store.db.users.find((item) => item.id === targetId && item.is_active)
    if (!target) return validation({ user_id: ['does_not_exist'] })
    const token = Math.random().toString(36).slice(2, 12)
    return HttpResponse.json(
      {
        url: `https://t.me/${store.db.bot.username}?start=inv_${token}`,
        qr_svg: QR_SVG,
        user: `${target.first_name} ${target.last_name}`.trim(),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      { status: 201 },
    )
  }),

  http.patch(`${API}/telegram/links/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const link = store.db.links.find((item) => item.id === Number(params.id))
    if (!link || (link.user.id !== user.id && user.role !== 'admin')) return fail(404, 'not_found')
    const body = (await request.json()) as { notify_orders?: boolean }
    if (typeof body.notify_orders === 'boolean') link.notify_orders = body.notify_orders
    return HttpResponse.json(link satisfies TelegramLink)
  }),

  http.delete(`${API}/telegram/links/:id`, async ({ request, params }) => {
    await wait()
    const user = guard(request)
    if (user instanceof Response) return user
    const link = store.db.links.find((item) => item.id === Number(params.id))
    if (!link || (link.user.id !== user.id && user.role !== 'admin')) return fail(404, 'not_found')
    store.db.links = store.db.links.filter((item) => item.id !== link.id)
    return new HttpResponse(null, { status: 204 })
  }),

  // Product images in mock mode are data URLs; nothing is served from /media.
  http.get('/media/*', () => HttpResponse.text('', { status: 404 })),
]
