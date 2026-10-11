/* Same-origin JSON client for /api/v1 — session cookie + CSRF (docs/api.md → Authentication). */

export const API_BASE = '/api/v1'
const CSRF_COOKIE = 'csrftoken'
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

type ErrorBody = Record<string, unknown> & { error?: unknown; fields?: unknown }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly data: ErrorBody

  constructor(status: number, code: string, data: ErrorBody = {}) {
    super(`${status} ${code}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.data = data
  }

  /** Field errors of a `validation` error: `{"phone": ["required"]}`. */
  get fields(): Record<string, string[]> {
    const fields = this.data.fields
    if (!fields || typeof fields !== 'object') return {}
    const result: Record<string, string[]> = {}
    for (const [name, value] of Object.entries(fields as Record<string, unknown>)) {
      const list = Array.isArray(value) ? value : [value]
      result[name] = list.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    }
    return result
  }

  get retryAfter(): number | null {
    const value = Number(this.data.retry_after)
    return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

// ------------------------------------------------------------------ app-wide events
export type ApiEvent = { type: 'unauthorized' } | { type: 'suspended' }
const listeners = new Set<(event: ApiEvent) => void>()

export function onApiEvent(listener: (event: ApiEvent) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(event: ApiEvent) {
  listeners.forEach((listener) => listener(event))
}

// ------------------------------------------------------------------ language
let language = 'uz'

/** The interface language is sent as Accept-Language (e.g. for the AI reply of /voice/parse). */
export function setApiLanguage(lang: string) {
  language = lang
}

// ------------------------------------------------------------------ CSRF
export function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

let csrfRequest: Promise<void> | null = null

/** `GET /auth/csrf` sets the `csrftoken` cookie; it is only requested when the cookie is missing (or `force`). */
export function ensureCsrf(force = false): Promise<void> {
  if (!force && readCookie(CSRF_COOKIE)) return Promise.resolve()
  csrfRequest ??= fetch(`${API_BASE}/auth/csrf`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
    .then((response) => {
      if (!response.ok) throw new ApiError(response.status, `http_${response.status}`)
    })
    .catch((error: unknown) => {
      throw error instanceof ApiError ? error : new ApiError(0, 'network')
    })
    .finally(() => {
      csrfRequest = null
    })
  return csrfRequest
}

// ------------------------------------------------------------------ requests
export type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue>

export interface RequestOptions {
  query?: Query
  /** JSON body. */
  json?: unknown
  /** multipart/form-data body (file uploads). */
  form?: FormData
  signal?: AbortSignal
  /** Do not treat 401 as "session expired" (session probe, login). */
  quiet401?: boolean
}

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const search = params.toString()
  return `${API_BASE}${path}${search ? `?${search}` : ''}`
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  return send<T>(method.toUpperCase(), path, options, false)
}

async function send<T>(method: string, path: string, options: RequestOptions, retried: boolean): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': language }
  let body: BodyInit | undefined
  if (options.form) {
    body = options.form
  } else if (options.json !== undefined) {
    body = JSON.stringify(options.json)
    headers['Content-Type'] = 'application/json'
  }

  if (UNSAFE_METHODS.has(method)) {
    await ensureCsrf()
    const token = readCookie(CSRF_COOKIE)
    if (token) headers['X-CSRFToken'] = token
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'network')
  }

  if (response.status === 204) return undefined as T
  const data = await readBody(response)
  if (response.ok) return data as T

  const errorBody: ErrorBody = data && typeof data === 'object' ? (data as ErrorBody) : {}
  const code = typeof errorBody.error === 'string' ? errorBody.error : `http_${response.status}`

  // A stale/rotated CSRF cookie: fetch a fresh one and repeat the request once.
  if (response.status === 403 && code === 'csrf_failed' && !retried) {
    await ensureCsrf(true)
    return send<T>(method, path, options, true)
  }
  if (response.status === 401 && !options.quiet401) emit({ type: 'unauthorized' })
  if (response.status === 503 && code === 'business_suspended') emit({ type: 'suspended' })
  throw new ApiError(response.status, code, errorBody)
}

export const api = {
  get: <T>(path: string, query?: Query, options?: Omit<RequestOptions, 'query' | 'json' | 'form'>) =>
    request<T>('GET', path, { ...options, query }),
  post: <T>(path: string, json?: unknown, options?: Omit<RequestOptions, 'json'>) =>
    request<T>('POST', path, { ...options, json }),
  patch: <T>(path: string, json?: unknown, options?: Omit<RequestOptions, 'json'>) =>
    request<T>('PATCH', path, { ...options, json }),
  put: <T>(path: string, json?: unknown, options?: Omit<RequestOptions, 'json'>) =>
    request<T>('PUT', path, { ...options, json }),
  delete: <T = void>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
  upload: <T>(method: 'POST' | 'PATCH', path: string, form: FormData) => request<T>(method, path, { form }),
}
