import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { resetDb } from '../mocks/data'
import { server } from './server'

// jsdom has no WebGL: the maps are replaced by a list of their places (src/test/fakeMap.tsx).
vi.mock('../components/map/MapCanvas', () => import('./fakeMap'))

// Node's fetch (undici, used by MSW) only understands its own FormData / File / Blob — jsdom's are swapped out.
const NodeFormData = (await new Response(new URLSearchParams('a=1')).formData()).constructor as typeof FormData
Object.assign(globalThis, { File: NodeFile, Blob: NodeBlob, FormData: NodeFormData })

/** Viewport width used by the `matchMedia` stub (desktop by default). */
export const viewport = { width: 1280 }

function matches(query: string): boolean {
  const min = /min-width:\s*(\d+)px/.exec(query)
  if (min) return viewport.width >= Number(min[1])
  const max = /max-width:\s*(\d+)px/.exec(query)
  if (max) return viewport.width <= Number(max[1])
  if (query.includes('pointer: fine')) return true
  return false
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub })

let objectUrls = 0
Object.assign(URL, {
  createObjectURL: vi.fn<(object: Blob) => string>(() => `blob:preview-${++objectUrls}`),
  revokeObjectURL: vi.fn<(url: string) => void>(),
})
window.scrollTo = (() => {}) as typeof window.scrollTo
Element.prototype.scrollIntoView = () => {}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  resetDb()
  viewport.width = 1280
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  delete (window as { Telegram?: unknown }).Telegram
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
