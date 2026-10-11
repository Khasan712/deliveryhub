/* Admin API endpoints (docs/api.md → Admin API). */
import { api, ensureCsrf, request } from './client'
import type {
  Branch,
  BranchInput,
  Category,
  ClientDetail,
  ClientSummary,
  ClientUpdate,
  DashboardData,
  MeResponse,
  NamePair,
  OrderDetail,
  OrderStatus,
  OrderSummary,
  OrdersQuery,
  Paginated,
  Place,
  Product,
  ProductsQuery,
  SaleCreate,
  SaleCreateResponse,
  SalesData,
  StaffUser,
  StaffUserInput,
  TelegramData,
  TelegramInvite,
  TelegramLink,
  Unit,
  VoiceParseResponse,
  VoiceState,
  VoiceToken,
  Week,
  WorkingHours,
} from './types'

export const authApi = {
  csrf: () => ensureCsrf(true),
  me: () => api.get<MeResponse>('/auth/me', undefined, { quiet401: true }),
  /** Returns the same body as /auth/me; the server rotates the csrftoken cookie. */
  login: async (phone: string, password: string) => {
    await ensureCsrf(true)
    return api.post<MeResponse>('/auth/login', { phone, password }, { quiet401: true })
  },
  logout: () => api.post<void>('/auth/logout', undefined, { quiet401: true }),
  telegram: (initData: string) => api.post<MeResponse>('/auth/telegram', { init_data: initData }, { quiet401: true }),
}

export const dashboardApi = {
  get: () => api.get<DashboardData>('/dashboard'),
}

/** Working hours: every staff member reads them, only the admin role changes them (others get 403). */
export const businessApi = {
  get: () => api.get<WorkingHours>('/business'),
  /** `week: null` — no hours: the shop takes orders at any time. */
  setWeek: (week: Week | null) => api.patch<WorkingHours>('/business', { week }),
}

export const ordersApi = {
  list: (query: OrdersQuery) => api.get<Paginated<OrderSummary>>('/orders', { ...query }),
  get: (id: number | string) => api.get<OrderDetail>(`/orders/${id}`),
  setStatus: (id: number | string, status: OrderStatus) => api.patch<OrderDetail>(`/orders/${id}`, { status }),
  /** The head office sends the order to a branch (or moves it to another one); the staff bot tells that branch. */
  setBranch: (id: number | string, branchId: number) =>
    api.put<OrderDetail>(`/orders/${id}/branch`, { branch_id: branchId }),
}

/** Branches (only with branches on — `403 branches_disabled` otherwise); changes — the admin role. */
export const branchesApi = {
  list: () => api.get<Branch[]>('/branches'),
  get: (id: number | string) => api.get<Branch>(`/branches/${id}`),
  create: (body: BranchInput) => api.post<Branch>('/branches', body),
  update: (id: number | string, body: Partial<BranchInput>) => api.patch<Branch>(`/branches/${id}`, body),
  /** `409 branch_in_use` while it has orders or staff (deactivate it instead). */
  remove: (id: number | string) => api.delete(`/branches/${id}`),
}

/** Addresses ⇄ points for the branch form's map (a Nominatim server behind our API). */
export const geoApi = {
  reverse: (lat: number, lng: number, lang: 'uz' | 'ru', signal?: AbortSignal) =>
    request<{ address: string }>('GET', '/geo/reverse', { query: { lat, lng, lang }, signal }),
  search: (query: string, lang: 'uz' | 'ru', signal?: AbortSignal) =>
    request<{ results: Place[] }>('GET', '/geo/search', { query: { q: query, lang }, signal }),
}

export const clientsApi = {
  list: (query: { search?: string; page?: number; page_size?: number }) =>
    api.get<Paginated<ClientSummary>>('/clients', { ...query }),
  get: (id: number | string) => api.get<ClientDetail>(`/clients/${id}`),
  update: (id: number | string, body: Partial<ClientUpdate>) => api.patch<ClientSummary>(`/clients/${id}`, body),
}

export const productsApi = {
  list: (query: ProductsQuery) => api.get<Paginated<Product>>('/products', { ...query }),
  get: (id: number | string) => api.get<Product>(`/products/${id}`),
  /** JSON, or multipart when an image file is attached. */
  create: (body: Record<string, unknown> | FormData) =>
    body instanceof FormData ? api.upload<Product>('POST', '/products', body) : api.post<Product>('/products', body),
  update: (id: number | string, body: Record<string, unknown> | FormData) =>
    body instanceof FormData
      ? api.upload<Product>('PATCH', `/products/${id}`, body)
      : api.patch<Product>(`/products/${id}`, body),
  /** Freeze (sold out for now) or return to sale — any staff member. */
  setFrozen: (id: number, frozen: boolean) => api.patch<Product>(`/products/${id}`, { frozen }),
  remove: (id: number | string) => api.delete(`/products/${id}`),
}

export const categoriesApi = {
  list: (search?: string) => api.get<Category[]>('/categories', { search }),
  get: (id: number) => api.get<Category>(`/categories/${id}`),
  create: (body: NamePair) => api.post<Category>('/categories', body),
  update: (id: number, body: NamePair) => api.patch<Category>(`/categories/${id}`, body),
  remove: (id: number) => api.delete(`/categories/${id}`),
}

export const unitsApi = {
  list: () => api.get<Unit[]>('/units'),
  create: (body: NamePair) => api.post<Unit>('/units', body),
}

export const usersApi = {
  list: (query: { search?: string; page?: number; page_size?: number }) =>
    api.get<Paginated<StaffUser>>('/users', { ...query }),
  get: (id: number | string) => api.get<StaffUser>(`/users/${id}`),
  create: (body: StaffUserInput) => api.post<StaffUser>('/users', body),
  update: (id: number | string, body: Partial<StaffUserInput>) => api.patch<StaffUser>(`/users/${id}`, body),
  remove: (id: number | string) => api.delete(`/users/${id}`),
}

export const salesApi = {
  get: () => api.get<SalesData>('/sales'),
  create: (body: SaleCreate) => api.post<SaleCreateResponse>('/sales', body),
}

/** `lang` is the language of the AI `reply`. */
export const voiceApi = {
  token: () => api.post<VoiceToken>('/voice/token'),
  parseText: (text: string, state: VoiceState, lang: 'uz' | 'ru') =>
    api.post<VoiceParseResponse>('/voice/parse', { text, state, lang }),
  parseAudio: (audio: Blob, fileName: string, state: VoiceState, liveText: string, lang: 'uz' | 'ru') => {
    const form = new FormData()
    form.append('audio', audio, fileName)
    form.append('state', JSON.stringify(state))
    if (liveText) form.append('live_text', liveText)
    form.append('lang', lang)
    return request<VoiceParseResponse>('POST', '/voice/parse', { form })
  },
}

export const telegramApi = {
  get: () => api.get<TelegramData>('/telegram'),
  invite: (userId?: number) =>
    api.post<TelegramInvite>('/telegram/invites', userId === undefined ? {} : { user_id: userId }),
  setNotify: (id: number, notify: boolean) =>
    api.patch<TelegramLink | undefined>(`/telegram/links/${id}`, { notify_orders: notify }),
  unlink: (id: number) => api.delete(`/telegram/links/${id}`),
}
