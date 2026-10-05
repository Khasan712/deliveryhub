// A small in-memory Platform API that follows docs/api.md (session + CSRF, error shapes, every endpoint the
// panel uses). Tests arrange `backend.state` and inspect `backend.state.requests`.
import { http, HttpResponse } from 'msw'
import type { Bot, BotRole, BusinessCard, BusinessDetail, MobileApp, Place, PlatformUser } from '../api/types'
import { DOMAIN, STAFF, STAFF_PASSWORD } from './fixtures'

export interface RecordedRequest {
  method: string
  path: string
  search: URLSearchParams
  headers: Record<string, string>
  /** Parsed JSON, or multipart fields (files as `{name, type, size}`). */
  body: unknown
}

interface State {
  accounts: { phone: string; password: string; user: PlatformUser }[]
  session: PlatformUser | null
  csrf: string
  businesses: BusinessDetail[]
  reserved: string[]
  platformBot: { username: string } | null
  /** Tokens Telegram accepts (getMe → username). */
  telegramBots: Record<string, string>
  /** Tokens of bots that already serve another business. */
  botsInUse: string[]
  /** The map server behind GET /geo/*: what it finds, or out of reach. */
  geo: { address: string; places: Place[]; down: boolean }
  /** Slug of the business our mobile app opens. */
  mobileApp: string | null
  requests: RecordedRequest[]
}

function initialState(): State {
  return {
    accounts: [{ phone: STAFF.phone_number, password: STAFF_PASSWORD, user: STAFF }],
    session: STAFF,
    csrf: 'csrf-token-1',
    businesses: [],
    reserved: ['admin', 'api', 'www', 'hub', 'deliveryhub', 'static', 'media'],
    platformBot: { username: 'deliveryhub_bot' },
    telegramBots: {},
    botsInUse: [],
    geo: {
      address: "Bunyodkor ko'chasi, 3, Chilonzor tumani, Toshkent",
      places: [
        { address: 'Chorsu bozori, Shayxontohur tumani, Toshkent', lat: 41.3266, lng: 69.2353 },
        { address: 'Chorsu, Toshkent', lat: 41.3251, lng: 69.2369 },
      ],
      down: false,
    },
    mobileApp: null,
    requests: [],
  }
}

export const backend = {
  state: initialState(),
  reset() {
    this.state = initialState()
  },
  business(slug: string) {
    const business = this.state.businesses.find((each) => each.slug === slug)
    if (!business) throw new Error(`no business ${slug}`)
    return business
  },
  requests(method: string, path: string) {
    return this.state.requests.filter((request) => request.method === method && request.path === `/api/v1${path}`)
  },
  /** What the owner does in Telegram with the setup link: both missing bots get created and connected. */
  createManagedBots(slug: string) {
    const business = this.business(slug)
    for (const role of business.missing_roles) {
      business.bots[role] = { username: `${slug.replace(/-/g, '_')}_${role}_bot`, alive: true, created_via: 'managed' }
    }
    business.missing_roles = []
  },
}

const ROLES: BotRole[] = ['client', 'admin']
const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/

const error = (status: number, code: string, extra: object = {}) =>
  HttpResponse.json({ error: code, ...extra }, { status })
const validation = (fields: Record<string, string[]>) => error(400, 'validation', { fields })

function digits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

/** Uzbek numbers only, like the backend: +998 and 9 digits (9 typed digits get +998). */
function uzPhone(value: unknown): string | null {
  let number = digits(value)
  if (number.length === 9) number = `998${number}`
  return /^998\d{9}$/.test(number) ? `+${number}` : null
}

function card(business: BusinessDetail): BusinessCard {
  const { slug, name, status, logo, brand_color, tagline, created_at, links, stats, bots } = business
  return { slug, name, status, logo, brand_color, tagline, created_at, links, stats, bots }
}

function slugProblem(slug: string): string | null {
  if (!SLUG_SHAPE.test(slug)) return 'slug_invalid'
  if (backend.state.reserved.includes(slug)) return 'slug_reserved'
  if (backend.state.businesses.some((business) => business.slug === slug)) return 'slug_taken'
  return null
}

