import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { resetTelegramForTests } from '../lib/telegram'
import { resetDb } from './handlers'
import { server } from './server'

// --- jsdom gaps ----------------------------------------------------------------------------------
// No WebGL: the map is a stand-in with a "move the map" button.
vi.mock('../components/map/MapCanvas', () => import('./fakeMap'))
// Reduced motion: sheets and toasts unmount without waiting for exit animations.
window.matchMedia = (query: string) =>
  ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList
window.scrollTo = (() => {}) as typeof window.scrollTo
Element.prototype.scrollIntoView = () => {}
Element.prototype.scrollTo = (() => {}) as typeof Element.prototype.scrollTo
window.open = (() => null) as typeof window.open
class NoopIntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
window.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver

// --- MSW -----------------------------------------------------------------------------------------
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetDb()
  localStorage.clear()
  sessionStorage.clear()
  resetTelegramForTests()
  delete window.Telegram
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.lang = ''
  document.title = ''
})
afterAll(() => server.close())
