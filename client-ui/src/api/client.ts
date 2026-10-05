/**
 * A tiny fetch wrapper for the Shop API. Every call goes to `/api/v1/...` on the page's own host —
 * the host selects the business. Errors become `ApiError` with the `error` code of the response.
 */

export interface ApiErrorBody {
  error?: string
  fields?: Record<string, string[] | string>
  retry_after?: number
  attempts_left?: number
  min_order?: number
  detail?: unknown
  [key: string]: unknown
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly data: ApiErrorBody

  constructor(code: string, status: number, data: ApiErrorBody = {}) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.data = data
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Bearer token of the signed-in customer. */
  token?: string | null
  query?: Record<string, string | number | undefined>
  signal?: AbortSignal
  headers?: Record<string, string>
  /** A request that hangs on a bad mobile network gives up after this long (a `network` error). */
  timeoutMs?: number
}

const TIMEOUT_MS = 20_000

type UnauthorizedListener = (token: string) => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

/** Called with the rejected token whenever an authenticated request gets 401. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

export function apiUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`/api/v1/${path.replace(/^\/+/, '')}`, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, query, signal, timeoutMs = TIMEOUT_MS } = options
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  // The caller's signal still cancels; the timer only turns an endless wait into an error the UI can show.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel)
  let response: Response
  try {
    response = await fetch(apiUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal?.aborted ? signal : controller.signal,
    })
  } catch (error) {
    if (signal?.aborted && error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('network', 0)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }

  let data: unknown = null
  if (response.status !== 204) {
    const text = await response.text().catch(() => '')
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
  }

  if (!response.ok) {
    const errorBody = (data && typeof data === 'object' ? data : {}) as ApiErrorBody
    const code = typeof errorBody.error === 'string' ? errorBody.error : `http_${response.status}`
    if (response.status === 401 && token) unauthorizedListeners.forEach((listener) => listener(token))
    throw new ApiError(code, response.status, errorBody)
  }
  return data as T
}
