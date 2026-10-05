import { request } from './client'
import type {
  Bot,
  BotRole,
  BusinessCreated,
  BusinessCreateInput,
  BusinessDetail,
  BusinessList,
  BusinessProfilePatch,
  BusinessStatus,
  Credentials,
  Lead,
  LeadList,
  LeadPatch,
  LeadStatus,
  MobileApp,
  Place,
  PlatformUser,
  SetupLink,
  SlugCheck,
} from './types'

const business = (slug: string) => `/businesses/${encodeURIComponent(slug)}`

/** JSON, or multipart when a logo file is attached. */
function body(fields: object, logo?: File | null) {
  if (!logo) return { json: fields }
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(name, String(value))
  }
  form.append('logo', logo, logo.name)
  return { form }
}

export const authApi = {
  me: () => request<{ user: PlatformUser }>('GET', '/auth/me'),
  login: (phone: string, password: string) =>
    request<{ user: PlatformUser }>('POST', '/auth/login', { json: { phone, password } }),
  logout: () => request<void>('POST', '/auth/logout'),
}

/** Addresses ⇄ points (a Nominatim server behind our API); answers in Uzbek. */
export const geoApi = {
  reverse: (lat: number, lng: number, signal?: AbortSignal) =>
    request<{ address: string }>('GET', `/geo/reverse?lat=${lat}&lng=${lng}&lang=uz`, { signal }),
  search: (query: string, signal?: AbortSignal) =>
    request<{ results: Place[] }>('GET', `/geo/search?q=${encodeURIComponent(query)}&lang=uz`, { signal }),
}

export const businessesApi = {
  list: () => request<BusinessList>('GET', '/businesses'),
  checkSlug: (slug: string, signal?: AbortSignal) =>
    request<SlugCheck>('GET', `/businesses/check-slug?slug=${encodeURIComponent(slug)}`, { signal }),
  create: (input: BusinessCreateInput, logo?: File | null) =>
    request<BusinessCreated>('POST', '/businesses', body(input, logo)),
  get: (slug: string, signal?: AbortSignal) => request<BusinessDetail>('GET', business(slug), { signal }),
  update: (slug: string, patch: BusinessProfilePatch, logo?: File | null) =>
    request<BusinessDetail>('PATCH', business(slug), body(patch, logo)),
  setStatus: (slug: string, status: BusinessStatus) =>
    request<BusinessDetail>('POST', `${business(slug)}/status`, { json: { status } }),
  /** Deletes a suspended business for good; `confirm` is its slug, typed by hand. */
  remove: (slug: string, confirm: string) => request<void>('DELETE', business(slug), { json: { confirm } }),
  newOwnerPassword: (slug: string) => request<Credentials>('POST', `${business(slug)}/owner-password`),
  setupLink: (slug: string) => request<SetupLink>('POST', `${business(slug)}/bots/setup-link`),
  connectBot: (slug: string, role: BotRole, token: string) =>
    request<{ bot: Bot }>('POST', `${business(slug)}/bots`, { json: { role, token } }),
  disconnectBot: (slug: string, role: BotRole) => request<void>('DELETE', `${business(slug)}/bots/${role}`),
}

/** Which business our mobile app opens (the app asks on every start). */
export const mobileAppApi = {
  get: () => request<MobileApp>('GET', '/mobile-app'),
  set: (business: string | null) => request<MobileApp>('PUT', '/mobile-app', { json: { business } }),
}

interface LeadsQuery {
  /** Left out or null — all of them. */
  status?: LeadStatus | null
  page?: number
  pageSize: number
}

/** Applications from the form of our landing page, newest first. */
export const leadsApi = {
  list: ({ status, page, pageSize }: LeadsQuery, signal?: AbortSignal) => {
    const query = new URLSearchParams()
    if (status) query.set('status', status)
    if (page) query.set('page', String(page))
    query.set('page_size', String(pageSize))
    return request<LeadList>('GET', `/leads?${query}`, { signal })
  },
  update: (id: number, patch: LeadPatch) => request<Lead>('PATCH', `/leads/${id}`, { json: patch }),
}
