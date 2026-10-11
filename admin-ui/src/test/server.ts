import { http } from 'msw'
import { setupServer } from 'msw/node'
import { handlers } from '../mocks/handlers'

export const server = setupServer(...handlers)

export interface RecordedRequest {
  url: URL
  method: string
  headers: Headers
  /** Parsed JSON, a FormData for multipart, or null. */
  body: unknown
}

/**
 * Records the requests to one endpoint and lets them through to the mock API
 * (an MSW resolver that returns nothing falls through to the next handler).
 */
export function recordRequests(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string): RecordedRequest[] {
  const calls: RecordedRequest[] = []
  server.use(
    http[method](path, async ({ request }) => {
      const clone = request.clone()
      const type = clone.headers.get('content-type') ?? ''
      let body: unknown = null
      if (type.includes('application/json')) body = await clone.json()
      else if (type.includes('multipart/form-data')) body = await clone.formData()
      calls.push({ url: new URL(request.url), method: request.method, headers: request.headers, body })
      return undefined
    }),
  )
  return calls
}