/**
 * Multipart fields (files as `{name, type, size}`). Parsed by hand: in Vitest's jsdom, Node's own parser
 * (`request.formData()`) builds parts with jsdom's File class and fails.
 */
function parseMultipart(type: string, text: string): Record<string, unknown> {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type)
  const separator = `--${boundary?.[1] ?? boundary?.[2] ?? ''}`
  const result: Record<string, unknown> = {}
  for (const part of text.split(separator)) {
    const split = part.indexOf('\r\n\r\n')
    if (split < 0) continue
    const headers = part.slice(0, split)
    const value = part.slice(split + 4).replace(/\r\n$/, '')
    const name = /name="([^"]*)"/.exec(headers)?.[1]
    if (!name) continue
    const filename = /filename="([^"]*)"/.exec(headers)?.[1]
    const contentType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1] ?? ''
    result[name] = filename === undefined ? value : { name: filename, type: contentType, size: value.length }
  }
  return result
}

async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return request.json()
  if (type.includes('multipart/form-data')) return parseMultipart(type, await request.text())
  return undefined
}

type Body = Record<string, unknown>
type Handler = (input: { body: Body; params: Record<string, string>; url: URL }) => Response | Promise<Response>

/** Records the request, then applies the API rules: CSRF on unsafe methods, a session unless `open`. */
function route(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, handler: Handler, { open = false } = {}) {
  return http[method](`/api/v1${path}`, async ({ request, params }) => {
    const url = new URL(request.url)
    const body = await readBody(request.clone())
    backend.state.requests.push({
      method: request.method,
      path: url.pathname,
      search: url.searchParams,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
    if (method !== 'get' && request.headers.get('x-csrftoken') !== backend.state.csrf) {
      return error(403, 'csrf_failed')
    }
    if (!open && !backend.state.session) return error(401, 'auth_required')
    return handler({ body: (body ?? {}) as Body, params: params as Record<string, string>, url })
  })
}

function withBusiness(handler: (business: BusinessDetail, input: Parameters<Handler>[0]) => Response | Promise<Response>): Handler {
  return (input) => {
    const business = backend.state.businesses.find((each) => each.slug === input.params.slug)
    return business ? handler(business, input) : error(404, 'not_found')
  }
}

/** A coordinate as JSON or multipart sends it; null when missing or not a number. */
function coordinate(value: unknown): number | null {
  const number = value === null || value === undefined || value === '' ? NaN : Number(value)
  return Number.isFinite(number) ? number : null
}

function profileErrors(body: Body, { create }: { create: boolean }): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  if ((create || 'name' in body) && !String(body.name ?? '').trim()) fields.name = ['blank']
  // A business opens with its place on the map; a point always comes as both coordinates.
  if (create && !String(body.address ?? '').trim()) fields.address = ['required']
  for (const [field, other] of [['lat', 'lng'], ['lng', 'lat']] as const) {
    if ((create || other in body) && coordinate(body[field]) === null) fields[field] = ['required']
  }
  if ('brand_color' in body && body.brand_color !== '' && !/^#[0-9a-f]{6}$/.test(String(body.brand_color))) {
    fields.brand_color = ['invalid']
  }
  if ('min_order' in body && !/^\d+$/.test(String(body.min_order))) fields.min_order = ['invalid']
  else if (Number(body.min_order) > 100_000_000) fields.min_order = ['max_value']
  return fields
}

function applyProfile(business: BusinessDetail, body: Body) {
  for (const field of ['name', 'tagline', 'support_phone', 'delivery_time', 'brand_color'] as const) {
    if (field in body) business[field] = String(body[field])
  }
  if ('min_order' in body) business.min_order = Number(body.min_order)
  if ('address' in body) business.address = String(body.address)
  if ('lat' in body) business.lat = coordinate(body.lat)
  if ('lng' in body) business.lng = coordinate(body.lng)
  // A file sets the logo; `logo: null` (JSON) or an empty multipart field removes it.
  const logo = body.logo as { name?: string } | string | null | undefined
  if (logo === null || logo === '') business.logo = null
  else if (typeof logo === 'object' && logo.name) {
    business.logo = `/media/${business.slug.replace(/-/g, '_')}/logos/${logo.name}`
  }
}

function mobileApp(): MobileApp {
  const business = backend.state.businesses.find((each) => each.slug === backend.state.mobileApp) ?? null
  const shown = business?.status === 'active' ? business : null
  return {
    business: business && card(business),
    updated_at: '2026-10-05T10:00:00+05:00',
    config: {
      shop: shown && {
        slug: shown.slug,
        name: shown.name,
        tagline: shown.tagline,
        logo: shown.logo && `https://deliveryhub.${DOMAIN}${shown.logo}`,
        brand_color: shown.brand_color,
        url: shown.links.shop,
      },
      min_version: '1.0.0',
      store: { android: null, ios: null },
    },
  }
}

export const handlers = [
  // --- auth -------------------------------------------------------------------------------------------------
  route(
    'get',
    '/auth/csrf',
    () => {
      document.cookie = `csrftoken=${backend.state.csrf}; path=/`
      return new HttpResponse(null, { status: 204 })
    },
    { open: true },
  ),
  route(
    'post',
    '/auth/login',
    ({ body }) => {
      const account = backend.state.accounts.find(
        (each) => digits(each.phone) === uzPhone(body.phone)?.slice(1) && each.password === body.password,
      )
      if (!account) return error(400, 'invalid_credentials')
      backend.state.session = account.user
      // Django rotates the CSRF token on login.
      backend.state.csrf = 'csrf-token-2'
      document.cookie = `csrftoken=${backend.state.csrf}; path=/`
      return HttpResponse.json({ user: account.user })
    },
    { open: true },
  ),
  route('get', '/auth/me', () => HttpResponse.json({ user: backend.state.session })),
  route(
    'post',
    '/auth/logout',
    () => {
      backend.state.session = null
      return new HttpResponse(null, { status: 204 })
    },
    { open: true },
  ),

  // --- businesses -------------------------------------------------------------------------------------------
  route('get', '/businesses', () => {
    const all = backend.state.businesses
    return HttpResponse.json({
      totals: {
        businesses: all.length,
        active: all.filter((business) => business.status === 'active').length,
        orders_today: all.reduce((sum, business) => sum + business.stats.orders_today, 0),
        revenue_today: all.reduce((sum, business) => sum + business.stats.revenue_today, 0),
      },
      results: all.map(card),
    })
  }),
  route('get', '/businesses/check-slug', ({ url }) => {
    const problem = slugProblem(url.searchParams.get('slug') ?? '')
    return HttpResponse.json(problem ? { available: false, error: problem } : { available: true })
  }),
  route('post', '/businesses', ({ body }) => {
    const slug = String(body.slug ?? '')
    const fields = profileErrors(body, { create: true })
    const slugError = slugProblem(slug)
    if (slugError) fields.slug = [slugError]
    if (!String(body.owner_name ?? '').trim()) fields.owner_name = ['blank']
    const ownerPhone = uzPhone(body.owner_phone)
    if (!ownerPhone) fields.owner_phone = ['invalid']
    const ownerPassword = String(body.owner_password ?? '')
    if (ownerPassword && ownerPassword.length < 8) fields.owner_password = ['min_length']
    if (Object.keys(fields).length > 0) return validation(fields)

    const business: BusinessDetail = {
      slug,
      name: String(body.name),
      status: 'active',
      logo: null,
      brand_color: '',
      tagline: '',
      created_at: '2026-10-02T12:00:00+05:00',
      links: { shop: `https://${slug}.${DOMAIN}/`, admin: `https://${slug}-admin.${DOMAIN}/` },
      stats: { orders_today: 0, revenue_today: 0, orders_total: 0, customers: 0 },
      bots: { client: null, admin: null },
      support_phone: '',
      address: '',
      lat: null,
      lng: null,
      working_hours: { week: null, timezone: 'Asia/Tashkent', open: true, opens_at: null, closes_at: null },
      delivery_time: '30–45',
      min_order: 0,
      owner: { name: String(body.owner_name), phone: ownerPhone ?? '' },
      platform_bot: backend.state.platformBot,
      missing_roles: ['client', 'admin'],
    }
    applyProfile(business, body)
    backend.state.businesses.unshift(business)
    const password = ownerPassword || 'Gen-3rated-Pw'
    return HttpResponse.json({ business, credentials: { phone: ownerPhone, password } }, { status: 201 })
  }),
  route('get', '/businesses/:slug', withBusiness((business) => HttpResponse.json(business))),
  route(
    'delete',
    '/businesses/:slug',
    withBusiness((business, { body }) => {
      if (business.status === 'active') return error(409, 'business_active')
      if (String(body.confirm ?? '').trim() !== business.slug) return error(400, 'confirmation_required')
      backend.state.businesses = backend.state.businesses.filter((each) => each.slug !== business.slug)
      return new HttpResponse(null, { status: 204 })
    }),
  ),
  route(
    'patch',
    '/businesses/:slug',
    withBusiness((business, { body }) => {
      const fields = profileErrors(body, { create: false })
      if (Object.keys(fields).length > 0) return validation(fields)
      applyProfile(business, body)
      return HttpResponse.json(business)
    }),
  ),
  route(
    'post',
    '/businesses/:slug/status',
    withBusiness((business, { body }) => {
      if (body.status !== 'active' && body.status !== 'suspended') return validation({ status: ['invalid'] })
      business.status = body.status
      return HttpResponse.json(business)
    }),
  ),
  route(
    'post',
    '/businesses/:slug/owner-password',
    withBusiness((business) =>
      business.owner
        ? HttpResponse.json({ phone: business.owner.phone, password: 'Fresh-Pass-42' })
        : error(400, 'owner_missing'),
    ),
  ),

  // --- map ------------------------------------------------------------------------------------------------
  route('get', '/geo/reverse', () =>
    backend.state.geo.down ? error(503, 'geocoder_unavailable') : HttpResponse.json({ address: backend.state.geo.address }),
  ),
  route('get', '/geo/search', () =>
    backend.state.geo.down ? error(503, 'geocoder_unavailable') : HttpResponse.json({ results: backend.state.geo.places }),
  ),

  // --- bots -------------------------------------------------------------------------------------------------
  route(
    'post',
    '/businesses/:slug/bots/setup-link',
    withBusiness((business) => {
      const platformBot = backend.state.platformBot
      if (!platformBot) return error(400, 'platform_bot_missing')
      return HttpResponse.json({
        url: `https://t.me/${platformBot.username}?start=setup_${business.slug.replace(/-/g, '')}`,
        qr_svg: '<svg viewBox="0 0 29 29" class="segno"><path d="M2 2h7v7h-7z" stroke="#0f172a"/></svg>',
        expires_at: '2026-10-09T19:40:00+05:00',
      })
    }),
  ),
  route(
    'post',
    '/businesses/:slug/bots',
    withBusiness((business, { body }) => {
      const role = body.role as BotRole
      if (!ROLES.includes(role)) return validation({ role: ['invalid'] })
      const token = String(body.token ?? '')
      if (backend.state.botsInUse.includes(token)) return error(400, 'bot_in_use')
      const username = backend.state.telegramBots[token]
      if (!username) return error(400, 'invalid_token')
      const bot: Bot = { username, alive: false, created_via: 'token' }
      business.bots[role] = bot
      business.missing_roles = ROLES.filter((each) => !business.bots[each])
      return HttpResponse.json({ bot })
    }),
  ),
  route(
    'delete',
    '/businesses/:slug/bots/:role',
    withBusiness((business, { params }) => {
      const role = params.role as BotRole
      if (!ROLES.includes(role)) return error(404, 'not_found')
      business.bots[role] = null
      business.missing_roles = ROLES.filter((each) => !business.bots[each])
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // --- mobile app -------------------------------------------------------------------------------------------
  route('get', '/mobile-app', () => HttpResponse.json(mobileApp())),
  route('put', '/mobile-app', ({ body }) => {
    const slug = body.business === null ? null : String(body.business ?? '')
    const business = slug === null ? null : backend.state.businesses.find((each) => each.slug === slug)
    if (slug !== null && !business) return validation({ business: ['does_not_exist'] })
    if (business && business.status !== 'active') return validation({ business: ['suspended'] })
    backend.state.mobileApp = slug
    return HttpResponse.json(mobileApp())
  }),
]
